"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  KeyRound,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

type RecoveryStep = "idle" | "email" | "otp" | "password";

function friendlyAuthError(message: string) {
  const value = message.toLowerCase();
  if (value.includes("invalid login credentials") || value.includes("invalid_credentials")) return "Email hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại và thử lần nữa.";
  if (value.includes("email not confirmed")) return "Email giáo viên chưa được xác nhận. Hãy xác nhận email trong Supabase Authentication → Users rồi thử lại.";
  if (value.includes("too many requests")) return "Bạn đã thử quá nhiều lần. Hãy đợi vài phút rồi thử lại.";
  if (value.includes("fetch") || value.includes("network") || value.includes("timeout")) return "Không kết nối được máy chủ Supabase. Hãy kiểm tra Project URL và Publishable Key trong Vercel.";
  return "Đăng nhập chưa thành công. Hãy thử lại. Nếu lỗi tiếp tục, gửi ảnh thông báo cho giáo viên quản trị.";
}

function friendlyRecoveryError(message: string) {
  const value = message.toLowerCase();
  if (value.includes("expired") || value.includes("otp_expired") || value.includes("invalid") || value.includes("token")) {
    return "Mã OTP không đúng hoặc đã hết hạn. Hãy kiểm tra email và yêu cầu gửi mã mới.";
  }
  if (value.includes("password") && (value.includes("weak") || value.includes("short") || value.includes("length"))) {
    return "Mật khẩu mới chưa đủ mạnh. Hãy dùng ít nhất 8 ký tự.";
  }
  if (value.includes("too many requests") || value.includes("rate limit")) {
    return "Bạn yêu cầu gửi mã quá nhanh. Hãy đợi một lúc rồi thử lại.";
  }
  if (value.includes("fetch") || value.includes("network") || value.includes("timeout")) {
    return "Không kết nối được Supabase. Hãy kiểm tra mạng rồi thử lại.";
  }
  return "Chưa thể khôi phục mật khẩu. Hãy thử lại hoặc kiểm tra cấu hình email trong Supabase.";
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"student" | "teacher">("student");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [studentCode, setStudentCode] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [recoveryStep, setRecoveryStep] = useState<RecoveryStep>("idle");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryOtp, setRecoveryOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [recoveryLoading, setRecoveryLoading] = useState(false);

  function clearMessages() {
    setError("");
    setNotice("");
  }

  function openRecovery() {
    clearMessages();
    setRecoveryEmail(email.trim());
    setRecoveryOtp("");
    setNewPassword("");
    setConfirmNewPassword("");
    setRecoveryStep("email");
  }

  async function cancelRecovery() {
    const supabase = getSupabase();
    if (recoveryStep === "password" && supabase) {
      // OTP verification has created a short-lived recovery session.
      // Clear it when the user abandons the password-change flow.
      await supabase.auth.signOut();
    }
    setRecoveryStep("idle");
    setRecoveryOtp("");
    setNewPassword("");
    setConfirmNewPassword("");
    clearMessages();
  }

  async function handleTeacherLogin() {
    if (loading) return;
    clearMessages();

    // Use manual validation so the form always renders an in-page error.
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      setError("Vui lòng nhập email và mật khẩu giáo viên.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError("Email không đúng định dạng. Vui lòng kiểm tra lại.");
      return;
    }

    const supabase = getSupabase();
    if (!supabase) {
      setError("Chưa kết nối được Supabase. Hãy kiểm tra cấu hình Project URL và Publishable Key trong Vercel.");
      return;
    }

    // This status changes immediately when the button is activated.
    setLoading(true);
    setNotice("Đang kiểm tra email và mật khẩu...");
    try {
      const signInResult = await Promise.race([
        supabase.auth.signInWithPassword({ email: normalizedEmail, password }),
        new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("timeout")), 15000)),
      ]);

      const { data, error: loginError } = signInResult;
      if (loginError || !data.user) {
        setNotice("");
        setError(friendlyAuthError(loginError?.message ?? "Missing user"));
        return;
      }

      const profileResult = await Promise.race([
        supabase.from("profiles").select("role,is_active").eq("id", data.user.id).maybeSingle(),
        new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("timeout")), 15000)),
      ]);

      const { data: profile, error: profileError } = profileResult;
      if (profileError) {
        setNotice("");
        console.error("Teacher profile lookup failed:", profileError);
        await supabase.auth.signOut();
        setError("Đăng nhập Supabase thành công nhưng không đọc được hồ sơ giáo viên. Cần kiểm tra bảng profiles và chính sách RLS trong Supabase.");
        return;
      }
      if (!profile || profile.role !== "teacher" || !profile.is_active) {
        setNotice("");
        await supabase.auth.signOut();
        setError("Tài khoản đã đăng nhập nhưng chưa có hồ sơ role = teacher hoặc tài khoản đang bị khóa. Cần kiểm tra public.profiles trong Supabase.");
        return;
      }

      router.replace("/teacher");
      router.refresh();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "unknown";
      setNotice("");
      console.error("Teacher sign-in failed:", caught);
      setError(friendlyAuthError(message));
    } finally {
      setLoading(false);
    }
  }

  async function handleRequestRecovery(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (recoveryLoading) return;
    clearMessages();
    const normalizedEmail = recoveryEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError("Hãy nhập địa chỉ email hợp lệ của giáo viên.");
      return;
    }
    const supabase = getSupabase();
    if (!supabase) {
      setError("Chưa kết nối được Supabase. Hãy kiểm tra cấu hình Vercel.");
      return;
    }

    setRecoveryLoading(true);
    try {
      const { error: requestError } = await supabase.auth.resetPasswordForEmail(normalizedEmail);
      if (requestError) throw requestError;

      setRecoveryEmail(normalizedEmail);
      setRecoveryStep("otp");
      // Supabase intentionally does not reveal whether an email is registered.
      setNotice("Nếu email này có tài khoản, mã xác minh sẽ được gửi đến hộp thư của bạn. Hãy kiểm tra cả mục Spam.");
    } catch (caught) {
      console.error("Password recovery request failed:", caught);
      setError(friendlyRecoveryError(caught instanceof Error ? caught.message : "unknown"));
    } finally {
      setRecoveryLoading(false);
    }
  }

  async function handleVerifyRecoveryOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (recoveryLoading) return;
    clearMessages();
    const token = recoveryOtp.replace(/\D/g, "").trim();
    if (!/^\d{6}$/.test(token)) {
      setError("Mã OTP phải gồm đúng 6 chữ số.");
      return;
    }
    const supabase = getSupabase();
    if (!supabase) {
      setError("Chưa kết nối được Supabase. Hãy kiểm tra cấu hình Vercel.");
      return;
    }

    setRecoveryLoading(true);
    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email: recoveryEmail.trim().toLowerCase(),
        token,
        type: "recovery",
      });
      if (verifyError) throw verifyError;
      if (!data.user) throw new Error("OTP verification did not return a user");

      // This recovery screen is only for the teacher account, not student access.
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role,is_active")
        .eq("id", data.user.id)
        .maybeSingle();
      if (profileError || !profile || profile.role !== "teacher" || !profile.is_active) {
        await supabase.auth.signOut();
        throw new Error("This account is not an active teacher profile");
      }

      setRecoveryStep("password");
      setNotice("Mã đã được xác minh. Hãy tạo mật khẩu mới cho tài khoản giáo viên.");
    } catch (caught) {
      console.error("Password recovery OTP verification failed:", caught);
      setError(friendlyRecoveryError(caught instanceof Error ? caught.message : "unknown"));
    } finally {
      setRecoveryLoading(false);
    }
  }

  async function handleSetNewPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (recoveryLoading) return;
    clearMessages();

    if (newPassword.length < 8) {
      setError("Mật khẩu mới cần có ít nhất 8 ký tự.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError("Hai lần nhập mật khẩu chưa khớp. Hãy kiểm tra lại.");
      return;
    }

    const supabase = getSupabase();
    if (!supabase) {
      setError("Chưa kết nối được Supabase. Hãy kiểm tra cấu hình Vercel.");
      return;
    }

    setRecoveryLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;

      // Password is changed. End the recovery session and return to normal login.
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) console.warn("Password changed, but sign-out did not complete:", signOutError);

      setPassword("");
      setEmail(recoveryEmail);
      setRecoveryStep("idle");
      setRecoveryOtp("");
      setNewPassword("");
      setConfirmNewPassword("");
      setNotice("Đổi mật khẩu thành công! Hãy đăng nhập bằng mật khẩu mới.");
    } catch (caught) {
      console.error("Password update failed:", caught);
      setError(friendlyRecoveryError(caught instanceof Error ? caught.message : "unknown"));
    } finally {
      setRecoveryLoading(false);
    }
  }

  async function handleStudentLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    clearMessages();
    setLoading(true);
    try {
      const response = await fetch("/api/auth/student-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentCode: studentCode.trim(), pin }),
      });
      const result = await response.json() as { error?: string; session?: { access_token: string; refresh_token: string } };
      if (!response.ok || !result.session) throw new Error(result.error || "Không thể đăng nhập.");
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

  const isRecovering = recoveryStep !== "idle";

  return (
    <main className="auth-page">
      <section className="auth-card">
        <a className="auth-back" href="/"><ArrowLeft size={15}/> Về bản xem thử</a>
        <div className="auth-brand"><span>♞</span><div><b>VƯƠNG QUỐC</b><strong>64 Ô</strong></div></div>
        <div className="auth-title">
          <span className="eyebrow">{isRecovering ? "KHÔI PHỤC TÀI KHOẢN" : "CHÀO MỪNG TRỞ LẠI"}</span>
          <h1>{recoveryStep === "idle" ? <>Mở cánh cửa<br/>vào thế giới cờ vua!</> : <>Lấy lại quyền<br/>vào vương quốc!</>}</h1>
          <p>{recoveryStep === "idle" ? "Đăng nhập để tiếp tục hành trình của mình." : "Xác minh email để đặt mật khẩu mới an toàn."}</p>
        </div>

        {!isSupabaseConfigured ? (
          <div className="auth-notice"><ShieldCheck size={20}/><div><b>Chế độ tài khoản chưa được bật</b><p>Thầy cần cấu hình Supabase trong Vercel trước khi sử dụng đăng nhập thật.</p></div></div>
        ) : <>
          {recoveryStep === "idle" && (
            <div className="auth-tabs">
              <button type="button" className={mode === "student" ? "active" : ""} onClick={() => { setMode("student"); clearMessages(); }}>Em là học viên</button>
              <button type="button" className={mode === "teacher" ? "active" : ""} onClick={() => { setMode("teacher"); clearMessages(); }}>Thầy / Cô giáo</button>
            </div>
          )}

          {mode === "student" && recoveryStep === "idle" ? (
            <form className="auth-form" onSubmit={handleStudentLogin}>
              <label>Mã học viên<input autoCapitalize="characters" autoComplete="username" value={studentCode} onChange={(event) => setStudentCode(event.target.value.toUpperCase())} placeholder="Ví dụ: K7M4P9Q" required minLength={6} maxLength={10}/></label>
              <label>Mã PIN 8 chữ số<input inputMode="numeric" autoComplete="current-password" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="Nhập mã PIN của em" required minLength={8} maxLength={8}/></label>
              <p className="auth-helper"><KeyRound size={14}/> Mã đăng nhập do giáo viên cấp. Nếu quên, hãy nhờ thầy cấp lại.</p>
              <button type="submit" className="auth-submit" disabled={loading}>{loading ? "Đang đăng nhập..." : "Vào cuộc phiêu lưu"}<Sparkles size={17}/></button>
            </form>
          ) : null}

          {mode === "teacher" && recoveryStep === "idle" ? (
            <div
              className="auth-form"
              style={{ position: "relative", zIndex: 50 }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleTeacherLogin();
                }
              }}
            >
              <label>
                Email giáo viên
                <input
                  type="text"
                  inputMode="email"
                  autoComplete="username"
                  value={email}
                  onChange={(event) => { setEmail(event.target.value); clearMessages(); }}
                  placeholder="teacher@example.com"
                  aria-label="Email giáo viên"
                />
              </label>
              <label>
                Mật khẩu
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => { setPassword(event.target.value); clearMessages(); }}
                  placeholder="Mật khẩu tài khoản"
                  aria-label="Mật khẩu giáo viên"
                />
              </label>
              <p className="auth-helper"><ShieldCheck size={14}/> Tài khoản giáo viên được tạo và cấp quyền trong Supabase.</p>
              <button type="button" onClick={openRecovery} disabled={loading} style={{ justifySelf: "end", border: 0, background: "transparent", color: "#4263eb", fontSize: 12, fontWeight: 700, padding: "2px 0", position: "relative", zIndex: 100, pointerEvents: "auto" }}>Quên mật khẩu?</button>
              <button
                type="button"
                className="auth-submit"
                onClick={() => { void handleTeacherLogin(); }}
                disabled={loading}
                style={{ width: "100%", minHeight: 52, cursor: loading ? "wait" : "pointer", position: "relative", zIndex: 1000, pointerEvents: "auto", touchAction: "manipulation" }}
                aria-label="Mở Teacher Studio"
              >
                {loading ? "Đang kiểm tra tài khoản..." : "Mở Teacher Studio"}
                <BookOpen size={17}/>
              </button>
            </div>
          ) : null}

          {recoveryStep === "email" ? (
            <form className="auth-form" onSubmit={(event) => { void handleRequestRecovery(event); }}>
              <label>Email giáo viên<input type="email" autoComplete="email" value={recoveryEmail} onChange={(event) => setRecoveryEmail(event.target.value)} placeholder="Email đã đăng ký tài khoản" required/></label>
              <p className="auth-helper"><Mail size={14}/> Chúng tôi sẽ gửi mã OTP đến email nếu địa chỉ này có tài khoản.</p>
              <button
                type="button"
                className="auth-submit"
                onClick={() => { void handleRequestRecovery(); }}
                disabled={recoveryLoading}
                style={{ position: "relative", zIndex: 2, pointerEvents: "auto", width: "100%" }}
              >
                {recoveryLoading ? "Đang gửi mã..." : "Gửi mã OTP qua email"}
                <Mail size={17}/>
              </button>
              <button type="button" onClick={() => { setRecoveryStep("idle"); clearMessages(); }} style={{ border: 0, background: "transparent", color: "#758092", fontSize: 12, fontWeight: 700, padding: 8 }}>Quay lại đăng nhập</button>
            </form>
          ) : null}

          {recoveryStep === "otp" ? (
            <form className="auth-form" onSubmit={handleVerifyRecoveryOtp}>
              <div className="auth-notice"><Mail size={19}/><div><b>Kiểm tra hộp thư của bạn</b><p>Nếu email có tài khoản, mã xác minh đã được gửi đến <strong>{recoveryEmail}</strong>. Kiểm tra cả mục Spam.</p></div></div>
              <label>Mã OTP trong email<input inputMode="numeric" autoComplete="one-time-code" value={recoveryOtp} onChange={(event) => setRecoveryOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="Nhập mã 6 chữ số" required minLength={6} maxLength={6}/></label>
              <button type="submit" className="auth-submit" disabled={recoveryLoading}>{recoveryLoading ? "Đang xác minh..." : "Xác minh mã OTP"}<ShieldCheck size={17}/></button>
              <button type="button" onClick={() => { setRecoveryStep("email"); clearMessages(); }} style={{ border: 0, background: "transparent", color: "#4263eb", fontSize: 12, fontWeight: 700, padding: 8 }}>Gửi lại mã / đổi email</button>
              <button type="button" onClick={cancelRecovery} style={{ border: 0, background: "transparent", color: "#758092", fontSize: 12, fontWeight: 700, padding: 4 }}>Hủy và quay lại đăng nhập</button>
            </form>
          ) : null}

          {recoveryStep === "password" ? (
            <form className="auth-form" onSubmit={handleSetNewPassword}>
              <div className="auth-notice"><CheckCircle2 size={19}/><div><b>Email đã được xác minh</b><p>Hãy tạo mật khẩu mới có ít nhất 8 ký tự.</p></div></div>
              <label>Mật khẩu mới<input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="Ít nhất 8 ký tự" required minLength={8}/></label>
              <label>Nhập lại mật khẩu mới<input type="password" autoComplete="new-password" value={confirmNewPassword} onChange={(event) => setConfirmNewPassword(event.target.value)} placeholder="Nhập lại mật khẩu" required minLength={8}/></label>
              <button type="submit" className="auth-submit" disabled={recoveryLoading}>{recoveryLoading ? "Đang cập nhật..." : "Lưu mật khẩu mới"}<LockKeyhole size={17}/></button>
              <button type="button" onClick={cancelRecovery} style={{ border: 0, background: "transparent", color: "#758092", fontSize: 12, fontWeight: 700, padding: 8 }}>Hủy khôi phục</button>
            </form>
          ) : null}

          {notice && <p className="auth-helper" role="status" aria-live="polite" style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, background: "#eef8f0", color: "#39764a" }}>{notice}</p>}
          {error && <p className="auth-error" role="alert" aria-live="polite">{error}</p>}
        </>}

        <div className="auth-foot">Học vui · Nghĩ sâu · Chơi đẹp</div>
      </section>
    </main>
  );
}
