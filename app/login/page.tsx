"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  KeyRound,
  Mail,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

function friendlyOtpError(message: string) {
  const value = message.toLowerCase();

  if (
    value.includes("otp_expired") ||
    value.includes("expired") ||
    value.includes("invalid token") ||
    value.includes("token is invalid") ||
    value.includes("invalid otp") ||
    value.includes("token has expired")
  ) {
    return "Mã OTP không đúng hoặc đã hết hạn. Hãy yêu cầu gửi mã mới.";
  }
  if (value.includes("rate limit") || value.includes("too many requests")) {
    return "Bạn yêu cầu mã quá nhanh. Vui lòng đợi khoảng 60 giây rồi thử lại.";
  }
  if (value.includes("email not confirmed")) {
    return "Email giáo viên chưa được xác nhận trong Supabase Authentication → Users.";
  }
  if (value.includes("fetch") || value.includes("network") || value.includes("timeout")) {
    return "Không kết nối được Supabase. Hãy kiểm tra mạng và cấu hình Vercel.";
  }
  if (value.includes("user not found") || value.includes("not found")) {
    return "Email này chưa có tài khoản giáo viên trong Supabase.";
  }

  return "Không thể xác minh mã OTP. Hãy thử lại hoặc kiểm tra cấu hình Email OTP trong Supabase.";
}

