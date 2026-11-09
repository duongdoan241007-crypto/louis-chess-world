"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  KeyRound,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

type RecoveryStep = "login" | "email" | "otp";

function friendlyAuthError(message: string) {
  const value = message.toLowerCase();

  if (value.includes("invalid login credentials")) {
    return "Email hoặc mật khẩu chưa chính xác. Hãy kiểm tra lại tài khoản.";
  }
  if (value.includes("email not confirmed")) {
    return "Email giáo viên chưa được xác nhận trong Supabase.";
  }
  if (value.includes("too many requests")) {
    return "Bạn đã thử quá nhiều lần. Hãy đợi vài phút rồi thử lại.";
  }
  if (
    value.includes("fetch") ||
    value.includes("network") ||
    value.includes("timeout")
  ) {
    return "Không kết nối được Supabase. Hãy kiểm tra cấu hình máy chủ.";
  }

  return "Đăng nhập chưa thành công. Hãy kiểm tra lại thông tin và thử lại.";
}

function friendlyRecoveryError(message: string) {
  const value = message.toLowerCase();

  if (
    value.includes("expired") ||
    value.includes("invalid") ||
    value.includes("token")
  ) {
    return "Mã OTP không đúng hoặc đã hết hạn. Hãy kiểm tra email và thử lại.";
  }
  if (
    value.includes("rate") ||
    value.includes("too many") ||
    value.includes("limit")
  ) {
    return "Bạn đã yêu cầu mã quá nhiều lần. Hãy đợi vài phút rồi thử lại.";
  }
  if (value.includes("smtp") || value.includes("email")) {
    return "Không gửi được email. Hãy kiểm tra cấu hình SMTP trong Supabase.";
  }

  return "Có lỗi xảy ra. Hãy thử lại. Nếu vẫn lỗi, kiểm tra nhật ký Supabase.";
}

