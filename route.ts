import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Chess } from "chess.js";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { verifyPuzzleSessionToken } from "@/lib/puzzle-session";

export const runtime = "nodejs";

type PuzzleRow = {
  id: string;
  created_by: string;
  fen: string;
  is_published: boolean;
};

function isUciLine(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 40 && value.every((move) => typeof move === "string" && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move));
}
function isAllowedLine(value: string[], allowed: string[][]) {
  return allowed.some((line) => line.length === value.length && line.every((move, index) => move === value[index]));
}
function verifyLegalLine(fen: string, moves: string[]) {
  try {
    const game = new Chess(fen);
    for (const move of moves) {
      const match = move.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/);
      if (!match) return false;
      const result = game.move({ from: match[1], to: match[2], ...(match[3] ? { promotion: match[3] } : {}) });
      if (!result) return false;
    }
    return true;
  } catch { return false; }
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const admin = getSupabaseAdmin();
  if (!url || !publishableKey || !admin) return NextResponse.json({ error: "Chưa cấu hình Supabase." }, { status: 503 });

  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn." }, { status: 401 });
  const authClient = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return NextResponse.json({ error: "Phiên đăng nhập không hợp lệ." }, { status: 401 });

  const { data: profile } = await admin.from("profiles").select("role,is_active,teacher_id").eq("id", authData.user.id).maybeSingle();
  if (!profile || profile.role !== "student" || !profile.is_active) return NextResponse.json({ error: "Tài khoản học viên không hợp lệ." }, { status: 403 });

  let body: { puzzleId?: string; movesUci?: unknown; hintsUsed?: number; elapsedSeconds?: number; stateToken?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Dữ liệu gửi lên không hợp lệ." }, { status: 400 }); }
  const puzzleId = String(body.puzzleId ?? "");
  const movesUci = body.movesUci;
  const hintsUsed = Number.isInteger(body.hintsUsed) ? Math.max(0, Math.min(50, Number(body.hintsUsed))) : 0;
  const elapsedSeconds = Number.isInteger(body.elapsedSeconds) ? Math.max(0, Math.min(86_400, Number(body.elapsedSeconds))) : null;
  if (!/^[0-9a-f-]{36}$/i.test(puzzleId) || !isUciLine(movesUci)) {
    return NextResponse.json({ error: "Bài làm chưa đúng định dạng." }, { status: 400 });
  }
  const session = verifyPuzzleSessionToken(body.stateToken);
  if (!session || session.puzzleId !== puzzleId || session.studentId !== authData.user.id || !session.completed ||
    session.movesUci.length !== movesUci.length || session.movesUci.some((move, index) => move !== movesUci[index])) {
    return NextResponse.json({ error: "Chưa xác nhận được toàn bộ quá trình giải. Hãy mở lại câu đố và thử lại." }, { status: 409 });
  }

  const { data: puzzleData, error: puzzleError } = await admin.from("puzzles")
    .select("id,created_by,fen,is_published")
    .eq("id", puzzleId).maybeSingle();
  if (puzzleError || !puzzleData) return NextResponse.json({ error: "Không tìm thấy câu đố." }, { status: 404 });
  const puzzle = puzzleData as PuzzleRow;
  if (!profile.teacher_id || puzzle.created_by !== profile.teacher_id) {
    return NextResponse.json({ error: "Câu đố này không thuộc lớp của em." }, { status: 403 });
  }
  if (!puzzle.is_published) {
    const { data: assignment } = await admin.from("puzzle_assignments").select("id,status")
      .eq("puzzle_id", puzzleId).eq("student_id", authData.user.id).neq("status", "cancelled").maybeSingle();
    if (!assignment) return NextResponse.json({ error: "Câu đố này chưa được giao cho em." }, { status: 403 });
  }

  const { data: solutionData, error: solutionError } = await admin.from("puzzle_solutions")
    .select("solution_uci,accepted_lines").eq("puzzle_id", puzzleId).maybeSingle();
  if (solutionError || !solutionData) return NextResponse.json({ error: "Không tìm thấy đáp án riêng tư của câu đố." }, { status: 500 });
  const mainLine = isUciLine(solutionData.solution_uci) ? [solutionData.solution_uci] : [];
  const alternates = Array.isArray(solutionData.accepted_lines)
    ? solutionData.accepted_lines.filter(isUciLine)
    : [];
  const allowedLines = [...mainLine, ...alternates];
  if (!verifyLegalLine(puzzle.fen, movesUci) || !isAllowedLine(movesUci, allowedLines)) {
    return NextResponse.json({ error: "Chuỗi nước đi chưa khớp với lời giải đã được giáo viên duyệt." }, { status: 422 });
  }

  const { data: result, error: recordError } = await admin.rpc("record_puzzle_success", {
    p_student_id: authData.user.id,
    p_puzzle_id: puzzleId,
    p_moves_uci: movesUci,
    p_hints_used: hintsUsed,
    p_elapsed_seconds: elapsedSeconds,
  });
  if (recordError) return NextResponse.json({ error: "Không lưu được kết quả. Hãy thử lại." }, { status: 500 });
  return NextResponse.json(result);
}
