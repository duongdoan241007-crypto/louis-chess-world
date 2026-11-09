"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookOpen, KeyRound, ShieldCheck, Sparkles } from "lucide-react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

function friendlyAuthError(message: string) {
  const value = message.toLowerCase();
  if (value.includes("invalid login credentials")) return "Email hoặc mật khẩu chưa chính xác. Hãy kiểm tra lại tài khoản trong Supabase Authentication → Users.";
  if (value.includes("email not confirmed")) return "Email giáo viên chưa được xác nhận. Hãy xác nhận email trong Supabase Authentication → Users rồi thử lại.";
  if (value.includes("too many requests")) return "Bạn đã thử đăng nhập quá nhiều lần. Hãy đợi vài phút rồi thử lại.";
  if (value.includes("fetch") || value.includes("network") || value.includes("timeout")) return "Không kết nối được máy chủ Supabase. Hãy kiểm tra Project URL và Publishable Key trong Vercel.";
  return "Đăng nhập chưa thành công. Hãy thử lại; nếu vẫn lỗi, gửi giáo viên mã lỗi trong Console cho bộ phận hỗ trợ.";
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

  async function handleTeacherLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setError("");

    const supabase = getSupabase();
    if (!supabase) {
      setError("Chưa cấu hình Supabase. Hãy kiểm tra NEXT_PUBLIC_SUPABASE_URL và NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY trong Vercel.");
      return;
    }

    setLoading(true);
    try {
      const signInResult = await Promise.race([
        supabase.auth.signInWithPassword({ email: email.trim(), password }),
        new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("timeout")), 15000)),
      ]);

      const { data, error: loginError } = signInResult;
      if (loginError || !data.user) {
        setError(friendlyAuthError(loginError?.message ?? "Missing user"));
        return;
      }

      const profileResult = await Promise.race([
        supabase.from("profiles").select("role,is_active").eq("id", data.user.id).maybeSingle(),
        new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("timeout")), 15000)),
      ]);

      const { data: profile, error: profileError } = profileResult;
      if (profileError) {
        console.error("Teacher profile lookup failed:", profileError);
        await supabase.auth.signOut();
        setError("Đăng nhập Supabase thành công nhưng không đọc được hồ sơ giáo viên. Cần kiểm tra bảng profiles và chính sách RLS trong Supabase.");
        return;
      }
      if (!profile || profile.role !== "teacher" || !profile.is_active) {
        await supabase.auth.signOut();
        setError("Tài khoản đã đăng nhập nhưng chưa có hồ sơ role = teacher hoặc tài khoản đang bị khóa. Cần kiểm tra public.profiles trong Supabase.");
        return;
      }

      router.replace("/teacher");
      router.refresh();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "unknown";
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

  return (
    <main className="auth-page">
      <section className="auth-card">
        <a className="auth-back" href="/"><ArrowLeft size={15}/> Về bản xem thử</a>
        <div className="auth-brand"><span>♞</span><div><b>VƯƠNG QUỐC</b><strong>64 Ô</strong></div></div>
        <div className="auth-title"><span className="eyebrow">CHÀO MỪNG TRỞ LẠI</span><h1>Mở cánh cửa<br/>vào thế giới cờ vua!</h1><p>Đăng nhập để tiếp tục hành trình của mình.</p></div>
        {!isSupabaseConfigured ? (
          <div className="auth-notice"><ShieldCheck size={20}/><div><b>Chế độ tài khoản chưa được bật</b><p>Thầy cần tạo Supabase project và điền biến môi trường theo hướng dẫn trước khi sử dụng đăng nhập thật.</p></div></div>
        ) : <>
          <div className="auth-tabs"><button type="button" className={mode === "student" ? "active" : ""} onClick={() => { setMode("student"); setError(""); }}>Em là học viên</button><button type="button" className={mode === "teacher" ? "active" : ""} onClick={() => { setMode("teacher"); setError(""); }}>Thầy / Cô giáo</button></div>
          {mode === "student" ? <form className="auth-form" onSubmit={handleStudentLogin}>
            <label>Mã học viên<input autoCapitalize="characters" autoComplete="username" value={studentCode} onChange={(event) => setStudentCode(event.target.value.toUpperCase())} placeholder="Ví dụ: K7M4P9Q" required minLength={6} maxLength={10}/></label>
            <label>Mã PIN 8 chữ số<input inputMode="numeric" autoComplete="current-password" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="Nhập mã PIN của em" required minLength={8} maxLength={8}/></label>
            <p className="auth-helper"><KeyRound size={14}/> Mã đăng nhập do giáo viên cấp. Nếu quên, hãy nhờ thầy cấp lại.</p>
            <button type="submit" className="auth-submit" disabled={loading}>{loading ? "Đang đăng nhập..." : "Vào cuộc phiêu lưu"}<Sparkles size={17}/></button>
          </form> : <form className="auth-form" onSubmit={handleTeacherLogin}>
            <label>Email giáo viên<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="teacher@example.com" required/></label>
            <label>Mật khẩu<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mật khẩu tài khoản" required/></label>
            <p className="auth-helper"><ShieldCheck size={14}/> Tài khoản giáo viên được tạo và cấp quyền trong Supabase.</p>
            <button type="submit" className="auth-submit" disabled={loading}>{loading ? "Đang kiểm tra tài khoản..." : "Mở Teacher Studio"}<BookOpen size={17}/></button>
          </form>}
          {error && <p className="auth-error" role="alert" aria-live="polite">{error}</p>}
        </>}

        <div className="auth-foot">Học vui · Nghĩ sâu · Chơi đẹp</div>
      </section>
    </main>
  );
}
