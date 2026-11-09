
"use client";

import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  KeyRound,
  ShieldCheck,
  Sparkles,
  Mail,
} from "lucide-react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

function friendlyOtpError(message: string) {
  const value = message.toLowerCase();

  if (
    value.includes("invalid") ||
    value.includes("expired") ||
    value.includes("token") ||
    value.includes("otp")
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
  if (
    value.includes("signup") ||
    value.includes("user not found") ||
    value.includes("not found")
  ) {
    return "Email này chưa được tạo trong Supabase Authentication → Users. Hãy kiểm tra lại email giáo viên.";
  }
  if (value.includes("smtp") || value.includes("email")) {
    return "Không gửi được email. Hãy kiểm tra SMTP và Email Templates trong Supabase.";
  }
  if (
    value.includes("fetch") ||
    value.includes("network") ||
    value.includes("timeout")
  ) {
    return "Không kết nối được Supabase. Hãy kiểm tra Project URL và Publishable Key trong Vercel.";
  }

  return "Không thể xác thực. Hãy thử lại; nếu vẫn lỗi, kiểm tra Supabase Auth Logs.";
}

export default function LoginPage() {
  const router = useRouter();

  const [mode, setMode] = useState<"student" | "teacher">("student");
  const [studentCode, setStudentCode] = useState("");
  const [pin, setPin] = useState("");

  const [teacherEmail, setTeacherEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);

  const [loading, setLoading] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const verifyLock = useRef(false);

  function clearMessages() {
    setError("");
    setNotice("");
  }

  async function handleStudentLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || verifyingOtp) return;

    clearMessages();
    setLoading(true);

    try {
      const response = await fetch("/api/auth/student-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentCode: studentCode.trim(), pin }),
      });

      const result = (await response.json()) as {
        error?: string;
        session?: { access_token: string; refresh_token: string };
      };

      if (!response.ok || !result.session) {
        throw new Error(result.error || "Không thể đăng nhập.");
      }

      const supabase = getSupabase();
      if (!supabase) throw new Error("Chưa cấu hình Supabase.");

      const { error: sessionError } = await supabase.auth.setSession(result.session);
      if (sessionError) throw sessionError;

      router.replace("/student");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Đã có lỗi xảy ra. Hãy kiểm tra mã học viên và PIN."
      );
    } finally {
      setLoading(false);
    }
  }

  async function sendTeacherOtp() {
    if (loading || verifyingOtp) return;

    clearMessages();
    const normalizedEmail = teacherEmail.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError("Vui lòng nhập địa chỉ email giáo viên hợp lệ.");
      return;
    }

    const supabase = getSupabase();
    if (!supabase) {
      setError(
        "Chưa kết nối được Supabase. Hãy kiểm tra Project URL và Publishable Key trong Vercel."
      );
      return;
    }

    setLoading(true);
    setNotice("Đang gửi mã xác nhận...");

    try {
      const { error: sendError } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: { shouldCreateUser: false },
      });

      if (sendError) throw sendError;

      setTeacherEmail(normalizedEmail);
      setOtp("");
      setOtpSent(true);
      setNotice(
        "Mã OTP đã được yêu cầu gửi đến email. Hãy kiểm tra hộp thư đến và Spam."
      );
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "unknown";
      console.error("Teacher OTP request failed:", caught);
      setNotice("");
      setError(friendlyOtpError(message));
    } finally {
      setLoading(false);
    }
  }

  async function handleTeacherSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendTeacherOtp();
  }

  async function verifyTeacherOtp(token: string) {
    if (verifyLock.current || verifyingOtp) return;

    verifyLock.current = true;
    clearMessages();
    setVerifyingOtp(true);
    setNotice("Mã đã đủ 6 số. Đang xác minh và đăng nhập...");

    try {
      const supabase = getSupabase();
      if (!supabase) {
        throw new Error("Chưa kết nối được Supabase. Hãy kiểm tra cấu hình Vercel.");
      }

      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email: teacherEmail.trim().toLowerCase(),
        token,
        type: "email",
      });

      if (verifyError) throw verifyError;
      if (!data.user) {
        throw new Error("Supabase không trả về tài khoản sau khi xác minh OTP.");
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role,is_active")
        .eq("id", data.user.id)
        .maybeSingle();

      if (profileError) {
        console.error("Teacher profile lookup failed:", profileError);
        await supabase.auth.signOut();
        throw new Error(
          "Không đọc được hồ sơ giáo viên. Hãy kiểm tra bảng profiles và chính sách RLS."
        );
      }

      if (!profile || profile.role !== "teacher" || profile.is_active !== true) {
        await supabase.auth.signOut();
        throw new Error(
          "Tài khoản này chưa được cấp quyền giáo viên hoặc đang bị khóa."
        );
      }

      setNotice("Đăng nhập thành công. Đang mở Teacher Studio...");
      router.replace("/teacher");
      router.refresh();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "unknown";
      console.error("Teacher OTP verification failed:", caught);
      setNotice("");

      if (
        message.includes("hồ sơ giáo viên") ||
        message.includes("cấp quyền giáo viên")
      ) {
        setError(message);
      } else {
        setError(friendlyOtpError(message));
      }
      setOtp("");
    } finally {
      setVerifyingOtp(false);
      verifyLock.current = false;
    }
  }

  function handleOtpChange(value: string) {
    const nextOtp = value.replace(/\D/g, "").slice(0, 6);
    setOtp(nextOtp);
    if (error) setError("");

    if (nextOtp.length === 6 && !verifyLock.current) {
      void verifyTeacherOtp(nextOtp);
    }
  }

  function handleTeacherEmailKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void sendTeacherOtp();
    }
  }

  function resetTeacherOtp() {
    if (loading || verifyingOtp) return;
    setOtpSent(false);
    setOtp("");
    clearMessages();
  }

  return (
    <main className="auth-page">
      <section className="auth-card" style={{ position: "relative", zIndex: 1 }}>
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
                Thầy cần tạo Supabase project và điền biến môi trường theo hướng dẫn
                trước khi sử dụng đăng nhập thật.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="auth-tabs">
              <button
                type="button"
                className={mode === "student" ? "active" : ""}
                onClick={() => {
                  setMode("student");
                  clearMessages();
                }}
              >
                Em là học viên
              </button>
              <button
                type="button"
                className={mode === "teacher" ? "active" : ""}
                onClick={() => {
                  setMode("teacher");
                  clearMessages();
                }}
              >
                Thầy / Cô giáo
              </button>
            </div>

            {mode === "student" ? (
              <form className="auth-form" onSubmit={handleStudentLogin}>
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
                      setPin(event.target.value.replace(/\D/g, "").slice(0, 8))
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
                  style={{
                    position: "relative",
                    zIndex: 2,
                    pointerEvents: "auto",
                    width: "100%",
                  }}
                >
                  {loading ? "Đang đăng nhập..." : "Vào cuộc phiêu lưu"}
                  <Sparkles size={17} />
                </button>
              </form>
            ) : !otpSent ? (
              <form
                className="auth-form"
                noValidate
                onSubmit={handleTeacherSubmit}
              >
                <label>
                  Email giáo viên
                  <input
                    type="email"
                    value={teacherEmail}
                    onChange={(event) => setTeacherEmail(event.target.value)}
                    onKeyDown={handleTeacherEmailKeyDown}
                    placeholder="Nhập email giáo viên"
                    autoComplete="email"
                    required
                  />
                </label>

                <p className="auth-helper">
                  <ShieldCheck size={14} />
                  Đăng nhập an toàn bằng mã OTP 6 số gửi đến email giáo viên.
                </p>

                <button
                  type="button"
                  className="auth-submit"
                  onClick={() => void sendTeacherOtp()}
                  disabled={loading || verifyingOtp}
                  style={{
                    position: "relative",
                    zIndex: 5,
                    pointerEvents: "auto",
                    width: "100%",
                    cursor: "pointer",
                  }}
                >
                  {loading ? "Đang gửi mã OTP..." : "Gửi mã OTP qua email"}
                  <Mail size={17} />
                </button>
              </form>
            ) : (
              <div className="auth-form">
                <div>
                  <h3 style={{ margin: "0 0 6px", color: "#27334a" }}>
                    Nhập mã xác nhận
                  </h3>
                  <p style={{ margin: 0, color: "#868b92", fontSize: 12, lineHeight: 1.6 }}>
                    Mã 6 số đã được gửi đến <strong>{teacherEmail}</strong>.
                    Hãy kiểm tra hộp thư đến và Spam.
                  </p>
                </div>

                <label>
                  Mã OTP 6 chữ số
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={otp}
                    onChange={(event) => handleOtpChange(event.target.value)}
                    placeholder="Nhập 6 chữ số"
                    maxLength={6}
                    autoFocus
                    disabled={verifyingOtp}
                    style={{
                      textAlign: "center",
                      letterSpacing: "0.45em",
                      fontSize: 20,
                    }}
                  />
                </label>

                <p className="auth-helper">
                  <KeyRound size={14} />
                  Khi nhập đủ 6 số, hệ thống sẽ tự xác minh và mở Teacher Studio.
                </p>

                <button
                  type="button"
                  className="auth-submit"
                  onClick={() => void sendTeacherOtp()}
                  disabled={loading || verifyingOtp}
                  style={{
                    position: "relative",
                    zIndex: 5,
                    pointerEvents: "auto",
                    width: "100%",
                    cursor: "pointer",
                  }}
                >
                  {loading ? "Đang gửi lại mã..." : "Gửi lại mã OTP"}
                  <Mail size={17} />
                </button>

                <button
                  type="button"
                  onClick={resetTeacherOtp}
                  disabled={loading || verifyingOtp}
                  style={{
                    border: 0,
                    background: "transparent",
                    color: "#4363eb",
                    padding: 8,
                    cursor: "pointer",
                    justifySelf: "center",
                  }}
                >
                  Đổi email / quay lại
                </button>
              </div>
            )}

            {error && (
              <p className="auth-error" role="alert" aria-live="assertive">
                {error}
              </p>
            )}

            {notice && (
              <p
                role="status"
                aria-live="polite"
                style={{
                  marginTop: 12,
                  color: "#56825d",
                  fontSize: 11,
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
