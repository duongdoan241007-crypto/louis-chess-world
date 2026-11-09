import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Chess } from "chess.js";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { verifyPuzzleSessionToken } from "@/lib/puzzle-session";

export const runtime = "nodejs";

type PuzzleRow = { id: string; created_by: string; fen: string; is_published: boolean };
function isUci(value: unknown): value is string {
  return typeof value === "string" && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(value);
}
function isUciLine(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 40 && value.every(isUci);
}
function legalLine(fen: string, line: string[]) {
  try {
    const game = new Chess(fen);
    for (const move of line) {
      const result = game.move({ from: move.slice(0, 2), to: move.slice(2, 4), ...(move[4] ? { promotion: move[4] } : {}) });
      if (!result) return false;
    }
    return true;
  } catch { return false; }
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const admin = getSupabaseAdmin();
  if (!url || !publishableKey || !admin) return NextResponse.json({ error: "Chưa cấu hình Supabase phía máy chủ." }, { status: 503 });

  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn." }, { status: 401 });
  const authClient = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return NextResponse.json({ error: "Phiên đăng nhập không hợp lệ." }, { status: 401 });

  const { data: profile } = await admin.from("profiles").select("role,is_active,teacher_id").eq("id", authData.user.id).maybeSingle();
  if (!profile || profile.role !== "student" || !profile.is_active || !profile.teacher_id) {
    return NextResponse.json({ error: "Tài khoản học viên không hợp lệ." }, { status: 403 });
  }

  let body: { puzzleId?: string; movesUci?: unknown; stateToken?: unknown; step?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Dữ liệu gợi ý không hợp lệ." }, { status: 400 }); }
  const puzzleId = String(body.puzzleId ?? "");
  const movesUci = body.movesUci;
  const step = Number(body.step);
  if (!/^[0-9a-f-]{36}$/i.test(puzzleId) || !Array.isArray(movesUci) || movesUci.length > 40 || !movesUci.every(isUci) || ![1, 2, 3].includes(step)) {
    return NextResponse.json({ error: "Yêu cầu gợi ý chưa đúng định dạng." }, { status: 400 });
  }
  if (movesUci.length === 0) {
    if (body.stateToken) return NextResponse.json({ error: "Phiên giải đố không hợp lệ." }, { status: 409 });
  } else {
    const session = verifyPuzzleSessionToken(body.stateToken);
    if (!session || session.puzzleId !== puzzleId || session.studentId !== authData.user.id || session.completed ||
      session.movesUci.length !== movesUci.length || session.movesUci.some((move, index) => move !== movesUci[index])) {
      return NextResponse.json({ error: "Trạng thái câu đố không còn hợp lệ. Hãy khởi động lại thử thách." }, { status: 409 });
    }
  }

  const { data: puzzleData, error: puzzleError } = await admin.from("puzzles")
    .select("id,created_by,fen,is_published").eq("id", puzzleId).maybeSingle();
  if (puzzleError || !puzzleData) return NextResponse.json({ error: "Không tìm thấy câu đố." }, { status: 404 });
  const puzzle = puzzleData as PuzzleRow;
  if (puzzle.created_by !== profile.teacher_id) return NextResponse.json({ error: "Câu đố không thuộc giáo viên của em." }, { status: 403 });
  if (!puzzle.is_published) {
    const { data: assignment } = await admin.from("puzzle_assignments").select("id,status")
      .eq("puzzle_id", puzzleId).eq("student_id", authData.user.id).neq("status", "cancelled").maybeSingle();
    if (!assignment) return NextResponse.json({ error: "Câu đố này chưa được giao cho em." }, { status: 403 });
  }

  const { data: solutionData, error: solutionError } = await admin.from("puzzle_solutions")
    .select("solution_uci,accepted_lines").eq("puzzle_id", puzzleId).maybeSingle();
  if (solutionError || !solutionData) return NextResponse.json({ error: "Câu đố chưa có lời giải riêng tư." }, { status: 500 });
  const mainLine = isUciLine(solutionData.solution_uci) ? [solutionData.solution_uci] : [];
  const alternates = Array.isArray(solutionData.accepted_lines) ? solutionData.accepted_lines.filter(isUciLine) : [];
  const allowedLines = [...new Map([...mainLine, ...alternates].map((line) => [line.join(" "), line])).values()]
    .filter((line) => legalLine(puzzle.fen, line));
  const candidates = allowedLines.filter((line) => line.length > movesUci.length &&
    movesUci.every((move, index) => line[index] === move));
  if (!candidates.length) return NextResponse.json({ error: "Không còn gợi ý cho trạng thái hiện tại." }, { status: 409 });

  const game = new Chess(puzzle.fen);
  for (const move of movesUci as string[]) {
    const applied = game.move({ from: move.slice(0, 2), to: move.slice(2, 4), ...(move[4] ? { promotion: move[4] } : {}) });
    if (!applied) return NextResponse.json({ error: "Lịch sử nước đi không hợp lệ." }, { status: 409 });
  }
  const nextMove = candidates[0][movesUci.length];
  // Only disclose board coordinates needed for the requested visual hint, never the answer line.
  return NextResponse.json({
    step,
    from: nextMove.slice(0, 2),
    ...(step >= 2 ? { to: nextMove.slice(2, 4) } : {}),
    preview: step === 3,
  });
}
