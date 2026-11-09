"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Check, LogOut, ShieldCheck, Sparkles, Star, Target, Trophy } from "lucide-react";
import ChessArena from "@/components/chess-arena";
import { getSupabase } from "@/lib/supabase";
import type { Puzzle, PuzzleAward } from "@/lib/types";
import { getXpRank } from "@/lib/progression";

type Learner = { id: string; display_name: string; nickname: string | null; level: string; student_code: string | null; avatar_url: string | null };
type Progress = { stars_total: number; points_total: number; puzzles_solved: number; current_streak: number; best_streak: number };
type PointHistory = { id: string; points: number; reason: string; created_at: string };

export default function StudentPage() {
  const router = useRouter();
  const [student, setStudent] = useState<Learner | null>(null);
  const [progress, setProgress] = useState<Progress>({ stars_total: 0, points_total: 0, puzzles_solved: 0, current_streak: 0, best_streak: 0 });
  const [puzzles, setPuzzles] = useState<Puzzle[]>([]);
  const [activePuzzle, setActivePuzzle] = useState<Puzzle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [completedIds, setCompletedIds] = useState<string[]>([]);
  const [pointHistory, setPointHistory] = useState<PointHistory[]>([]);

  const refresh = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Chưa cấu hình Supabase.");
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) { router.replace("/login"); return; }
    const { data: profile, error: profileError } = await supabase.from("profiles")
      .select("id,role,display_name,nickname,level,student_code,is_active,avatar_path")
      .eq("id", user.id).maybeSingle();
    if (profileError || !profile || profile.role !== "student" || !profile.is_active) throw new Error("Tài khoản này không phải hồ sơ học viên đang hoạt động.");
    let avatarUrl: string | null = null;
    if (profile.avatar_path) {
      const { data: signed } = await supabase.storage.from("student-photos").createSignedUrl(profile.avatar_path, 3600);
      avatarUrl = signed?.signedUrl ?? null;
    }
    setStudent({ id: profile.id, display_name: profile.display_name, nickname: profile.nickname, level: profile.level, student_code: profile.student_code, avatar_url: avatarUrl });

    const [progressResult, puzzleResult, attemptResult, pointHistoryResult] = await Promise.all([
      supabase.from("student_progress").select("stars_total,points_total,puzzles_solved,current_streak,best_streak").eq("student_id", user.id).maybeSingle(),
      // Never send approved answers to the browser. Each move is checked server-side.
      supabase.from("puzzles").select("id,title,subtitle,difficulty,theme,zone,fen,hint_1,reward_stars,reward_points").order("created_at", { ascending: false }),
      supabase.from("puzzle_attempts").select("puzzle_id").eq("student_id", user.id).eq("is_solved", true),
      supabase.from("student_point_ledger").select("id,points,reason,created_at").eq("student_id", user.id).order("created_at", { ascending: false }).limit(5),
    ]);
    if (progressResult.error || puzzleResult.error || attemptResult.error || pointHistoryResult.error) throw new Error("Không tải đủ dữ liệu học tập. Hãy kiểm tra chính sách RLS và migration 0008.");
    const stats = progressResult.data;
    setProgress({ stars_total: stats?.stars_total ?? 0, points_total: stats?.points_total ?? 0, puzzles_solved: stats?.puzzles_solved ?? 0, current_streak: stats?.current_streak ?? 0, best_streak: stats?.best_streak ?? 0 });
    setCompletedIds((attemptResult.data ?? []).map((item) => item.puzzle_id));
    setPointHistory((pointHistoryResult.data ?? []) as PointHistory[]);
    setPuzzles((puzzleResult.data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      subtitle: row.subtitle ?? "Cùng khám phá nước đi hay!",
      difficulty: row.difficulty as Puzzle["difficulty"],
      theme: row.theme,
      zone: row.zone ?? "Đấu trường chiến thuật",
      fen: row.fen,
      solution: [],
      hint: row.hint_1 ?? "Hãy quan sát vị trí của Vua và các quân đang bị tấn công.",
      explanation: "Con đã hoàn thành thử thách rất tốt!",
      reward: row.reward_stars,
      rewardPoints: row.reward_points,
    })));
  }, [router]);

  useEffect(() => {
    let alive = true;
    async function init() {
      try { await refresh(); }
      catch (caught) { if (alive) setError(caught instanceof Error ? caught.message : "Không tải được tài khoản."); }
      finally { if (alive) setLoading(false); }
    }
    void init();
    const supabase = getSupabase();
    const { data: listener } = supabase?.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") router.replace("/login");
    }) ?? { data: { subscription: { unsubscribe: () => undefined } } };
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, [refresh, router]);

  async function validateMove(puzzleId: string, movesSoFar: string[], nextMove: string, stateToken: string | null) {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Chưa kết nối Supabase.");
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Phiên đăng nhập đã hết hạn.");
    const response = await fetch("/api/puzzles/validate-move", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ puzzleId, movesUci: movesSoFar, moveUci: nextMove, stateToken }),
    });
    const result = await response.json() as { error?: string; accepted?: boolean; opponentMoves?: string[]; completed?: boolean; stateToken?: string; message?: string };
    if (!response.ok) throw new Error(result.error || "Không xác nhận được nước đi.");
    return {
      accepted: result.accepted === true,
      opponentMoves: result.opponentMoves ?? [],
      completed: result.completed === true,
      stateToken: result.stateToken ?? null,
      message: result.message,
    };
  }

  async function getVisualHint(puzzleId: string, movesSoFar: string[], stateToken: string | null, step: number) {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Chưa kết nối Supabase.");
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Phiên đăng nhập đã hết hạn.");
    const response = await fetch("/api/puzzles/hint", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ puzzleId, movesUci: movesSoFar, stateToken, step }),
    });
    const result = await response.json() as { error?: string; from?: string; to?: string };
    if (!response.ok || !result.from) throw new Error(result.error || "Chưa lấy được gợi ý hình ảnh.");
    return { from: result.from, to: result.to };
  }

  async function saveSolved(puzzleId: string, stars: number, points: number, movesUci: string[], hintsUsed: number, elapsedSeconds: number, stateToken: string | null): Promise<PuzzleAward> {
    void stars;
    void points;
    const supabase = getSupabase();
    if (!supabase) throw new Error("Chưa kết nối Supabase.");
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Phiên đăng nhập đã hết hạn.");
    const response = await fetch("/api/puzzles/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ puzzleId, movesUci, hintsUsed, elapsedSeconds, stateToken }),
    });
    const result = await response.json() as { error?: string; awarded?: boolean; stars?: number; points?: number; points_total?: number; already_solved?: boolean };
    if (!response.ok) throw new Error(result.error || "Không lưu được kết quả.");
    await refresh();
    return { awarded: result.awarded === true, stars: Number(result.stars ?? 0), points: Number(result.points ?? 0), totalPoints: Number(result.points_total ?? 0), alreadySolved: result.already_solved === true };
  }

  async function signOut() { await getSupabase()?.auth.signOut(); router.replace("/login"); }

  const xpRank = getXpRank(progress.points_total);

  if (activePuzzle && student) return <main className="app-root"><ChessArena puzzle={activePuzzle} studentName={student.nickname || student.display_name} studentAvatar={student.avatar_url} onValidateMove={validateMove} onGetVisualHint={getVisualHint} onSolved={saveSolved} onExit={() => { setActivePuzzle(null); void refresh(); }}/></main>;

  return <main className="student-portal">
    <header className="student-topbar"><a href="/" className="management-brand"><span>♞</span><b>VƯƠNG QUỐC 64 Ô</b></a><button onClick={signOut}><LogOut size={16}/> Đăng xuất</button></header>
    <div className="student-content">
      {loading ? <div className="management-loading">Đang mở hành trình của em...</div> : error ? <div className="management-alert error-alert">{error}<button onClick={() => router.push("/login")}>Quay lại đăng nhập</button></div> : student && <>
        <section className="student-welcome"><div className="student-welcome-profile">{student.avatar_url ? <img src={student.avatar_url} alt={`Ảnh đại diện ${student.nickname || student.display_name}`} className="student-profile-photo"/> : <div className="student-profile-placeholder">{(student.nickname || student.display_name).slice(0, 1)}</div>}<div><span className="eyebrow">WELCOME BACK, CHESS EXPLORER</span><h1>Chào {student.nickname || student.display_name}! <span>✦</span></h1><p>Hôm nay mình cùng tìm thêm một nước đi thật hay nhé.</p><div className="student-level-pill">♞ Cấp {xpRank.level} · {xpRank.title}</div></div></div><div className="student-welcome-piece">♕</div></section>
        <div className="student-metrics"><div><span className="student-metric-icon xp"><Sparkles/></span><b>{progress.points_total}</b><small>Điểm XP</small></div><div><span className="student-metric-icon gold"><Star/></span><b>{progress.stars_total}</b><small>Sao vàng</small></div><div><span className="student-metric-icon blue"><Target/></span><b>{progress.puzzles_solved}</b><small>Câu đã giải</small></div><div><span className="student-metric-icon coral"><Sparkles/></span><b>{progress.current_streak}</b><small>Ngày liên tiếp</small></div><div><span className="student-metric-icon lilac"><Trophy/></span><b>{progress.best_streak}</b><small>Kỷ lục chuỗi ngày</small></div></div>
        <section className="student-xp-progress" aria-label="Tiến trình lên cấp"><div className="student-xp-progress-head"><div><span className="eyebrow">HÀNH TRÌNH LÊN CẤP</span><b>Cấp {xpRank.level} · {xpRank.title}</b></div><strong>{progress.points_total.toLocaleString("vi-VN")} XP</strong></div><div className="student-xp-track"><span style={{ width: `${xpRank.progressPercent}%` }}/></div><div className="student-xp-progress-foot"><span>{xpRank.nextXp === null ? "Con đã đạt cấp cao nhất!" : `Còn ${xpRank.remainingXp.toLocaleString("vi-VN")} XP để lên cấp tiếp theo`}</span><span>{xpRank.nextXp === null ? "MAX" : `${xpRank.progressPercent}%`}</span></div></section>
        <section className="student-point-history"><div className="student-point-history-head"><div><span className="eyebrow">NHẬT KÝ PHẦN THƯỞNG</span><h2>XP vừa nhận</h2></div><span className="student-point-history-total">✧ {progress.points_total.toLocaleString("vi-VN")} XP</span></div>{pointHistory.length ? <div className="student-point-history-list">{pointHistory.map((entry) => <div className="student-point-history-row" key={entry.id}><span className="student-point-history-star">✦</span><div><b>{entry.reason}</b><small>{new Date(entry.created_at).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })}</small></div><strong>+{entry.points} XP</strong></div>)}</div> : <p className="student-point-history-empty">Hoàn thành thử thách đầu tiên để nhận XP nhé!</p>}</section>
        <div className="student-section-heading"><div><span className="eyebrow">YOUR CHESS QUESTS</span><h2>Thử thách đang chờ em</h2><p>Mỗi câu đố hoàn thành giúp em nhận XP và sao vàng.</p></div><span className="student-task-count">{completedIds.length}/{puzzles.length} hoàn thành</span></div>
        {puzzles.length ? <div className="student-puzzle-grid">{puzzles.map((puzzle, index) => {
          const done = completedIds.includes(puzzle.id);
          return <article className={`student-puzzle-card student-puzzle-${index % 4}`} key={puzzle.id}><div className="student-puzzle-art"><span>{["♛", "♞", "♜", "♝"][index % 4]}</span>{done && <i><Check size={15}/></i>}</div><div className="student-puzzle-info"><span className="eyebrow">{puzzle.difficulty.toUpperCase()} · {puzzle.theme}</span><h3>{puzzle.title}</h3><p>{puzzle.subtitle}</p><div className="student-puzzle-bottom"><span>{done ? "Đã hoàn thành" : `+${puzzle.rewardPoints} XP · +${puzzle.reward} sao`}</span><button disabled={done} onClick={() => setActivePuzzle(puzzle)}>{done ? "Đã xong" : "Bắt đầu"}</button></div></div></article>;
        })}</div> : <div className="student-empty"><BookOpen size={28}/><b>Chưa có thử thách nào được mở</b><span>Nhờ thầy thêm câu đố vào ngân hàng nhé. Khi thầy mở bài, nhiệm vụ sẽ xuất hiện ở đây.</span></div>}
        <div className="student-privacy-note"><ShieldCheck size={16}/> Đây là không gian học tập riêng của em. Chỉ em và giáo viên được phân quyền mới xem được tiến trình này.</div>
      </>}
    </div>
  </main>;
}
