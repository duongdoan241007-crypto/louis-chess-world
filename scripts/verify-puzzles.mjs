import { Chess } from "chess.js";
import { readFile } from "node:fs/promises";

const privatePuzzles = JSON.parse(await readFile(new URL("../lib/puzzles-data.json", import.meta.url), "utf8"));
const publicPuzzles = JSON.parse(await readFile(new URL("../lib/puzzles-public.json", import.meta.url), "utf8"));
if (!Array.isArray(privatePuzzles) || !Array.isArray(publicPuzzles)) throw new Error("Puzzle datasets must be arrays.");
if (privatePuzzles.length !== publicPuzzles.length) throw new Error("Public/private puzzle counts do not match.");

const publicById = new Map(publicPuzzles.map((puzzle) => [puzzle.id, puzzle]));
for (const puzzle of privatePuzzles) {
  if (!puzzle.id || !puzzle.fen || !Array.isArray(puzzle.solution) || puzzle.solution.length === 0) {
    throw new Error(`${puzzle.id ?? "Unknown puzzle"}: missing FEN or private solution.`);
  }
  if (!Number.isInteger(puzzle.reward) || puzzle.reward < 0 || puzzle.reward > 100) {
    throw new Error(`${puzzle.id}: invalid star reward.`);
  }
  if (!Number.isInteger(puzzle.rewardPoints) || puzzle.rewardPoints < 0 || puzzle.rewardPoints > 5000) {
    throw new Error(`${puzzle.id}: invalid XP reward.`);
  }

  const chess = new Chess(puzzle.fen);
  for (const uci of puzzle.solution) {
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci[4];
    const candidate = chess.moves({ square: from, verbose: true }).find((move) =>
      move.from === from && move.to === to && (move.promotion ?? "") === (promotion ?? "")
    );
    if (!candidate) throw new Error(`${puzzle.id}: illegal or missing move ${uci} from ${chess.fen()}`);
    const applied = chess.move({ from, to, ...(promotion ? { promotion } : {}) });
    if (!applied) throw new Error(`${puzzle.id}: move application failed for ${uci}`);
  }

  const publicPuzzle = publicById.get(puzzle.id);
  if (!publicPuzzle) throw new Error(`${puzzle.id}: missing public metadata.`);
  if (!Array.isArray(publicPuzzle.solution) || publicPuzzle.solution.length !== 0 ||
      Object.hasOwn(publicPuzzle, "solution_uci") || Object.hasOwn(publicPuzzle, "accepted_lines")) {
    throw new Error(`${puzzle.id}: private solution leaked into public data.`);
  }
  if (publicPuzzle.rewardPoints !== puzzle.rewardPoints) {
    throw new Error(`${puzzle.id}: public XP reward does not match the private puzzle data.`);
  }
  console.log(`OK  ${puzzle.id} — ${puzzle.rewardPoints} XP / ${puzzle.reward} stars`);
}

for (const puzzle of publicPuzzles) {
  if (!privatePuzzles.some((item) => item.id === puzzle.id)) throw new Error(`Unknown public puzzle id: ${puzzle.id}`);
}
console.log(`Validated ${privatePuzzles.length} legal puzzle lines, XP rewards, and public/private separation.`);
