"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Chess } from "chess.js";
import { BookOpen, Check, Copy, GraduationCap, ImagePlus, KeyRound, LockKeyhole, LogOut, Plus, RefreshCw, ShieldCheck, Sparkles, Trophy, UserRound } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { getXpRank } from "@/lib/progression";

type StudentRow = {
  id: string;
  display_name: string;
  nickname: string | null;
  level: string;
  student_code: string | null;
  avatar_path: string | null;
  is_active: boolean;
  stars_total: number;
  points_total: number;
  puzzles_solved: number;
  avatar_url: string | null;
};
type Credentials = { studentCode: string; pin: string };
type PuzzleRow = { id: string; title: string; difficulty: string; theme: string; zone: string | null; is_published: boolean; reward_points: number };

export default function TeacherPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [teacherId, setTeacherId] = useState("");
  const [teacherName, setTeacherName] = useState("Giáo viên");
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [puzzleRows, setPuzzleRows] = useState<PuzzleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [photoConsent, setPhotoConsent] = useState(false);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [uploadTarget, setUploadTarget] = useState<string | null>(null);
  const [showPuzzleForm, setShowPuzzleForm] = useState(false);
  const [savingPuzzle, setSavingPuzzle] = useState(false);
  const [puzzleTitle, setPuzzleTitle] = useState("");
  const [puzzleSubtitle, setPuzzleSubtitle] = useState("");
  const [puzzleDifficulty, setPuzzleDifficulty] = useState("Dễ");
  const [puzzleTheme, setPuzzleTheme] = useState("Chiến thuật");
  const [puzzleZone, setPuzzleZone] = useState("Đấu trường chiến thuật");
  const [puzzleFen, setPuzzleFen] = useState("");
  const [puzzleSolution, setPuzzleSolution] = useState("");
  const [puzzleHint, setPuzzleHint] = useState("");
  const [puzzleExplanation, setPuzzleExplanation] = useState("");
  const [puzzleReward, setPuzzleReward] = useState("10");
  const [puzzleRewardPoints, setPuzzleRewardPoints] = useState("100");

  const loadStudents = useCallback(async (userId: string) => {
    const supabase = getSupabase();
    if (!supabase) return;
    const { data, error: queryError } = await supabase.from("profiles")
      .select("id,display_name,nickname,level,student_code,avatar_path,is_active")
      .eq("teacher_id", userId).eq("role", "student").order("created_at", { ascending: false });
    if (queryError) throw new Error("Không tải được hồ sơ LOUIS. Hãy kiểm tra migration và quyền RLS.");
    const ids = (data ?? []).map((item) => item.id as string);
    const progressResult = ids.length
      ? await supabase.from("student_progress").select("student_id,stars_total,points_total,puzzles_solved").in("student_id", ids)
      : { data: [], error: null };
    if (progressResult.error) throw new Error("Không tải được tiến trình của LOUIS.");
    type ProgressRecord = { student_id: string; stars_total: number; points_total: number; puzzles_solved: number };
    const progressRows = (progressResult.data ?? []) as ProgressRecord[];
    const progress = new Map<string, ProgressRecord>(progressRows.map((item) => [item.student_id, item]));
    const rows = await Promise.all((data ?? []).map(async (item) => {
      let avatarUrl: string | null = null;
      if (item.avatar_path) {
        const { data: signed } = await supabase.storage.from("student-photos").createSignedUrl(item.avatar_path as string, 3600);
        avatarUrl = signed?.signedUrl ?? null;
      }
      const stats = progress.get(item.id as string);
      return {
        id: item.id as string,
        display_name: item.display_name as string,
        nickname: (item.nickname as string | null) ?? null,
        level: (item.level as string) ?? "Tốt tập sự",
        student_code: (item.student_code as string | null) ?? null,
        avatar_path: (item.avatar_path as string | null) ?? null,
        is_active: Boolean(item.is_active),
        stars_total: Number(stats?.stars_total ?? 0),
        points_total: Number(stats?.points_total ?? 0),
        puzzles_solved: Number(stats?.puzzles_solved ?? 0),
        avatar_url: avatarUrl,
      } satisfies StudentRow;
    }));
    setStudents(rows);
  }, []);

  const loadPuzzles = useCallback(async (userId: string) => {
    const supabase = getSupabase();
    if (!supabase) return;
    const { data, error: queryError } = await supabase.from("puzzles")
      .select("id,title,difficulty,theme,zone,is_published,reward_points")
      .eq("created_by", userId).order("created_at", { ascending: false });
    if (queryError) throw new Error("Không tải được ngân hàng câu đố.");
    setPuzzleRows((data ?? []) as PuzzleRow[]);
  }, []);

  useEffect(() => {
    let alive = true;
    async function init() {
      const supabase = getSupabase();
      if (!supabase) { setError("Chưa cấu hình Supabase. Hãy hoàn thành file .env.local và migration trước."); setLoading(false); return; }
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) { router.replace("/login"); return; }
      const { data: profile, error: profileError } = await supabase.from("profiles")
        .select("role,display_name,is_active").eq("id", user.id).maybeSingle();
      if (profileError || !profile || profile.role !== "teacher" || !profile.is_active) {
        setError("Tài khoản hiện tại chưa có quyền giáo viên.");
        setLoading(false);
        return;
      }
      if (!alive) return;
      setTeacherId(user.id);
      setTeacherName(String(profile.display_name || user.email || "Giáo viên"));
      try { await Promise.all([loadStudents(user.id), loadPuzzles(user.id)]); }
      catch (caught) { setError(caught instanceof Error ? caught.message : "Không tải được dữ liệu."); }
      finally { if (alive) setLoading(false); }
    }
    void init();
    const supabase = getSupabase();
    const { data: listener } = supabase?.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") router.replace("/login");
    }) ?? { data: { subscription: { unsubscribe: () => undefined } } };
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, [loadPuzzles, loadStudents, router]);

  async function createStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = getSupabase();
    if (!supabase || !teacherId) return;
    setSaving(true); setError(""); setNotice(""); setCredentials(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Phiên đăng nhập hết hạn. Hãy đăng nhập lại.");
      const response = await fetch("/api/teacher/students", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ displayName: "LOUIS", nickname: "LOUIS", photoConsentConfirmed: photoConsent }),
      });
      const result = await response.json() as { error?: string; credentials?: Credentials; student?: { displayName: string } };
      if (!response.ok || !result.credentials) throw new Error(result.error || "Không tạo được tài khoản LOUIS.");
      setCredentials(result.credentials);
      setNotice(`Đã tạo hồ sơ cho LOUIS.`);
      setPhotoConsent(false);
      await loadStudents(teacherId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Có lỗi xảy ra.");
    } finally { setSaving(false); }
  }

  async function importSamples() {
    const supabase = getSupabase();
    if (!supabase) return;
    setImporting(true); setError(""); setNotice("");
    try {
      const { data } = await supabase.auth.getSession();
      const response = await fetch("/api/teacher/puzzles/seed", { method: "POST", headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` } });
      const result = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(result.error || "Không nhập được câu đố.");
      setNotice(result.message || "Đã nhập ngân hàng câu đố.");
      await loadPuzzles(teacherId);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Có lỗi xảy ra."); }
    finally { setImporting(false); }
  }

  async function createPuzzle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = getSupabase();
    if (!supabase || !teacherId) return;
    setSavingPuzzle(true); setError(""); setNotice("");
    try {
      const fen = puzzleFen.trim();
      const line = puzzleSolution.trim().split(/\s+/).filter(Boolean);
      if (!line.length) throw new Error("Hãy nhập ít nhất một nước đi UCI.");
      const game = new Chess(fen);
      for (const move of line) {
        if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)) throw new Error(`Nước đi ${move} không đúng định dạng UCI.`);
        game.move({ from: move.slice(0, 2), to: move.slice(2, 4), ...(move[4] ? { promotion: move[4] } : {}) });
      }
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Phiên đăng nhập đã hết hạn.");
      const response = await fetch("/api/teacher/puzzles", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: puzzleTitle, subtitle: puzzleSubtitle, difficulty: puzzleDifficulty,
          theme: puzzleTheme, zone: puzzleZone, fen, solutionUci: line.join(" "),
          hint1: puzzleHint, explanation: puzzleExplanation, rewardStars: Number(puzzleReward), rewardPoints: Number(puzzleRewardPoints),
          publishToStudents: false, assignedStudentIds: students.map((student) => student.id),
        }),
      });
      const result = await response.json() as { error?: string; title?: string; assignedCount?: number };
      if (!response.ok) throw new Error(result.error || "Không tạo được câu đố.");
      setNotice(`Đã tạo câu đố “${result.title ?? puzzleTitle}” dành riêng cho LOUIS.`);
      setPuzzleTitle(""); setPuzzleSubtitle(""); setPuzzleFen(""); setPuzzleSolution(""); setPuzzleHint(""); setPuzzleExplanation(""); setPuzzleReward("10"); setPuzzleRewardPoints("100"); setShowPuzzleForm(false);
      await loadPuzzles(teacherId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "FEN hoặc chuỗi lời giải chưa hợp lệ.");
    } finally { setSavingPuzzle(false); }
  }


  async function manageStudent(student: StudentRow, action: "reset_pin" | "toggle_active") {
    const nextActive = !student.is_active;
    const prompt = action === "reset_pin"
      ? `Tạo PIN mới cho ${student.nickname ?? student.display_name}? PIN cũ sẽ không còn dùng được.`
      : `${nextActive ? "Mở khóa" : "Tạm khóa"} tài khoản của ${student.nickname ?? student.display_name}?`;
    if (!window.confirm(prompt)) return;
    const supabase = getSupabase();
    if (!supabase) return;
    setError(""); setNotice("");
    try {
      const { data } = await supabase.auth.getSession();
      const response = await fetch(`/api/teacher/students/${student.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
        body: JSON.stringify(action === "reset_pin" ? { action } : { action: "set_active", isActive: nextActive }),
      });
      const result = await response.json() as { error?: string; studentCode?: string; pin?: string; isActive?: boolean };
      if (!response.ok) throw new Error(result.error || "Không thực hiện được thao tác.");
      if (action === "reset_pin" && result.studentCode && result.pin) {
        setCredentials({ studentCode: result.studentCode, pin: result.pin });
        setNotice(`Đã cấp PIN mới cho ${student.nickname ?? student.display_name}.`);
      } else {
        setStudents((current) => current.map((row) => row.id === student.id ? { ...row, is_active: Boolean(result.isActive) } : row));
        setNotice(`${nextActive ? "Đã mở khóa" : "Đã tạm khóa"} tài khoản ${student.nickname ?? student.display_name}.`);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thực hiện được thao tác.");
    }
  }


  function requestAvatar(studentId: string) {
    setUploadTarget(studentId);
    fileRef.current?.click();
  }

  async function uploadAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const studentId = uploadTarget;
    event.target.value = "";
    if (!file || !studentId) return;
    const supabase = getSupabase();
    if (!supabase) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 5 * 1024 * 1024) {
      setError("Ảnh cần có định dạng JPG, PNG hoặc WebP và dung lượng tối đa 5 MB."); return;
    }
    const student = students.find((row) => row.id === studentId);
    if (!student) return;
    setError(""); setNotice("");
    try {
      const { data: profile } = await supabase.from("profiles").select("photo_consent_confirmed_at").eq("id", studentId).maybeSingle();
      if (!profile?.photo_consent_confirmed_at) throw new Error("Chưa xác nhận sự đồng ý phù hợp của phụ huynh cho việc sử dụng ảnh học viên.");
      const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const path = `${studentId}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from("student-photos").upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw new Error("Không tải được ảnh lên kho riêng tư. Hãy kiểm tra Storage policy.");
      const { error: updateError } = await supabase.from("profiles").update({ avatar_path: path }).eq("id", studentId);
      if (updateError) {
        await supabase.storage.from("student-photos").remove([path]);
        throw new Error("Ảnh đã tải lên nhưng không cập nhật được hồ sơ.");
      }
      const { data: signed } = await supabase.storage.from("student-photos").createSignedUrl(path, 3600);
      setStudents((current) => current.map((row) => row.id === studentId ? { ...row, avatar_path: path, avatar_url: signed?.signedUrl ?? null } : row));
      setNotice(`Đã cập nhật ảnh cho LOUIS.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Không tải được ảnh."); }
  }

  async function signOut() {
    await getSupabase()?.auth.signOut();
    router.replace("/login");
  }


  return (
    <main className="management-page">
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={uploadAvatar}/>
      <header className="management-topbar"><a href="/" className="management-brand"><span>♞</span><b>VƯƠNG QUỐC 64 Ô</b></a><div className="management-user"><span><GraduationCap size={16}/>{teacherName}</span><button onClick={signOut}><LogOut size={16}/> Đăng xuất</button></div></header>
      <div className="management-content">
        <div className="management-heading"><div><span className="eyebrow">TEACHER STUDIO · PRIVATE CONTROL</span><h1>Hành trình cờ vua của LOUIS</h1><p>Quản lý một hồ sơ duy nhất, thiết kế câu đố riêng và theo dõi tiến bộ của LOUIS.</p></div><div className="management-heading-icon"><GraduationCap size={28}/></div></div>
        {error && <div className="management-alert error-alert">{error}</div>}
        {notice && <div className="management-alert success-alert"><Check size={17}/>{notice}</div>}
        {loading ? <div className="management-loading"><RefreshCw size={20}/> Đang tải dữ liệu...</div> : <>
          <div className="management-metrics"><div><UserRound/><span><b>{students.length ? "01" : "00"}</b><small>Hồ sơ LOUIS</small></span></div><div><BookOpen/><span><b>{puzzleRows.length}</b><small>Câu đố trong ngân hàng</small></span></div><div><Sparkles/><span><b>{students.reduce((sum, student) => sum + student.stars_total, 0)}</b><small>Sao tích lũy</small></span></div><div><Trophy/><span><b>{students.reduce((sum, student) => sum + student.points_total, 0)}</b><small>Điểm XP tích lũy</small></span></div></div>
          <div className="management-grid">
            {(!students.length || credentials) && <section className="management-panel create-account-panel"><div className="management-panel-title"><div><span className="eyebrow">LOUIS · STUDENT ACCOUNT</span><h2>Tạo tài khoản cho LOUIS</h2><p>Hệ thống chỉ có một học viên duy nhất: LOUIS. Thầy sẽ nhận mã đăng nhập và PIN riêng.</p></div><span className="panel-icon"><KeyRound size={19}/></span></div>
              {!students.length && <form className="management-form" onSubmit={createStudent}><div className="louis-fixed-name"><span>Học viên</span><strong>LOUIS</strong></div><label className="consent-check"><input type="checkbox" checked={photoConsent} onChange={(event) => setPhotoConsent(event.target.checked)}/><span>Đã xác nhận có sự đồng ý phù hợp của phụ huynh/người giám hộ trước khi sử dụng ảnh LOUIS.</span></label><button className="auth-submit" disabled={saving}>{saving ? "Đang tạo tài khoản..." : "Tạo tài khoản LOUIS"}<Plus size={17}/></button></form>}
              {students.length > 0 && !credentials && <p className="single-assignment-note"><UserRound size={16}/> Tài khoản duy nhất của LOUIS đã được tạo. Từ đây thầy có thể quản lý ảnh, PIN và tiến trình.</p>}
              {credentials && <div className="credential-reveal"><div><ShieldCheck size={19}/><b>Thông tin đăng nhập mới</b></div><p>Gửi riêng thông tin này cho phụ huynh hoặc học viên. PIN chỉ được hiển thị một lần.</p><div className="credential-row"><span>Mã học viên</span><strong>{credentials.studentCode}</strong><button type="button" aria-label="Sao chép mã học viên" onClick={() => void navigator.clipboard.writeText(credentials.studentCode)}><Copy size={15}/></button></div><div className="credential-row"><span>PIN 8 số</span><strong>{credentials.pin}</strong><button type="button" aria-label="Sao chép PIN" onClick={() => void navigator.clipboard.writeText(credentials.pin)}><Copy size={15}/></button></div></div>}
            </section>}
            <section className="management-panel puzzle-import-panel"><div className="management-panel-title"><div><span className="eyebrow">PUZZLE LIBRARY</span><h2>Ngân hàng câu đố</h2><p>Tạo câu đố và giao trực tiếp cho LOUIS.</p></div><span className="panel-icon yellow"><BookOpen size={19}/></span></div><div className="import-summary"><b>{puzzleRows.length} câu đố trong ngân hàng</b><span>Vị trí FEN, lời giải UCI, gợi ý và giải thích.</span></div><div className="puzzle-library-actions"><button className="secondary-action" onClick={() => setShowPuzzleForm((value) => !value)}><Plus size={16}/>{showPuzzleForm ? "Đóng trình tạo" : "Tạo câu đố mới"}</button><button className="secondary-action" onClick={importSamples} disabled={importing}>{importing ? "Đang nhập..." : "Nhập 7 câu đố mẫu"}<Sparkles size={16}/></button></div><div className="security-note"><ShieldCheck size={16}/> FEN và toàn bộ chuỗi UCI được kiểm tra bằng chess.js ở trình duyệt và máy chủ.</div></section>
          </div>
          {showPuzzleForm && <section className="management-panel puzzle-builder"><div className="management-panel-title"><div><span className="eyebrow">CHESS PUZZLE BUILDER</span><h2>Tạo thử thách mới</h2><p>Nhập toàn bộ biến thể chính theo UCI, gồm nước của học viên và nước đáp trả bắt buộc của đối phương. Ví dụ: <code>e2e4 e7e5 g1f3</code>. Nước đáp trả sẽ tự chạy trên bàn cờ.</p></div><span className="panel-icon yellow"><Sparkles size={19}/></span></div>
            <form className="puzzle-builder-form" onSubmit={createPuzzle}>
              <div className="puzzle-builder-grid"><label>Tên thử thách<input value={puzzleTitle} onChange={(event) => setPuzzleTitle(event.target.value)} placeholder="Ví dụ: Giải cứu quân Hậu" required maxLength={100}/></label><label>Mô tả ngắn<input value={puzzleSubtitle} onChange={(event) => setPuzzleSubtitle(event.target.value)} placeholder="Gợi mở nhiệm vụ cho học viên" required maxLength={180}/></label><label>Độ khó<select value={puzzleDifficulty} onChange={(event) => { const value = event.target.value; setPuzzleDifficulty(value); setPuzzleRewardPoints(value === "Khó" ? "200" : value === "Vừa" ? "150" : "100"); }}><option>Dễ</option><option>Vừa</option><option>Khó</option></select></label><label>Chủ đề<input value={puzzleTheme} onChange={(event) => setPuzzleTheme(event.target.value)} maxLength={50}/></label><label>Khu vực<input value={puzzleZone} onChange={(event) => setPuzzleZone(event.target.value)} maxLength={70}/></label><label>Số sao thưởng<input type="number" min="0" max="100" value={puzzleReward} onChange={(event) => setPuzzleReward(event.target.value)} required/></label><label>Điểm XP thưởng<input type="number" min="0" max="5000" value={puzzleRewardPoints} onChange={(event) => setPuzzleRewardPoints(event.target.value)} required/><small>Gợi ý: Dễ 100 · Vừa 150 · Khó 200 điểm</small></label></div>
              <label>Vị trí bàn cờ — FEN<textarea value={puzzleFen} onChange={(event) => setPuzzleFen(event.target.value)} placeholder="Ví dụ: 4k3/8/8/8/8/8/4q3/4K3 w - - 0 1" required rows={2}/></label>
              <label>Chuỗi lời giải — UCI<textarea value={puzzleSolution} onChange={(event) => setPuzzleSolution(event.target.value)} placeholder="Ví dụ: e1e2 hoặc e2e4 e7e5 g1f3" required rows={2}/></label>
              <div className="puzzle-builder-grid"><label>Gợi ý<input value={puzzleHint} onChange={(event) => setPuzzleHint(event.target.value)} placeholder="Gợi ý cho trẻ khi bí" maxLength={500}/></label><label>Giải thích đáp án<input value={puzzleExplanation} onChange={(event) => setPuzzleExplanation(event.target.value)} placeholder="Giải thích vì sao nước đi đúng" maxLength={1000}/></label></div>
              <div className="single-assignment-note"><UserRound size={16}/><span>Câu đố này sẽ được giao riêng cho <strong>LOUIS</strong>, không có học viên nào khác.</span></div>
              <button className="auth-submit" disabled={savingPuzzle || students.length === 0}>{savingPuzzle ? "Đang kiểm tra và lưu..." : students.length === 0 ? "Tạo tài khoản LOUIS trước" : "Kiểm tra & giao câu đố cho LOUIS"}<Check size={17}/></button>
            </form>
          </section>}
          <section className="management-panel student-roster puzzle-roster"><div className="roster-heading"><div><span className="eyebrow">PUBLISHED & PRIVATE PUZZLES</span><h2>Câu đố của tôi</h2><p>Giáo viên quản lý những câu đố do mình tạo.</p></div><span className="student-task-count">{puzzleRows.length} câu đố</span></div>
            {puzzleRows.length ? <div className="puzzle-admin-list">{puzzleRows.map((puzzle) => <article key={puzzle.id}><span className="puzzle-admin-mark">♞</span><div><b>{puzzle.title}</b><small>{puzzle.zone ?? "Đấu trường"} · {puzzle.difficulty} · {puzzle.theme} · {Number(puzzle.reward_points ?? 0)} XP</small></div><span className={`status-pill ${puzzle.is_published ? "is-active" : "is-disabled"}`}>{puzzle.is_published ? "Đã công bố" : "Giao riêng"}</span></article>)}</div> : <div className="roster-empty"><BookOpen size={24}/><b>Ngân hàng đang trống</b><span>Nhập bộ câu đố mẫu hoặc tạo thử thách đầu tiên.</span></div>}
          </section>
          <section className="management-panel student-roster"><div className="roster-heading"><div><span className="eyebrow">ONLY STUDENT · LOUIS</span><h2>Hồ sơ LOUIS</h2><p>Đây là hồ sơ học viên duy nhất được quản lý trong website.</p></div></div>
            {students.length ? <div className="roster-list">{students.map((student) => <article className="roster-row" key={student.id}><div className="roster-avatar">{student.avatar_url ? <img src={student.avatar_url} alt={`Ảnh ${student.nickname ?? student.display_name}`}/> : <span>{(student.nickname ?? student.display_name).slice(0, 1)}</span>}</div><div className="roster-name"><b>{student.display_name}</b><small>{student.nickname ?? "Chưa có tên gọi"} · Cấp {getXpRank(student.points_total).level} · {getXpRank(student.points_total).title}</small></div><div className="roster-code"><small>MÃ HỌC VIÊN</small><b>{student.student_code ?? "Chưa có mã"}</b></div><div className="roster-stats"><b>★ {student.stars_total} · ✧ {student.points_total} XP</b><small>{student.puzzles_solved} câu đã giải</small></div><span className={`status-pill ${student.is_active ? "is-active" : "is-disabled"}`}>{student.is_active ? "Đang hoạt động" : "Đã khóa"}</span><div className="roster-actions"><button className="roster-photo-button" onClick={() => requestAvatar(student.id)}><ImagePlus size={15}/> Ảnh</button><button className="roster-mini-action" title="Cấp PIN mới" onClick={() => void manageStudent(student, "reset_pin")}><KeyRound size={14}/></button><button className="roster-mini-action" title={student.is_active ? "Tạm khóa tài khoản" : "Mở khóa tài khoản"} onClick={() => void manageStudent(student, "toggle_active")}>{student.is_active ? <LockKeyhole size={14}/> : <Check size={14}/>}</button></div></article>)}</div> : <div className="roster-empty"><UserRound size={25}/><b>Chưa có tài khoản LOUIS</b><span>Tạo tài khoản duy nhất ở khu vực phía trên.</span></div>}
          </section>
          <div className="management-footnote"><ShieldCheck size={16}/> Hình ảnh trẻ em được lưu trong bucket riêng tư. Không chia sẻ công khai mã đăng nhập, PIN hoặc ảnh học viên.</div>
        </>}
      </div>
    </main>
  );
}
