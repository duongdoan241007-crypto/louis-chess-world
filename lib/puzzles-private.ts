import "server-only";
import puzzleData from "@/lib/puzzles-data.json";
import type { Puzzle } from "@/lib/types";

// Full answer lines are imported only by server routes and must never enter client bundles.
export const privatePuzzles = puzzleData as Puzzle[];
