import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { privatePuzzles as puzzles } from "@/lib/puzzles-private";

export const runtime = "nodejs";

export async function POST(request: Request) {
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
  if (!teacher || teacher.role !== "teacher" || !teacher.is_active) return NextResponse.json({ error: "Chỉ giáo viên mới được nhập câu đố." }, { status: 403 });

  const { data: louisProfile, error: louisError } = await admin.from("profiles")
    .select("id,display_name").eq("teacher_id", authData.user.id).eq("role", "student").maybeSingle();
  if (louisError) return NextResponse.json({ error: "Không xác định được hồ sơ LOUIS. Hãy kiểm tra migration 0006." }, { status: 500 });
  if (!louisProfile || louisProfile.display_name !== "LOUIS") return NextResponse.json({ error: "Hãy tạo tài khoản LOUIS trước khi nhập câu đố mẫu." }, { status: 400 });

  const rows = puzzles.map((puzzle) => ({
    slug: puzzle.id,
    created_by: authData.user.id,
    title: puzzle.title,
    subtitle: puzzle.subtitle,
    difficulty: puzzle.difficulty,
    theme: puzzle.theme,
    zone: puzzle.zone,
    fen: puzzle.fen,
    hint_1: puzzle.hint,
    explanation: puzzle.explanation,
    reward_stars: puzzle.reward,
    reward_points: puzzle.rewardPoints,
    is_published: false,
    reviewed_at: new Date().toISOString(),
  }));

  const { error } = await admin.from("puzzles").upsert(rows, { onConflict: "created_by,slug", ignoreDuplicates: true });
  if (error) return NextResponse.json({ error: "Không nhập được bộ câu đố mẫu. Hãy kiểm tra các migration cơ sở dữ liệu." }, { status: 500 });
  const { data: createdPuzzles, error: lookupError } = await admin.from("puzzles")
    .select("id,slug").eq("created_by", authData.user.id).in("slug", puzzles.map((puzzle) => puzzle.id));
  if (lookupError || !createdPuzzles) return NextResponse.json({ error: "Đã tạo metadata nhưng không truy xuất được ID câu đố." }, { status: 500 });
  const typedCreatedPuzzles = createdPuzzles as { id: string; slug: string }[];
  const puzzleIds = typedCreatedPuzzles.map((row) => row.id);
  const { error: unpublishError } = await admin.from("puzzles").update({ is_published: false }).in("id", puzzleIds).eq("created_by", authData.user.id);
  if (unpublishError) return NextResponse.json({ error: "Không thể chuyển câu đố mẫu sang chế độ riêng tư." }, { status: 500 });
  const bySlug = new Map(puzzles.map((puzzle) => [puzzle.id, puzzle]));
  const solutionRows = typedCreatedPuzzles.flatMap((row) => {
    const source = bySlug.get(row.slug);
    return source ? [{ puzzle_id: row.id, solution_uci: source.solution, accepted_lines: [source.solution] }] : [];
  });
  const { error: solutionError } = await admin.from("puzzle_solutions").upsert(solutionRows, { onConflict: "puzzle_id", ignoreDuplicates: true });
  if (solutionError) return NextResponse.json({ error: "Không lưu được đáp án trong kho riêng tư. Hãy kiểm tra migration 0003." }, { status: 500 });
  const assignmentRows = typedCreatedPuzzles.map((row) => ({ puzzle_id: row.id, student_id: louisProfile.id, assigned_by: authData.user.id }));
  const { error: assignmentError } = await admin.from("puzzle_assignments").upsert(assignmentRows, { onConflict: "puzzle_id,student_id", ignoreDuplicates: true });
  if (assignmentError) return NextResponse.json({ error: "Đã lưu câu đố nhưng chưa giao được cho LOUIS. Hãy thử nhập lại." }, { status: 500 });
  return NextResponse.json({ imported: rows.length, assignedTo: "LOUIS", message: `Đã chuẩn bị ${rows.length} câu đố mẫu dành riêng cho LOUIS.` });
}
