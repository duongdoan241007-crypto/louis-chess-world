import "server-only";
import { privatePuzzles } from "@/lib/puzzles-private";

// Server-only compatibility export. Do not import this module from client components.
export const puzzles = privatePuzzles;
