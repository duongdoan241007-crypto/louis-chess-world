import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export type PuzzleSessionPayload = {
  puzzleId: string;
  studentId: string;
  movesUci: string[];
  completed: boolean;
  expiresAt: number;
};

function secret() {
  const value = process.env.PUZZLE_SESSION_SECRET || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return value && value.length >= 32 ? value : null;
}

function signature(encodedPayload: string, key: string) {
  return createHmac("sha256", key).update(encodedPayload).digest("base64url");
}

export function createPuzzleSessionToken(payload: Omit<PuzzleSessionPayload, "expiresAt">) {
  const key = secret();
  if (!key) throw new Error("Missing PUZZLE_SESSION_SECRET or service-role key.");
  const value: PuzzleSessionPayload = { ...payload, expiresAt: Date.now() + 2 * 60 * 60 * 1000 };
  const encoded = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encoded}.${signature(encoded, key)}`;
}

export function verifyPuzzleSessionToken(token: unknown): PuzzleSessionPayload | null {
  if (typeof token !== "string" || token.length > 12000) return null;
  const [encoded, suppliedSignature, extra] = token.split(".");
  const key = secret();
  if (!key || !encoded || !suppliedSignature || extra !== undefined) return null;
  const expectedSignature = signature(encoded, key);
  const left = Buffer.from(suppliedSignature);
  const right = Buffer.from(expectedSignature);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as PuzzleSessionPayload;
    if (
      typeof payload.puzzleId !== "string" ||
      typeof payload.studentId !== "string" ||
      !Array.isArray(payload.movesUci) ||
      !payload.movesUci.every((move) => typeof move === "string" && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)) ||
      typeof payload.completed !== "boolean" ||
      typeof payload.expiresAt !== "number" || payload.expiresAt < Date.now()
    ) return null;
    return payload;
  } catch {
    return null;
  }
}
