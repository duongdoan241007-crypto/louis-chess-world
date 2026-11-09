import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

type Context = { params: Promise<{ studentId: string }> };

export async function PATCH(request: Request, context: Context) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const admin = getSupabaseAdmin();
  if (!url || !publishableKey || !admin) return NextResponse.json({ error: "Thiếu cấu hình Supabase phía máy chủ." }, { status: 503 });

  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Vui lòng đăng nhập lại." }, { status: 401 });
  const authClient = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return NextResponse.json({ error: "Phiên đăng nhập không hợp lệ." }, { status: 401 });

  const { data: teacher } = await admin.from("profiles").select("role,is_active").eq("id", authData.user.id).maybeSingle();
  if (!teacher || teacher.role !== "teacher" || !teacher.is_active) return NextResponse.json({ error: "Chỉ giáo viên đang hoạt động mới được quản lý tài khoản." }, { status: 403 });

  const { studentId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(studentId)) return NextResponse.json({ error: "Mã học viên không hợp lệ." }, { status: 400 });
  const { data: student, error: studentError } = await admin.from("profiles")
    .select("id,role,student_code,is_active").eq("id", studentId).eq("teacher_id", authData.user.id).maybeSingle();
  if (studentError || !student || student.role !== "student") return NextResponse.json({ error: "Học viên không thuộc quyền quản lý của thầy." }, { status: 404 });

  let body: { action?: string; isActive?: boolean };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Dữ liệu gửi lên không hợp lệ." }, { status: 400 }); }

  if (body.action === "reset_pin") {
    const pin = String(randomInt(10_000_000, 100_000_000));
    const { error } = await admin.auth.admin.updateUserById(studentId, { password: pin });
    if (error) return NextResponse.json({ error: "Không thể đặt lại PIN. Hãy thử lại." }, { status: 500 });
    return NextResponse.json({ studentCode: student.student_code, pin, message: "PIN mới chỉ được hiển thị lần này." });
  }

  if (body.action === "set_active" && typeof body.isActive === "boolean") {
    const { error } = await admin.from("profiles").update({ is_active: body.isActive }).eq("id", studentId).eq("teacher_id", authData.user.id);
    if (error) return NextResponse.json({ error: "Không cập nhật được trạng thái tài khoản." }, { status: 500 });
    return NextResponse.json({ isActive: body.isActive });
  }

  return NextResponse.json({ error: "Thao tác không được hỗ trợ." }, { status: 400 });
}
