import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
    (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
  );

  return NextResponse.json({
    status: "ok",
    app: "louis-chess-world",
    supabaseConfigured,
    puzzleSessionConfigured: Boolean(process.env.PUZZLE_SESSION_SECRET && process.env.PUZZLE_SESSION_SECRET.length >= 32),
  }, { headers: { "Cache-Control": "no-store" } });
}