export default function LoginPage() {
  const router = useRouter();

  const [mode, setMode] = useState<"student" | "teacher">("student");
  const [teacherEmail, setTeacherEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);

  const [studentCode, setStudentCode] = useState("");
  const [pin, setPin] = useState("");

  const [loading, setLoading] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const verifyLock = useRef(false);

  function clearMessages() {
    setError("");
    setNotice("");
  }

  function switchMode(nextMode: "student" | "teacher") {
    setMode(nextMode);
    setOtpSent(false);
    setOtp("");
    clearMessages();
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
      setError("Chưa kết nối được Supabase. Hãy kiểm tra Project URL và Publishable Key trong Vercel.");
      return;
    }

    setLoading(true);
    setNotice("Đang gửi mã xác nhận...");

    try {
      const { error: sendError } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          // Do not let the login screen create new Auth users.
          shouldCreateUser: false,
        },
      });

      if (sendError) throw sendError;

      setTeacherEmail(normalizedEmail);
      setOtp("");
      setOtpSent(true);
      setNotice("Mã OTP đã được yêu cầu gửi đến email. Hãy kiểm tra hộp thư đến và Spam.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "unknown";
      console.error("Teacher OTP request failed:", caught);
      setNotice("");
      setError(friendlyOtpError(message));
    } finally {
      setLoading(false);
    }
  }

  async function verifyTeacherOtp(token: string) {
    if (verifyLock.current || verifyingOtp) return;
    verifyLock.current = true;
    clearMessages();

    const supabase = getSupabase();
    if (!supabase) {
      setError("Chưa kết nối được Supabase. Hãy kiểm tra cấu hình Vercel.");
      verifyLock.current = false;
      return;
    }

    setVerifyingOtp(true);
    setNotice("Mã đã đủ 6 số. Đang xác minh và đăng nhập...");

    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email: teacherEmail.trim().toLowerCase(),
        token,
        type: "email",
      });

      if (verifyError) throw verifyError;
      if (!data.user) throw new Error("Supabase did not return a user after OTP verification");

      // Verify the signed-in account has an active teacher profile.
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role,is_active")
        .eq("id", data.user.id)
        .maybeSingle();

      if (profileError) {
        console.error("Teacher profile lookup failed:", profileError);
        await supabase.auth.signOut();
        throw new Error("Không đọc được hồ sơ giáo viên. Hãy kiểm tra bảng profiles và chính sách RLS.");
      }

      if (!profile || profile.role !== "teacher" || profile.is_active !== true) {
        await supabase.auth.signOut();
        throw new Error("Tài khoản này chưa được cấp quyền giáo viên hoặc đang bị khóa.");
      }

      setNotice("Đăng nhập thành công. Đang mở Teacher Studio...");
      router.replace("/teacher");
      router.refresh();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "unknown";
      console.error("Teacher OTP verification failed:", caught);
      setNotice("");

      if (message.includes("hồ sơ giáo viên") || message.includes("cấp quyền giáo viên")) {
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
    clearMessages();

    // Automatically verify as soon as the sixth digit is entered or pasted.
    if (nextOtp.length === 6) {
      void verifyTeacherOtp(nextOtp);
    }
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
      if (sessionError) throw new Error("Không tạo được phiên đăng nhập. Hãy thử lại.");

      router.replace("/student");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Đã có lỗi xảy ra. Hãy thử lại.");
    } finally {
      setLoading(false);
    }
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
              <p>Thầy cần cấu hình Supabase trong Vercel trước khi sử dụng đăng nhập thật.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="auth-tabs">
              <button
                type="button"
                className={mode === "student" ? "active" : ""}
                onClick={() => switchMode("student")}
              >
                Em là học viên
              </button>
              <button
                type="button"
                className={mode === "teacher" ? "active" : ""}
                onClick={() => switchMode("teacher")}
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
                    onChange={(event) => setStudentCode(event.target.value.toUpperCase())}
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
                    onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 8))}
                    placeholder="Nhập mã PIN của em"
                    required
                    minLength={8}
                    maxLength={8}
                  />
                </label>

                <p className="auth-helper">
                  <KeyRound size={14} /> Mã đăng nhập do giáo viên cấp. Nếu quên, hãy nhờ thầy cấp lại.
                </p>

                <button type="submit" className="auth-submit" disabled={loading}>
                  {loading ? "Đang đăng nhập..." : "Vào cuộc phiêu lưu"}
                  <Sparkles size={17} />
                </button>
              </form>
            ) : !otpSent ? (
              <form
                className="auth-form"
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendTeacherOtp();
                }}
              >
                <label>
                  Email giáo viên
                  <input
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={teacherEmail}
                    onChange={(event) => setTeacherEmail(event.target.value)}
                    placeholder="teacher@example.com"
                    required
                  />
                </label>

                <p className="auth-helper">
                  <ShieldCheck size={14} /> Đăng nhập không cần mật khẩu. Mã xác minh sẽ được gửi đến email giáo viên đã đăng ký.
                </p>

                <button type="submit" className="auth-submit" disabled={loading}>
                  {loading ? "Đang gửi mã..." : "Gửi mã OTP qua email"}
                  <Mail size={17} />
                </button>
              </form>
            ) : (
              <form className="auth-form" noValidate onSubmit={(event) => event.preventDefault()}>
                <div className="auth-notice">
                  <Mail size={19} />
                  <div>
                    <b>Kiểm tra email của bạn</b>
                    <p>Mã đăng nhập đã được yêu cầu gửi đến <strong>{teacherEmail}</strong>. Hãy kiểm tra cả mục Spam.</p>
                  </div>
                </div>

                <label>
                  Mã OTP gồm 6 chữ số
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    value={otp}
                    onChange={(event) => handleOtpChange(event.target.value)}
                    placeholder="Nhập hoặc dán mã 6 số"
                    maxLength={6}
                    aria-label="Mã OTP đăng nhập giáo viên"
                    disabled={verifyingOtp}
                  />
                </label>

                <p className="auth-helper">
                  <KeyRound size={14} /> Hệ thống sẽ tự xác minh và mở Teacher Studio ngay khi bạn nhập đủ 6 số. Không cần bấm nút đăng nhập.
                </p>

                {verifyingOtp && (
                  <p className="auth-helper" role="status" aria-live="polite">
                    Đang xác minh mã OTP...
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setOtp("");
                    void sendTeacherOtp();
                  }}
                  disabled={loading || verifyingOtp}
                  style={{
                    border: 0,
                    background: "transparent",
                    color: "#4263eb",
                    cursor: loading || verifyingOtp ? "wait" : "pointer",
                    fontSize: 13,
                    fontWeight: 700,
                    padding: 8,
                  }}
                >
                  {loading ? "Đang gửi lại mã..." : "Gửi lại mã OTP"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setOtpSent(false);
                    setOtp("");
                    clearMessages();
                  }}
                  disabled={verifyingOtp}
                  style={{
                    border: 0,
                    background: "transparent",
                    color: "#758092",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 700,
                    padding: 8,
                  }}
                >
                  Đổi email
                </button>
              </form>
            )}

            {notice && (
              <p className="auth-helper" role="status" aria-live="polite">
                {notice}
              </p>
            )}
            {error && (
              <p className="auth-error" role="alert" aria-live="assertive">
                {error}
              </p>
            )}
          </>
        )}

        <div className="auth-foot">Học vui · Nghĩ sâu · Chơi đẹp</div>
      </section>
    </main>
  );
}