export default function LoginPage() {
  const router = useRouter();

  const [mode, setMode] = useState<"student" | "teacher">("student");
  const [recoveryStep, setRecoveryStep] = useState<RecoveryStep>("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [studentCode, setStudentCode] = useState("");
  const [pin, setPin] = useState("");

  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [recoveryVerified, setRecoveryVerified] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function handleTeacherLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    setError("");
    setNotice("");

    const supabase = getSupabase();

    if (!supabase) {
      setError(
        "Chưa cấu hình Supabase. Hãy kiểm tra NEXT_PUBLIC_SUPABASE_URL và NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY trong Vercel."
      );
      return;
    }

    setLoading(true);

    try {
      const signInResult = await Promise.race([
        supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        }),
        new Promise<never>((_, reject) =>
          window.setTimeout(() => reject(new Error("timeout")), 15000)
        ),
      ]);

      const { data, error: loginError } = signInResult;

      if (loginError || !data.user) {
        setError(
          friendlyAuthError(loginError?.message ?? "Missing user")
        );
        return;
      }

      const profileResult = await Promise.race([
        supabase
          .from("profiles")
          .select("role,is_active")
          .eq("id", data.user.id)
          .maybeSingle(),
        new Promise<never>((_, reject) =>
          window.setTimeout(() => reject(new Error("timeout")), 15000)
        ),
      ]);

      const { data: profile, error: profileError } = profileResult;

      if (profileError) {
        console.error("Teacher profile lookup failed:", profileError);
        await supabase.auth.signOut();
        setError(
          "Đăng nhập Supabase thành công nhưng không đọc được hồ sơ giáo viên. Hãy kiểm tra bảng profiles và chính sách RLS."
        );
        return;
      }

      if (!profile || profile.role !== "teacher" || !profile.is_active) {
        await supabase.auth.signOut();
        setError(
          "Tài khoản chưa được cấp quyền giáo viên hoặc đang bị khóa. Hãy kiểm tra public.profiles trong Supabase."
        );
        return;
      }

      router.replace("/teacher");
      router.refresh();
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "unknown";
      console.error("Teacher sign-in failed:", caught);
      setError(friendlyAuthError(message));
    } finally {
      setLoading(false);
    }
  }

  async function handleStudentLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    setError("");
    setNotice("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/student-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentCode: studentCode.trim(),
          pin,
        }),
      });

      const result = (await response.json()) as {
        error?: string;
        session?: {
          access_token: string;
          refresh_token: string;
        };
      };

      if (!response.ok || !result.session) {
        throw new Error(result.error || "Không thể đăng nhập.");
      }

      const supabase = getSupabase();
      if (!supabase) throw new Error("Chưa cấu hình Supabase.");

      const { error: sessionError } = await supabase.auth.setSession(
        result.session
      );

      if (sessionError) {
        throw new Error("Không tạo được phiên đăng nhập. Hãy thử lại.");
      }

      router.replace("/student");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Đã có lỗi xảy ra. Hãy thử lại."
      );
    } finally {
      setLoading(false);
    }
  }

  // Gửi mã OTP đặt lại mật khẩu qua email.
  async function sendRecoveryCode() {
    if (loading) return;

    setError("");
    setNotice("");

    const supabase = getSupabase();

    if (!supabase) {
      setError("Chưa kết nối được Supabase.");
      return;
    }

    if (!recoveryEmail.trim()) {
      setError("Vui lòng nhập email giáo viên.");
      return;
    }

    setLoading(true);

    try {
      const { error: sendError } =
        await supabase.auth.resetPasswordForEmail(
          recoveryEmail.trim()
        );

      if (sendError) throw sendError;

      setRecoveryVerified(false);
      setOtp("");
      setRecoveryStep("otp");
      setNotice(
        "Mã xác nhận đã được gửi đến email của bạn. Hãy kiểm tra hộp thư đến và cả mục Spam."
      );
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "unknown";
      console.error("Send recovery code failed:", caught);
      setError(friendlyRecoveryError(message));
    } finally {
      setLoading(false);
    }
  }

  async function handleSendRecoveryCode(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    await sendRecoveryCode();
  }

  // Xác minh OTP và cập nhật mật khẩu mới.
  async function handleResetPassword(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (loading) return;

    setError("");
    setNotice("");

    if (!/^\d{6}$/.test(otp)) {
      setError("Mã OTP phải gồm đúng 6 chữ số.");
      return;
    }

    if (newPassword.length < 8) {
      setError("Mật khẩu mới phải có ít nhất 8 ký tự.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp.");
      return;
    }

    const supabase = getSupabase();

    if (!supabase) {
      setError("Chưa kết nối được Supabase.");
      return;
    }

    setLoading(true);

    try {
      // Chỉ xác minh OTP một lần.
      if (!recoveryVerified) {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          email: recoveryEmail.trim(),
          token: otp,
          type: "recovery",
        });

        if (verifyError) throw verifyError;

        setRecoveryVerified(true);
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) throw updateError;

      await supabase.auth.signOut();

      setEmail(recoveryEmail.trim());
      setPassword("");
      setOtp("");
      setNewPassword("");
      setConfirmPassword("");
      setRecoveryVerified(false);
      setRecoveryStep("login");

      setNotice(
        "Đổi mật khẩu thành công! Hãy đăng nhập bằng mật khẩu mới."
      );
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "unknown";
      console.error("Password recovery failed:", caught);
      setError(friendlyRecoveryError(message));
    } finally {
      setLoading(false);
    }
  }

  function backToTeacherLogin() {
    setRecoveryStep("login");
    setError("");
    setNotice("");
    setOtp("");
    setNewPassword("");
    setConfirmPassword("");
    setRecoveryVerified(false);
  }

  function changeMode(nextMode: "student" | "teacher") {
    setMode(nextMode);
    setRecoveryStep("login");
    setError("");
    setNotice("");
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <a className="auth-back" href="/">
          <ArrowLeft size={15} /> Về bản xem thử
        </a>

        <div className="auth-brand">
          <span>♞</span>
          <div>
            <b>VƯƠNG QUỐC</b>
            <strong>64 Ô</strong>
          </div>
        </div>

        <div className="auth-title">
          <span className="eyebrow">CHÀO MỪNG TRỞ LẠI</span>
          <h1>
            Mở cánh cửa
            <br />
            vào thế giới cờ vua!
          </h1>
          <p>Đăng nhập để tiếp tục hành trình của mình.</p>
        </div>

        {!isSupabaseConfigured ? (
          <div className="auth-notice">
            <ShieldCheck size={20} />
            <div>
              <b>Chế độ tài khoản chưa được bật</b>
              <p>
                Thầy cần tạo Supabase project và điền biến môi trường
                theo hướng dẫn trước khi sử dụng đăng nhập thật.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="auth-tabs">
              <button
                type="button"
                className={mode === "student" ? "active" : ""}
                onClick={() => changeMode("student")}
              >
                Em là học viên
              </button>

              <button
                type="button"
                className={mode === "teacher" ? "active" : ""}
                onClick={() => changeMode("teacher")}
              >
                Thầy / Cô giáo
              </button>
            </div>

            {mode === "student" ? (
              <form
                className="auth-form"
                onSubmit={handleStudentLogin}
              >
                <label>
                  Mã học viên
                  <input
                    autoCapitalize="characters"
                    autoComplete="username"
                    value={studentCode}
                    onChange={(event) =>
                      setStudentCode(event.target.value.toUpperCase())
                    }
                    placeholder="Ví dụ: K7M4P9Q"
                    required
                    minLength={6}
                    maxLength={10}
                  />
                </label>

                <label>
                  Mã PIN 8 chữ số
                  <input
                    inputMode="numeric"
                    autoComplete="current-password"
                    value={pin}
                    onChange={(event) =>
                      setPin(
                        event.target.value.replace(/\D/g, "").slice(0, 8)
                      )
                    }
                    placeholder="Nhập mã PIN của em"
                    required
                    minLength={8}
                    maxLength={8}
                  />
                </label>

                <p className="auth-helper">
                  <KeyRound size={14} />
                  Mã đăng nhập do giáo viên cấp. Nếu quên, hãy nhờ thầy cấp lại.
                </p>

                <button
                  type="submit"
                  className="auth-submit"
                  disabled={loading}
                >
                  {loading ? "Đang đăng nhập..." : "Vào cuộc phiêu lưu"}
                  <Sparkles size={17} />
                </button>
              </form>
            ) : recoveryStep === "login" ? (
              <form
                className="auth-form"
                onSubmit={handleTeacherLogin}
              >
                <label>
                  Email giáo viên
                  <input
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="teacher@example.com"
                    required
                  />
                </label>

                <label>
                  Mật khẩu
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Mật khẩu tài khoản"
                    required
                  />
                </label>

                <button
                  type="button"
                  onClick={() => {
                    setRecoveryEmail(email);
                    setRecoveryStep("email");
                    setError("");
                    setNotice("");
                  }}
                  style={{
                    display: "block",
                    border: 0,
                    background: "transparent",
                    padding: "0",
                    margin: "0 0 8px auto",
                    color: "#4361ee",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: 600,
                  }}
                >
                  Quên mật khẩu?
                </button>

                <p className="auth-helper">
                  <ShieldCheck size={14} />
                  Tài khoản giáo viên được tạo và cấp quyền trong Supabase.
                </p>

                <button
                  type="submit"
                  className="auth-submit"
                  disabled={loading}
                >
                  {loading
                    ? "Đang kiểm tra tài khoản..."
                    : "Mở Teacher Studio"}
                  <BookOpen size={17} />
                </button>
              </form>
            ) : recoveryStep === "email" ? (
              <form
                className="auth-form"
                onSubmit={handleSendRecoveryCode}
              >
                <h3>Khôi phục mật khẩu</h3>
                <p>
                  Nhập email giáo viên. Chúng tôi sẽ gửi mã OTP 6 chữ số
                  để xác nhận.
                </p>

                <label>
                  Email giáo viên
                  <input
                    type="email"
                    autoComplete="email"
                    value={recoveryEmail}
                    onChange={(event) =>
                      setRecoveryEmail(event.target.value)
                    }
                    placeholder="Nhập email đã đăng ký"
                    required
                  />
                </label>

                <button
                  type="submit"
                  className="auth-submit"
                  disabled={loading}
                >
                  {loading ? "Đang gửi mã..." : "Gửi mã OTP"}
                  <KeyRound size={17} />
                </button>

                <button
                  type="button"
                  onClick={backToTeacherLogin}
                  style={{
                    display: "block",
                    margin: "12px auto 0",
                    border: 0,
                    background: "transparent",
                    color: "#4361ee",
                    cursor: "pointer",
                    fontSize: "14px",
                  }}
                >
                  Quay lại đăng nhập
                </button>
              </form>
            ) : (
              <form
                className="auth-form"
                onSubmit={handleResetPassword}
              >
                <h3>Đặt lại mật khẩu</h3>
                <p>
                  Nhập mã 6 chữ số đã gửi đến:
                  <br />
                  <strong>{recoveryEmail}</strong>
                </p>

                <label>
                  Mã OTP 6 chữ số
                  <input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={otp}
                    onChange={(event) =>
                      setOtp(
                        event.target.value.replace(/\D/g, "").slice(0, 6)
                      )
                    }
                    placeholder="123456"
                    required
                    minLength={6}
                    maxLength={6}
                  />
                </label>

                <label>
                  Mật khẩu mới
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(event) =>
                      setNewPassword(event.target.value)
                    }
                    placeholder="Ít nhất 8 ký tự"
                    required
                    minLength={8}
                  />
                </label>

                <label>
                  Nhập lại mật khẩu mới
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) =>
                      setConfirmPassword(event.target.value)
                    }
                    placeholder="Nhập lại mật khẩu mới"
                    required
                    minLength={8}
                  />
                </label>

                <button
                  type="submit"
                  className="auth-submit"
                  disabled={loading}
                >
                  {loading ? "Đang cập nhật..." : "Xác nhận mật khẩu mới"}
                  <ShieldCheck size={17} />
                </button>

                <button
                  type="button"
                  onClick={sendRecoveryCode}
                  disabled={loading}
                  style={{
                    display: "block",
                    margin: "12px auto 0",
                    border: 0,
                    background: "transparent",
                    color: "#4361ee",
                    cursor: loading ? "not-allowed" : "pointer",
                    fontSize: "14px",
                  }}
                >
                  Gửi lại mã OTP
                </button>

                <button
                  type="button"
                  onClick={backToTeacherLogin}
                  style={{
                    display: "block",
                    margin: "10px auto 0",
                    border: 0,
                    background: "transparent",
                    color: "#666",
                    cursor: "pointer",
                    fontSize: "14px",
                  }}
                >
                  Quay lại đăng nhập
                </button>
              </form>
            )}

            {error && (
              <p
                className="auth-error"
                role="alert"
                aria-live="polite"
              >
                {error}
              </p>
            )}

            {notice && (
              <p
                role="status"
                aria-live="polite"
                style={{
                  marginTop: "14px",
                  color: "#247a45",
                  fontSize: "14px",
                  lineHeight: 1.5,
                }}
              >
                {notice}
              </p>
            )}
          </>
        )}

        <div className="auth-foot">Học vui · Nghĩ sâu · Chơi đẹp</div>
      </section>
    </main>
  );
}
