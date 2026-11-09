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
