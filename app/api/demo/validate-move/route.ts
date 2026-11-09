import "server-only";
import { NextResponse } from "next/server";
import { Chess } from "chess.js";
import { privatePuzzles } from "@/lib/puzzles-private";

export const runtime = "nodejs";

function isUci(value: unknown): value is string {
  return typeof value === "string" && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(value);
}

function playUci(game: Chess, value: string) {
  const result = game.move({
    from: value.slice(0, 2),
    to: value.slice(2, 4),
    ...(value[4] ? { promotion: value[4] } : {}),
  });
  return Boolean(result);
}

function legalLine(fen: string, line: string[]) {
  try {
    const game = new Chess(fen);
    return line.every((move) => playUci(game, move));
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  let body: { puzzleId?: string; movesUci?: unknown; moveUci?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dữ liệu gửi lên không hợp lệ." }, { status: 400 });
  }

  const puzzleId = String(body.puzzleId ?? "");
  const movesUci = body.movesUci;
  const moveUci = body.moveUci;
  if (!Array.isArray(movesUci) || movesUci.length > 40 || !movesUci.every(isUci) || !isUci(moveUci)) {
    return NextResponse.json({ error: "Nước đi chưa đúng định dạng." }, { status: 400 });
  }

  const puzzle = privatePuzzles.find((item) => item.id === puzzleId);
  if (!puzzle) return NextResponse.json({ error: "Không tìm thấy câu đố demo." }, { status: 404 });

  const line = puzzle.solution;
  if (!legalLine(puzzle.fen, line) || line.length <= movesUci.length ||
      !movesUci.every((move, index) => line[index] === move) || line[movesUci.length] !== moveUci) {
    return NextResponse.json({ accepted: false, message: "Chưa đúng hướng rồi. Con thử nghĩ thêm nhé!" });
  }

  const game = new Chess(puzzle.fen);
  for (const move of movesUci as string[]) {
    if (!playUci(game, move)) return NextResponse.json({ error: "Trạng thái câu đố không hợp lệ." }, { status: 409 });
  }
  if (!playUci(game, moveUci)) return NextResponse.json({ accepted: false, message: "Nước đi này chưa đúng." });

  const newMoves = [...movesUci, moveUci];
  const opponentMoves: string[] = [];
  const studentColor = new Chess(puzzle.fen).turn();
  while (newMoves.length < line.length && game.turn() !== studentColor) {
    const reply = line[newMoves.length];
    if (!playUci(game, reply)) return NextResponse.json({ error: "Dữ liệu câu đố demo bị lỗi." }, { status: 500 });
    newMoves.push(reply);
    opponentMoves.push(reply);
  }

  return NextResponse.json({ accepted: true, opponentMoves, completed: newMoves.length === line.length });
}
