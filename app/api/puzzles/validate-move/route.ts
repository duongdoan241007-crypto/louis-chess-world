import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Chess } from "chess.js";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { createPuzzleSessionToken, verifyPuzzleSessionToken } from "@/lib/puzzle-session";

export const runtime = "nodejs";

type PuzzleRow = {
  id: string;
  created_by: string;
  fen: string;
  is_published: boolean;
};

function isUci(value: unknown): value is string {
  return typeof value === "string" && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(value);
}
function isUciLine(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 40 && value.every(isUci);
}
function legalLine(fen: string, line: string[]) {
  try {
    const game = new Chess(fen);
    for (const uci of line) {
      const result = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), ...(uci[4] ? { promotion: uci[4] } : {}) });
      if (!result) return false;
    }
    return true;
  } catch { return false; }
}
function applyUci(game: Chess, uci: string) {
  const move = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), ...(uci[4] ? { promotion: uci[4] } : {}) });
  return Boolean(move);
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

  let body: { puzzleId?: string; movesUci?: unknown; moveUci?: unknown; stateToken?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Dữ liệu gửi lên không hợp lệ." }, { status: 400 }); }
  const puzzleId = String(body.puzzleId ?? "");
  const movesUci = body.movesUci;
  const moveUci = body.moveUci;
  if (!/^[0-9a-f-]{36}$/i.test(puzzleId) || !Array.isArray(movesUci) || movesUci.length > 40 || !movesUci.every(isUci) || !isUci(moveUci)) {
    return NextResponse.json({ error: "Nước đi chưa đúng định dạng." }, { status: 400 });
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
    .select("id,created_by,fen,is_published")
    .eq("id", puzzleId).maybeSingle();
  if (puzzleError || !puzzleData) return NextResponse.json({ error: "Không tìm thấy câu đố." }, { status: 404 });
  const puzzle = puzzleData as PuzzleRow;
  if (puzzle.created_by !== profile.teacher_id) return NextResponse.json({ error: "Câu đố không thuộc lớp của em." }, { status: 403 });

  if (!puzzle.is_published) {
    const { data: assignment } = await admin.from("puzzle_assignments").select("id,status")
      .eq("puzzle_id", puzzleId).eq("student_id", authData.user.id).neq("status", "cancelled").maybeSingle();
    if (!assignment) return NextResponse.json({ error: "Câu đố này chưa được giao cho em." }, { status: 403 });
  }

  const moveLimitKey = createHash("sha256").update(`${authData.user.id}|${puzzleId}`).digest("hex");
  const { data: allowed, error: limitError } = await admin.rpc("consume_puzzle_move_attempt", { p_key_hash: moveLimitKey });
  if (limitError) return NextResponse.json({ error: "Chưa thể kiểm tra giới hạn thử nước đi. Hãy thử lại sau." }, { status: 503 });
  if (allowed !== true) return NextResponse.json({ error: "Con đã thử khá nhiều nước rồi. Hãy nghỉ một chút và quay lại sau 15 phút nhé!" }, { status: 429 });

  const { data: solutionData, error: solutionError } = await admin.from("puzzle_solutions")
    .select("solution_uci,accepted_lines").eq("puzzle_id", puzzleId).maybeSingle();
  if (solutionError || !solutionData) return NextResponse.json({ error: "Câu đố chưa có đáp án được lưu riêng tư." }, { status: 500 });
  const mainLine = isUciLine(solutionData.solution_uci) ? [solutionData.solution_uci] : [];
  const alternates = Array.isArray(solutionData.accepted_lines) ? solutionData.accepted_lines.filter(isUciLine) : [];
  const allowedLines = [...new Map([...mainLine, ...alternates].map((line) => [line.join(" "), line])).values()]
    .filter((line) => legalLine(puzzle.fen, line));
  const candidates = allowedLines.filter((line) =>
    line.length > movesUci.length &&
    movesUci.every((move, index) => line[index] === move) &&
    line[movesUci.length] === moveUci
  );
  if (!candidates.length) return NextResponse.json({ accepted: false, message: "Chưa đúng hướng rồi. Con thử nghĩ thêm nhé!" });

  const selectedLine = candidates[0];
  const game = new Chess(puzzle.fen);
  for (const move of movesUci as string[]) {
    if (!applyUci(game, move)) return NextResponse.json({ error: "Chuỗi nước đi trước đó không hợp lệ." }, { status: 409 });
  }
  if (!applyUci(game, moveUci)) return NextResponse.json({ accepted: false, message: "Nước đi này không hợp lệ." });

  const newMoves = [...movesUci, moveUci];
  const opponentMoves: string[] = [];
  const playerColor = new Chess(puzzle.fen).turn();
  while (newMoves.length < selectedLine.length && game.turn() !== playerColor) {
    const reply = selectedLine[newMoves.length];
    if (!applyUci(game, reply)) return NextResponse.json({ error: "Lời giải có nước đáp trả không hợp lệ." }, { status: 500 });
    newMoves.push(reply);
    opponentMoves.push(reply);
  }

  const completed = newMoves.length === selectedLine.length;
  const nextStateToken = createPuzzleSessionToken({
    puzzleId,
    studentId: authData.user.id,
    movesUci: newMoves,
    completed,
  });
  return NextResponse.json({ accepted: true, opponentMoves, completed, stateToken: nextStateToken });
}
