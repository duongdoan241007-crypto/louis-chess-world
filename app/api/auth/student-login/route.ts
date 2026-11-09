import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const admin = getSupabaseAdmin();
  if (!url || !publishableKey || !admin) {
    return jsonError("Hệ thống đăng nhập học viên chưa được cấu hình đầy đủ.", 503);
  }

  let body: { studentCode?: string; pin?: string };
  try { body = await request.json(); } catch { return jsonError("Dữ liệu gửi lên không hợp lệ.", 400); }

  const studentCode = String(body.studentCode ?? "").trim().toUpperCase();
  const pin = String(body.pin ?? "").trim();
  if (!/^[A-HJ-NP-Z2-9]{6,10}$/.test(studentCode) || !/^\d{8}$/.test(pin)) {
    return jsonError("Mã học viên hoặc PIN chưa đúng định dạng.", 400);
  }

  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const keyHash = createHash("sha256").update(`${forwardedFor}|${studentCode}`).digest("hex");
  const { data: allowed, error: rateError } = await admin.rpc("consume_student_login_attempt", { p_key_hash: keyHash });
  if (rateError) return jsonError("Chưa thể kiểm tra giới hạn đăng nhập. Hãy thử lại sau.", 503);
  if (allowed !== true) return jsonError("Tạm khóa đăng nhập do thử quá nhiều lần. Hãy chờ 15 phút rồi thử lại.", 429);

  const authClient = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const email = `student.${studentCode.toLowerCase()}@login.chess64.invalid`;
  const { data, error } = await authClient.auth.signInWithPassword({ email, password: pin });
  if (error || !data.session || !data.user) return jsonError("Mã học viên hoặc PIN không chính xác.", 401);

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role,is_active")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profileError || !profile || profile.role !== "student" || !profile.is_active) {
    await authClient.auth.signOut();
    return jsonError("Tài khoản chưa được kích hoạt. Vui lòng liên hệ giáo viên.", 403);
  }

  return NextResponse.json({ session: data.session });
}
