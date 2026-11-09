import "server-only";
import { NextResponse } from "next/server";
import { Chess } from "chess.js";
import { privatePuzzles } from "@/lib/puzzles-private";

export const runtime = "nodejs";
function isUci(value: unknown): value is string {
  return typeof value === "string" && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(value);
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
  let body: { puzzleId?: string; movesUci?: unknown; step?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Dữ liệu gợi ý không hợp lệ." }, { status: 400 }); }
  const movesUci = body.movesUci;
  const step = Number(body.step);
  if (typeof body.puzzleId !== "string" || !Array.isArray(movesUci) || movesUci.length > 40 || !movesUci.every(isUci) || ![1, 2, 3].includes(step)) {
    return NextResponse.json({ error: "Yêu cầu gợi ý chưa đúng định dạng." }, { status: 400 });
  }
  const puzzle = privatePuzzles.find((item) => item.id === body.puzzleId);
  if (!puzzle || !legalLine(puzzle.fen, puzzle.solution)) return NextResponse.json({ error: "Không tìm thấy câu đố hợp lệ." }, { status: 404 });
  if (puzzle.solution.length <= movesUci.length || !movesUci.every((move, index) => puzzle.solution[index] === move)) {
    return NextResponse.json({ error: "Không còn gợi ý cho trạng thái hiện tại." }, { status: 409 });
  }
  const nextMove = puzzle.solution[movesUci.length];
  return NextResponse.json({ step, from: nextMove.slice(0, 2), ...(step >= 2 ? { to: nextMove.slice(2, 4) } : {}), preview: step === 3 });
}
