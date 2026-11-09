import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Chess } from "chess.js";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

function parseUciLine(value: unknown): string[] | null {
  if (typeof value !== "string") return null;
  const moves = value.trim().split(/\s+/).filter(Boolean);
  if (!moves.length || moves.length > 40) return null;
  return moves.every((move) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)) ? moves : null;
}

function verifySolution(fen: string, moves: string[]) {
  try {
    const game = new Chess(fen);
    for (const uci of moves) {
      const from = uci.slice(0, 2);
      const to = uci.slice(2, 4);
      const promotion = uci[4];
      const applied = game.move({ from, to, ...(promotion ? { promotion } : {}) });
      if (!applied) return false;
    }
    return true;
  } catch { return false; }
}

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
  if (!teacher || teacher.role !== "teacher" || !teacher.is_active) return NextResponse.json({ error: "Chỉ giáo viên mới được tạo câu đố." }, { status: 403 });

  let body: {
    title?: string; subtitle?: string; difficulty?: string; theme?: string; zone?: string;
    fen?: string; solutionUci?: string; hint1?: string; explanation?: string;
    rewardStars?: number; rewardPoints?: number;
  };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Dữ liệu gửi lên không hợp lệ." }, { status: 400 }); }

  const title = String(body.title ?? "").trim().slice(0, 100);
  const subtitle = String(body.subtitle ?? "").trim().slice(0, 180);
  const difficulty = String(body.difficulty ?? "Dễ");
  const theme = String(body.theme ?? "Chiến thuật").trim().slice(0, 50);
  const zone = String(body.zone ?? "Đấu trường chiến thuật").trim().slice(0, 70);
  const fen = String(body.fen ?? "").trim();
  const hint1 = String(body.hint1 ?? "").trim().slice(0, 500);
  const explanation = String(body.explanation ?? "").trim().slice(0, 1000);
  const rewardStars = Number(body.rewardStars);
  const defaultPoints = difficulty === "Khó" ? 200 : difficulty === "Vừa" ? 150 : 100;
  const rewardPoints = body.rewardPoints === undefined ? defaultPoints : Number(body.rewardPoints);
  const publishToStudents = false;
  const solution = parseUciLine(body.solutionUci);

  const { data: louisProfile, error: louisLookupError } = await admin.from("profiles")
    .select("id,display_name").eq("teacher_id", authData.user.id).eq("role", "student").maybeSingle();
  if (louisLookupError) return NextResponse.json({ error: "Không xác định được hồ sơ LOUIS. Hãy kiểm tra migration 0006." }, { status: 500 });
  if (!louisProfile || louisProfile.display_name !== "LOUIS") return NextResponse.json({ error: "Hãy tạo tài khoản LOUIS trước khi giao câu đố." }, { status: 400 });
  const assignedStudentIds = [louisProfile.id];

  if (!title || !subtitle || !fen || !theme || !solution) return NextResponse.json({ error: "Hãy điền tiêu đề, mô tả, FEN và chuỗi nước đi UCI hợp lệ." }, { status: 400 });
  if (!["Dễ", "Vừa", "Khó"].includes(difficulty)) return NextResponse.json({ error: "Mức độ câu đố không hợp lệ." }, { status: 400 });
  if (!Number.isInteger(rewardStars) || rewardStars < 0 || rewardStars > 100) return NextResponse.json({ error: "Số sao thưởng phải từ 0 đến 100." }, { status: 400 });
  if (!Number.isInteger(rewardPoints) || rewardPoints < 0 || rewardPoints > 5000) return NextResponse.json({ error: "Điểm XP thưởng phải từ 0 đến 5.000." }, { status: 400 });
  if (!verifySolution(fen, solution)) return NextResponse.json({ error: "FEN hoặc chuỗi nước đi có lỗi. Có ít nhất một nước đi không hợp lệ theo luật cờ vua." }, { status: 422 });

  const { data: puzzle, error: insertError } = await admin.from("puzzles").insert({
    created_by: authData.user.id,
    title,
    subtitle,
    difficulty,
    theme,
    zone,
    fen,
    hint_1: hint1 || null,
    explanation: explanation || null,
    reward_stars: rewardStars,
    reward_points: rewardPoints,
    is_published: publishToStudents,
    reviewed_at: new Date().toISOString(),
  }).select("id,title").single();
  if (insertError || !puzzle) return NextResponse.json({ error: "Không lưu được câu đố. Hãy kiểm tra cấu trúc database." }, { status: 500 });

  const { error: solutionError } = await admin.from("puzzle_solutions").insert({
    puzzle_id: puzzle.id,
    solution_uci: solution,
    accepted_lines: [solution],
  });
  if (solutionError) {
    await admin.from("puzzles").delete().eq("id", puzzle.id).eq("created_by", authData.user.id);
    return NextResponse.json({ error: "Không lưu được đáp án riêng tư. Câu đố vừa tạo đã được thu hồi." }, { status: 500 });
  }

  if (assignedStudentIds.length) {
    const assignmentRows = assignedStudentIds.map((studentId) => ({
      puzzle_id: puzzle.id,
      student_id: studentId,
      assigned_by: authData.user.id,
    }));
    const { error: assignmentError } = await admin.from("puzzle_assignments").insert(assignmentRows);
    if (assignmentError) {
      await admin.from("puzzles").delete().eq("id", puzzle.id).eq("created_by", authData.user.id);
      return NextResponse.json({ error: "Không giao được câu đố. Câu đố vừa tạo đã được thu hồi để tránh dữ liệu dở dang." }, { status: 500 });
    }
  }

  return NextResponse.json({ id: puzzle.id, title: puzzle.title, assignedTo: "LOUIS", assignedCount: 1, published: false }, { status: 201 });
}
