import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeCode(length = 7) {
  return Array.from({ length }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
}
function makePin() { return String(randomInt(10_000_000, 100_000_000)); }
function errorJson(message: string, status: number) { return NextResponse.json({ error: message }, { status }); }

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const admin = getSupabaseAdmin();
  if (!url || !publishableKey || !admin) return errorJson("Thiếu cấu hình Supabase phía máy chủ.", 503);

  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return errorJson("Vui lòng đăng nhập lại.", 401);

  const authClient = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return errorJson("Phiên đăng nhập không hợp lệ.", 401);

  const { data: teacher, error: teacherError } = await admin
    .from("profiles").select("role,is_active").eq("id", authData.user.id).maybeSingle();
  if (teacherError || !teacher || teacher.role !== "teacher" || !teacher.is_active) {
    return errorJson("Chỉ giáo viên đã được cấp quyền mới được tạo học viên.", 403);
  }

  const { data: existingLearner, error: existingError } = await admin
    .from("profiles").select("id").eq("teacher_id", authData.user.id).eq("role", "student").limit(1).maybeSingle();
  if (existingError) return errorJson("Không kiểm tra được hồ sơ LOUIS hiện có.", 500);
  if (existingLearner) return errorJson("Tài khoản LOUIS đã được tạo. Website này chỉ quản lý một học viên duy nhất.", 409);

  let body: { photoConsentConfirmed?: boolean };
  try { body = await request.json(); } catch { return errorJson("Dữ liệu gửi lên không hợp lệ.", 400); }
  // This product is intentionally configured for one learner only.
  const displayName = "LOUIS";
  const nickname = "LOUIS";

  const studentCode = makeCode();
  const pin = makePin();
  const email = `student.${studentCode.toLowerCase()}@login.chess64.invalid`;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: pin,
    email_confirm: true,
    user_metadata: { display_name: displayName, nickname, account_type: "student" },
  });
  if (createError || !created.user) return errorJson("Không tạo được tài khoản học viên. Hãy thử lại.", 500);

  const studentId = created.user.id;
  const { error: profileError } = await admin.from("profiles").upsert({
    id: studentId,
    role: "student",
    display_name: displayName,
    nickname,
    teacher_id: authData.user.id,
    student_code: studentCode,
    is_active: true,
    photo_consent_confirmed_at: body.photoConsentConfirmed ? new Date().toISOString() : null,
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(studentId);
    return errorJson("Không lưu được hồ sơ học viên. Tài khoản vừa tạo đã được thu hồi.", 500);
  }

  const { error: progressError } = await admin.from("student_progress").upsert({ student_id: studentId });
  if (progressError) {
    await admin.auth.admin.deleteUser(studentId);
    return errorJson("Không khởi tạo được tiến trình học viên. Tài khoản vừa tạo đã được thu hồi.", 500);
  }


  return NextResponse.json({
    student: { id: studentId, displayName, nickname, studentCode },
    credentials: { studentCode, pin },
    warning: "PIN chỉ hiển thị một lần. Hãy gửi riêng cho phụ huynh/học viên và không đăng công khai.",
  }, { status: 201 });
}
