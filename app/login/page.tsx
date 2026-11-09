"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookOpen, KeyRound, ShieldCheck, Sparkles } from "lucide-react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

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
    setError("");
    const supabase = getSupabase();
    if (!supabase) { setError("Chưa cấu hình Supabase. Hãy xem file HUONG-DAN.md."); return; }
    setLoading(true);
    const { data, error: loginError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (loginError || !data.user) {
      setError("Email hoặc mật khẩu chưa chính xác.");
      setLoading(false);
      return;
    }
    const { data: profile } = await supabase.from("profiles").select("role,is_active").eq("id", data.user.id).maybeSingle();
    if (!profile || profile.role !== "teacher" || !profile.is_active) {
      await supabase.auth.signOut();
      setError("Tài khoản này chưa được cấp quyền giáo viên. Hãy kiểm tra bước khởi tạo trong hướng dẫn.");
      setLoading(false);
      return;
    }
    router.replace("/teacher");
  }

  async function handleStudentLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Đã có lỗi xảy ra. Hãy thử lại.");
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
          <div className="auth-tabs"><button className={mode === "student" ? "active" : ""} onClick={() => { setMode("student"); setError(""); }}>Em là học viên</button><button className={mode === "teacher" ? "active" : ""} onClick={() => { setMode("teacher"); setError(""); }}>Thầy / Cô giáo</button></div>
          {mode === "student" ? <form className="auth-form" onSubmit={handleStudentLogin}>
            <label>Mã học viên<input autoCapitalize="characters" autoComplete="username" value={studentCode} onChange={(event) => setStudentCode(event.target.value.toUpperCase())} placeholder="Ví dụ: K7M4P9Q" required minLength={6} maxLength={10}/></label>
            <label>Mã PIN 8 chữ số<input inputMode="numeric" autoComplete="current-password" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="Nhập mã PIN của em" required minLength={8} maxLength={8}/></label>
            <p className="auth-helper"><KeyRound size={14}/> Mã đăng nhập do giáo viên cấp. Nếu quên, hãy nhờ thầy cấp lại.</p>
            <button className="auth-submit" disabled={loading}>{loading ? "Đang đăng nhập..." : "Vào cuộc phiêu lưu"}<Sparkles size={17}/></button>
          </form> : <form className="auth-form" onSubmit={handleTeacherLogin}>
            <label>Email giáo viên<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="teacher@example.com" required/></label>
            <label>Mật khẩu<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mật khẩu tài khoản" required/></label>
            <p className="auth-helper"><ShieldCheck size={14}/> Tài khoản giáo viên được tạo và cấp quyền trong Supabase.</p>
            <button className="auth-submit" disabled={loading}>{loading ? "Đang đăng nhập..." : "Mở Teacher Studio"}<BookOpen size={17}/></button>
          </form>}
          {error && <p className="auth-error" role="alert">{error}</p>}
        </>}
        <div className="auth-foot">Học vui · Nghĩ sâu · Chơi đẹp</div>
      </section>
    </main>
  );
}
