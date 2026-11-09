"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  ArrowRight, BookOpen, CalendarDays, Check, ChevronRight,
  CircleHelp, GraduationCap, Home, LockKeyhole, Map,
  Menu, Settings2, ShieldCheck, Sparkles, Star, Target,
  Trophy, UserRound, X, Zap,
} from "lucide-react";
import ChessArena from "@/components/chess-arena";
import publicPuzzleData from "@/lib/puzzles-public.json";
import type { AppSection, Student } from "@/lib/types";
import { getXpRank } from "@/lib/progression";
import { isSupabaseConfigured } from "@/lib/supabase";

const starterStudents: Student[] = [
  { id: "louis", name: "LOUIS", nickname: "LOUIS", level: "Tốt tập sự", stars: 0, points: 0, solved: 0, accuracy: 0, streak: 0, className: "Học viên cá nhân", avatar: null, color: "blue" },
];

const navItems: { id: AppSection; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Thế giới của em", icon: Home },
  { id: "map", label: "Bản đồ phiêu lưu", icon: Map },
  { id: "puzzles", label: "Đấu trường câu đố", icon: Target },
  { id: "class", label: "Hồ sơ LOUIS", icon: BookOpen },
];

const zones = [
  { title: "Vương quốc Tốt", detail: "Bước đi đầu tiên", icon: "♟", progress: 0, unlocked: true, tint: "sun" },
  { title: "Khu rừng Mã", detail: "Những cú nhảy bất ngờ", icon: "♞", progress: 0, unlocked: false, tint: "mint" },
  { title: "Tòa tháp Xe", detail: "Đường đi thẳng tắp", icon: "♜", progress: 0, unlocked: true, tint: "peach" },
  { title: "Thành phố Tượng", detail: "Bí mật đường chéo", icon: "♝", progress: 0, unlocked: false, tint: "lavender" },
  { title: "Cung điện Hậu", detail: "Sức mạnh đa hướng", icon: "♛", progress: 0, unlocked: false, tint: "blue" },
  { title: "Lâu đài Vua", detail: "Bảo vệ vị vua", icon: "♚", progress: 0, unlocked: false, tint: "sun" },
  { title: "Ngọn núi Chiến thuật", detail: "Nghĩ trước một bước", icon: "♜", progress: 0, unlocked: false, tint: "mint" },
  { title: "Vương quốc Chiếu hết", detail: "Thử thách nhà vô địch", icon: "♕", progress: 0, unlocked: false, tint: "peach" },
];

const puzzles = publicPuzzleData as import("@/lib/types").Puzzle[];
const puzzleIcons = ["♛", "♝", "♜", "♞", "♟", "♕", "♚"];

function Avatar({ student, size = "md" }: { student: Student; size?: "sm" | "md" | "lg" }) {
  return <div className={`avatar avatar-${size} avatar-${student.color}`}>
    {student.avatar ? <img src={student.avatar} alt={`Ảnh đại diện ${student.nickname}`} /> : <span>{student.nickname.slice(0, 1).toUpperCase()}</span>}
  </div>;
}

export default function HomePage() {
  const [section, setSection] = useState<AppSection>("home");
  const [students, setStudents] = useState<Student[]>(starterStudents);
  const [hydrated, setHydrated] = useState(false);
  const [dateInfo, setDateInfo] = useState({ weekday: "HÀNH TRÌNH CỦA EM", day: "--", month: "THG --" });
  const activeStudentId = "louis";
  const [activePuzzleId, setActivePuzzleId] = useState<string | null>(null);
  const [solvedMap, setSolvedMap] = useState<Record<string, string[]>>({});
  const [mobileMenu, setMobileMenu] = useState(false);
  const [toast, setToast] = useState("");
  const [teacherTab, setTeacherTab] = useState<"students" | "puzzles" | "progress">("students");
  const avatarInput = useRef<HTMLInputElement>(null);


  const activeStudent = students[0] ?? starterStudents[0];
  const activeRank = getXpRank(activeStudent.points);
  const activePuzzle = puzzles.find((puzzle) => puzzle.id === activePuzzleId) ?? null;
  const solvedIds = solvedMap[activeStudentId] ?? [];
  const completedCount = solvedIds.length;

  useEffect(() => {
    try {
      const savedStudent = localStorage.getItem("chess-adventure-louis-profile-v1");
      const savedSolved = localStorage.getItem("chess-adventure-louis-progress-v1");
      if (savedStudent) {
        const parsed = JSON.parse(savedStudent) as Partial<Student>;
        setStudents([{ ...starterStudents[0], ...parsed, id: "louis", name: "LOUIS", nickname: "LOUIS", className: "Học viên cá nhân" }]);
      } else {
        // Migrate only the former demo's first profile if it was renamed to LOUIS by the teacher.
        const oldProfiles = localStorage.getItem("chess-adventure-students-v1");
        if (oldProfiles) {
          const oldList = JSON.parse(oldProfiles) as Student[];
          const louis = oldList.find((item) => item.id === "louis" || item.name?.toLowerCase() === "louis" || item.nickname?.toLowerCase() === "louis");
          if (louis) setStudents([{ ...starterStudents[0], ...louis, id: "louis", name: "LOUIS", nickname: "LOUIS", className: "Học viên cá nhân" }]);
        }
      }
      if (savedSolved) setSolvedMap({ louis: JSON.parse(savedSolved) as string[] });
    } catch { /* Ignore corrupted demo storage and keep safe defaults. */ }
    finally { setHydrated(true); }
    const now = new Date();
    setDateInfo({
      weekday: new Intl.DateTimeFormat("vi-VN", { weekday: "long" }).format(now).toLocaleUpperCase("vi-VN"),
      day: String(now.getDate()).padStart(2, "0"),
      month: `THG ${now.getMonth() + 1}`,
    });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem("chess-adventure-louis-profile-v1", JSON.stringify(activeStudent));
      localStorage.setItem("chess-adventure-louis-progress-v1", JSON.stringify(solvedMap.louis ?? []));
    } catch { setToast("Bộ nhớ trình duyệt đã đầy. Hãy thử ảnh đại diện nhỏ hơn."); }
  }, [activeStudent, solvedMap, hydrated]);

  useEffect(() => {
    if (isSupabaseConfigured) window.location.replace("/login");
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(""), 3000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const validateDemoMove = async (puzzleId: string, movesSoFar: string[], nextMove: string) => {
    const response = await fetch("/api/demo/validate-move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ puzzleId, movesUci: movesSoFar, moveUci: nextMove }),
    });
    const result = await response.json() as { error?: string; accepted?: boolean; opponentMoves?: string[]; completed?: boolean; message?: string };
    if (!response.ok) throw new Error(result.error || "Chưa kiểm tra được nước đi.");
    return {
      accepted: result.accepted === true,
      opponentMoves: result.opponentMoves ?? [],
      completed: result.completed === true,
      stateToken: null,
      message: result.message,
    };
  };

  const getDemoVisualHint = async (puzzleId: string, movesSoFar: string[], _stateToken: string | null, step: number) => {
    const response = await fetch("/api/demo/hint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ puzzleId, movesUci: movesSoFar, step }),
    });
    const result = await response.json() as { error?: string; from?: string; to?: string };
    if (!response.ok || !result.from) throw new Error(result.error || "Chưa lấy được gợi ý hình ảnh.");
    return { from: result.from, to: result.to };
  };

  const notifySolved = (puzzleId: string, stars: number, points: number) => {
    if (solvedIds.includes(puzzleId)) {
      return { awarded: false, stars: 0, points: 0, totalPoints: activeStudent.points, alreadySolved: true };
    }
    const totalPoints = activeStudent.points + points;
    setSolvedMap((current) => ({ ...current, [activeStudentId]: [...(current[activeStudentId] ?? []), puzzleId] }));
    setStudents((current) => current.map((student) => student.id === activeStudentId
      ? { ...student, stars: student.stars + stars, points: student.points + points, solved: student.solved + 1, accuracy: Math.min(99, student.accuracy + 1) }
      : student));
    return { awarded: true, stars, points, totalPoints };
  };


  const handleAvatar = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setToast("Vui lòng chọn tệp hình ảnh."); return; }
    if (file.size > 1_500_000) { setToast("Ảnh demo cần nhỏ hơn 1,5 MB. Hãy nén ảnh trước khi tải."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const image = String(reader.result ?? "");
      setStudents((current) => current.map((student) => student.id === "louis" ? { ...student, avatar: image } : student));
      setToast("Đã cập nhật ảnh trong bản demo trên trình duyệt này.");
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const openPuzzle = (puzzleId: string) => { setActivePuzzleId(puzzleId); setSection("puzzles"); };

  if (isSupabaseConfigured) {
    return <main className="management-loading" style={{ minHeight: "100vh" }}>Đang mở cổng đăng nhập LOUIS...</main>;
  }

  if (activePuzzle) {
    return <main className="app-root"><ChessArena puzzle={activePuzzle} studentName={activeStudent.nickname} studentAvatar={activeStudent.avatar} onValidateMove={validateDemoMove} onGetVisualHint={getDemoVisualHint} onSolved={notifySolved} onExit={() => setActivePuzzleId(null)} /></main>;
  }

  return (
    <main className="app-root">
      <input ref={avatarInput} type="file" accept="image/*" hidden onChange={handleAvatar} />
      <div className="app-shell">
        <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
          <div className="brand-lockup">
            <div className="brand-mark"><span>♞</span><i>✦</i></div>
            <div><b>VƯƠNG QUỐC</b><strong>64 Ô</strong><small>CHESS ADVENTURE</small></div>
            <button className="mobile-close icon-button" onClick={() => setMobileMenu(false)} aria-label="Đóng menu"><X size={18}/></button>
          </div>
          <div className="sidebar-label">HÀNH TRÌNH CỦA EM</div>
          <nav className="main-nav">
            {navItems.map((item) => {
              const Icon = item.icon;
              return <button key={item.id} className={`nav-item ${section === item.id ? "active" : ""}`} onClick={() => { setSection(item.id); setMobileMenu(false); }}><Icon size={18}/><span>{item.label}</span>{item.id === "puzzles" && <i className="nav-count">{puzzles.length}</i>}</button>;
            })}
          </nav>
          <div className="sidebar-journey">
            <div className="journey-doodle">♜ <span>♟</span> ♞</div>
            <b>Mỗi ngày một nước hay!</b>
            <p>Luyện một chút, giỏi hơn một chút.</p>
            <div className="mini-progress"><span style={{ width: `${Math.min(100, 15 + completedCount * 12)}%` }}/></div>
            <small>{completedCount} / {puzzles.length} thử thách đã chinh phục</small>
          </div>
          <button className="teacher-entry" onClick={() => { setSection("teacher"); setMobileMenu(false); }}><Settings2 size={17}/><span>Teacher Studio</span><ChevronRight size={16}/></button>
          <div className="sidebar-bottom"><span className="online-dot"/> Không gian học tập riêng tư</div>
        </aside>

        <div className="main-column">
          <header className="topbar">
            <button className="mobile-menu-button icon-button" onClick={() => setMobileMenu(true)} aria-label="Mở menu"><Menu size={20}/></button>
            <div className="breadcrumb"><span>Chess Adventure</span><ChevronRight size={14}/><b>{navItems.find((item) => item.id === section)?.label ?? "Teacher Studio"}</b></div>
            <div className="topbar-actions">
              <div className="privacy-chip"><ShieldCheck size={15}/> Góc học tập an toàn</div>
              <div className="student-switcher">
                <div className="active-student-button" aria-label="Học viên duy nhất LOUIS">
                  <Avatar student={activeStudent} size="sm"/><span><b>LOUIS</b><small>Cấp {activeRank.level} · {activeRank.title}</small></span>
                </div>
              </div>
            </div>
          </header>

          {section === "home" && <section className="page-content">
            <div className="welcome-banner">
              <div className="welcome-copy"><span className="eyebrow">{dateInfo.weekday} · HÀNH TRÌNH CỦA EM</span><h1>Chào {activeStudent.nickname}! <span className="wave">✦</span></h1><p>Hôm nay mình cùng khám phá thêm một bí mật trên bàn cờ nhé.</p><button className="primary-button" onClick={() => openPuzzle(puzzles.find((puzzle) => !solvedIds.includes(puzzle.id))?.id ?? puzzles[0].id)}>Tiếp tục phiêu lưu <ArrowRight size={17}/></button></div>
              <div className="welcome-illustration"><div className="sun-disc"/><div className="floating-star star-a">✦</div><div className="floating-star star-b">✧</div><div className="hero-piece king-piece">♚</div><div className="hero-piece knight-piece">♞</div><div className="hero-piece pawn-piece">♟</div><div className="checkered-hill"/></div>
              <div className="banner-sticker">HÔM NAY<br/><b>CHƠI CỜ!</b></div>
            </div>

            <div className="section-heading stats-heading"><div><span className="eyebrow">NHỮNG ĐIỀU EM ĐÃ LÀM ĐƯỢC</span><h2>Hành trình của {activeStudent.nickname}</h2></div><button className="text-link" onClick={() => setSection("class")}>Xem thành tích <ArrowRight size={15}/></button></div>
            <div className="stats-grid">
              <div className="stat-card stat-stars"><div className="stat-icon">★</div><div><strong>{activeStudent.stars}</strong><span>Sao vàng</span></div><i>✦</i></div>
              <div className="stat-card stat-xp"><div className="stat-icon">✧</div><div><strong>{activeStudent.points}</strong><span>Điểm XP</span></div><i>✧</i></div>
              <div className="stat-card stat-puzzles"><div className="stat-icon">♟</div><div><strong>{activeStudent.solved}</strong><span>Câu đố đã giải</span></div><i>↗</i></div>
              <div className="stat-card stat-streak"><div className="stat-icon">☀</div><div><strong>{activeStudent.streak}</strong><span>Ngày luyện tập</span></div><i>✧</i></div>
              <div className="stat-card stat-level"><div className="stat-icon">♜</div><div><strong>{activeRank.title}</strong><span>Cấp {activeRank.level}</span></div><i>✦</i></div>
            </div>

            <div className="home-lower-grid">
              <div className="panel mission-panel">
                <div className="panel-header"><div><span className="eyebrow">NHIỆM VỤ HÔM NAY</span><h3>Thử thách đang chờ em</h3></div><div className="calendar-stamp"><CalendarDays size={16}/><span>{dateInfo.day}<br/><small>{dateInfo.month}</small></span></div></div>
                <div className="featured-puzzle"><div className="puzzle-art"><span>♕</span><i>✦</i><b>?</b></div><div className="featured-copy"><span className="difficulty easy">DỄ</span><h4>{puzzles.find((puzzle) => !solvedIds.includes(puzzle.id))?.title ?? "Con đã hoàn thành tất cả!"}</h4><p>{puzzles.find((puzzle) => !solvedIds.includes(puzzle.id))?.subtitle ?? "Thầy sẽ sớm giao thêm thử thách mới."}</p><button className="small-primary" onClick={() => openPuzzle(puzzles.find((puzzle) => !solvedIds.includes(puzzle.id))?.id ?? puzzles[0].id)}>Vào thử thách <ArrowRight size={14}/></button></div></div>
                <div className="mission-footer"><span><Zap size={15}/> Hoàn thành để nhận điểm XP và sao</span><span>Khoảng 3 phút</span></div>
              </div>
              <div className="panel badges-panel"><div className="panel-header"><div><span className="eyebrow">BỘ SƯU TẬP CỦA EM</span><h3>Huy hiệu đáng yêu</h3></div><button className="round-arrow" onClick={() => setSection("class")} aria-label="Xem huy hiệu"><ArrowRight size={16}/></button></div><div className="badge-grid"><div className="badge-item"><div className="badge-medal medal-gold">♟</div><b>Nước đi đầu tiên</b><small>First Move</small></div><div className="badge-item"><div className="badge-medal medal-blue">♞</div><b>Kỵ sĩ nhí</b><small>Knight Explorer</small></div><div className="badge-item"><div className="badge-medal medal-coral">♜</div><b>Tháp vững vàng</b><small>Rook Keeper</small></div><div className="badge-item"><div className="badge-medal medal-purple">♛</div><b>Bậc thầy</b><small>Tactic Master</small></div></div><p className="badge-footnote"><Sparkles size={14}/> Còn nhiều huy hiệu đang chờ em mở khóa!</p></div>
            </div>

            <div className="section-heading map-heading"><div><span className="eyebrow">THẾ GIỚI 64 Ô</span><h2>Những vùng đất đang chờ</h2></div><button className="text-link" onClick={() => setSection("map")}>Khám phá bản đồ <ArrowRight size={15}/></button></div>
            <div className="zone-preview-grid">{zones.slice(0, 4).map((zone, index) => <button className={`zone-preview zone-${zone.tint}`} key={zone.title} onClick={() => setSection("map")}><span className="zone-number">0{index + 1}</span><span className="zone-chess-icon">{zone.icon}</span><b>{zone.title}</b><small>{zone.detail}</small>{zone.unlocked ? <span className="zone-state">{zone.progress ? `${zone.progress}% hoàn thành` : "Đã mở khóa"}</span> : <span className="zone-state locked-state"><LockKeyhole size={12}/> Sắp mở</span>}</button>)}</div>
          </section>}

          {section === "map" && <section className="page-content subpage"><div className="page-intro"><span className="eyebrow">BẢN ĐỒ PHIÊU LƯU</span><h1>Thế giới 64 ô đang chờ em!</h1><p>Mỗi vùng đất sẽ giúp em khám phá thêm một bí mật của cờ vua.</p></div><div className="adventure-map"><div className="map-path"/><div className="map-cloud cloud-one">✧</div><div className="map-cloud cloud-two">☁</div>{zones.map((zone, index) => <button key={zone.title} className={`map-zone map-zone-${index + 1} zone-${zone.tint} ${zone.unlocked ? "" : "is-locked"}`} onClick={() => zone.unlocked ? openPuzzle(puzzles.find((puzzle) => puzzle.zone === zone.title)?.id ?? puzzles[0].id) : setToast("Khu vực này sẽ được thầy mở khóa sau nhé!")}><span className="map-zone-icon">{zone.icon}</span><span className="map-zone-text"><b>{zone.title}</b><small>{zone.detail}</small></span>{zone.unlocked ? <span className="map-zone-status"><Check size={13}/>{zone.progress ? `${zone.progress}%` : "Đã mở"}</span> : <LockKeyhole size={17}/>}</button>)}</div><div className="map-legend"><span><i className="legend-open"/> Đã mở khóa</span><span><i className="legend-locked"/> Chưa mở khóa</span><span><i className="legend-progress"/> Đang khám phá</span></div></section>}

          {section === "puzzles" && <section className="page-content subpage"><div className="page-intro puzzle-intro"><div><span className="eyebrow">CHESS PUZZLE ARENA</span><h1>Đấu trường câu đố</h1><p>Mỗi câu đố là một cơ hội để em nghĩ như một nhà vô địch.</p></div><div className="puzzle-tally"><strong>{solvedIds.length}/{puzzles.length}</strong><span>đã hoàn thành</span></div></div><div className="puzzle-filter-row"><div className="filter-pill active">Tất cả thử thách</div><div className="filter-pill">Dễ</div><div className="filter-pill">Vừa</div><div className="filter-pill">Khó</div><span className="puzzle-hint-text"><CircleHelp size={15}/> Chọn một thẻ để bắt đầu</span></div><div className="puzzle-library">{puzzles.map((puzzle, index) => { const done = solvedIds.includes(puzzle.id); return <button className={`puzzle-tile puzzle-tile-${index % 4}`} key={puzzle.id} onClick={() => openPuzzle(puzzle.id)}><div className="puzzle-tile-art"><span>{puzzleIcons[index]}</span><i>{done ? "✓" : "✦"}</i></div><div className="puzzle-tile-body"><div className="puzzle-tile-meta"><span className={`difficulty ${puzzle.difficulty === "Dễ" ? "easy" : puzzle.difficulty === "Vừa" ? "medium" : "hard"}`}>{puzzle.difficulty.toUpperCase()}</span><span>{puzzle.theme}</span></div><h3>{puzzle.title}</h3><p>{puzzle.subtitle}</p><div className="puzzle-tile-bottom"><span>{done ? <><Check size={14}/> Đã hoàn thành</> : <><Star size={14}/> +{puzzle.reward} sao · ✧ {puzzle.rewardPoints} XP</>}</span><span className="tile-arrow"><ArrowRight size={16}/></span></div></div></button>; })}</div></section>}

          {section === "class" && <section className="page-content subpage"><div className="page-intro"><span className="eyebrow">GÓC THÀNH TÍCH</span><h1>Mỗi bước tiến đều đáng tự hào</h1><p>Không cần nhanh nhất. Chỉ cần hôm nay giỏi hơn hôm qua một chút.</p></div><div className="profile-summary panel"><div className="profile-summary-main"><Avatar student={activeStudent} size="lg"/><div><span className="eyebrow">HỒ SƠ KỲ THỦ NHÍ</span><h2>{activeStudent.name}</h2><p>{activeStudent.className} · Cấp {activeRank.level} · {activeRank.title}</p></div></div><button className="soft-button" onClick={() => avatarInput.current?.click()}>Đổi ảnh đại diện</button></div><div className="stats-grid class-stats"><div className="stat-card stat-xp"><div className="stat-icon">✧</div><div><strong>{activeStudent.points}</strong><span>Điểm XP</span></div></div><div className="stat-card stat-stars"><div className="stat-icon">★</div><div><strong>{activeStudent.stars}</strong><span>Sao vàng tích lũy</span></div></div><div className="stat-card stat-puzzles"><div className="stat-icon">♟</div><div><strong>{activeStudent.solved}</strong><span>Câu đố đã giải</span></div></div><div className="stat-card stat-streak"><div className="stat-icon">☀</div><div><strong>{activeStudent.accuracy}%</strong><span>Độ chính xác mẫu</span></div></div><div className="stat-card stat-level"><div className="stat-icon">♜</div><div><strong>{activeStudent.streak} ngày</strong><span>Chuỗi luyện tập</span></div></div></div><div className="panel progress-panel"><div className="panel-header"><div><span className="eyebrow">TIẾN TRÌNH HỌC TẬP</span><h3>Những gì em đã khám phá</h3></div><span className="progress-level">Cấp {activeRank.level} · {activeRank.title}</span></div>{zones.slice(0, 4).map((zone) => <div className="progress-row" key={zone.title}><span className={`progress-piece zone-${zone.tint}`}>{zone.icon}</span><div className="progress-row-copy"><b>{zone.title}</b><small>{zone.detail}</small><div className="progress-track"><span style={{ width: `${zone.progress}%` }}/></div></div><strong>{zone.progress}%</strong></div>)}</div></section>}


          {section === "teacher" && <section className="page-content subpage teacher-page"><div className="page-intro teacher-intro"><div><span className="eyebrow">KHU VỰC RIÊNG CỦA GIÁO VIÊN</span><h1>Teacher Studio</h1><p>Một giáo viên · Một học viên · Một hành trình được cá nhân hóa cho LOUIS.</p></div><div className="teacher-stamp"><GraduationCap size={27}/><span>LOUIS<br/>CONTROL</span></div></div><div className="teacher-stats"><div className="teacher-stat"><UserRound size={19}/><span><b>01</b><small>Học viên duy nhất</small></span></div><div className="teacher-stat"><Target size={19}/><span><b>{puzzles.length}</b><small>Câu đố mẫu</small></span></div><div className="teacher-stat"><Trophy size={19}/><span><b>{solvedIds.length}</b><small>Thử thách LOUIS đã hoàn thành</small></span></div></div><div className="teacher-tabs"><button className={teacherTab === "students" ? "active" : ""} onClick={() => setTeacherTab("students")}>Hồ sơ LOUIS</button><button className={teacherTab === "puzzles" ? "active" : ""} onClick={() => setTeacherTab("puzzles")}>Ngân hàng câu đố</button><button className={teacherTab === "progress" ? "active" : ""} onClick={() => setTeacherTab("progress")}>Báo cáo tiến độ</button></div>
            {teacherTab === "students" && <div className="panel teacher-table-panel"><div className="teacher-table-head"><div><h3>Hồ sơ học viên: LOUIS</h3><p>Chỉ có một hồ sơ học viên trong hệ thống này.</p></div><button className="primary-button" onClick={() => { avatarInput.current?.click(); }}><UserRound size={17}/> Cập nhật ảnh LOUIS</button></div><div className="student-table"><div className="student-row"><Avatar student={activeStudent}/><div className="student-name"><b>LOUIS</b><small>Học viên cá nhân</small></div><div className="student-level"><span>{activeRank.title}</span><small>Cấp {activeRank.level}</small></div><div className="student-stars"><b>★ {activeStudent.stars}</b><small>Sao vàng</small></div><div className="student-stars"><b>✧ {activeStudent.points}</b><small>Điểm XP</small></div><div className="student-solved"><b>{activeStudent.solved}</b><small>Câu đã giải</small></div><button className="row-action" onClick={() => avatarInput.current?.click()}>Đổi ảnh</button></div></div><p className="report-note"><ShieldCheck size={17}/> Ảnh đại diện được lưu trong bản demo ở trình duyệt hiện tại. Khi kết nối Supabase, ảnh sẽ chuyển sang kho riêng tư.</p></div>}
            {teacherTab === "puzzles" && <div className="panel teacher-table-panel"><div className="teacher-table-head"><div><h3>Ngân hàng câu đố dành cho LOUIS</h3><p>Thầy chọn thử thách phù hợp với bài học và năng lực hiện tại của LOUIS.</p></div><span className="beta-tag">BỘ MẪU</span></div>{puzzles.map((puzzle) => <div className="puzzle-admin-row" key={puzzle.id}><span className="admin-piece">♞</span><div><b>{puzzle.title}</b><small>{puzzle.zone} · {puzzle.difficulty} · {puzzle.theme}</small></div><button className="soft-button" onClick={() => openPuzzle(puzzle.id)}>Xem thử <ArrowRight size={14}/></button></div>)}</div>}
            {teacherTab === "progress" && <div className="panel teacher-table-panel"><div className="teacher-table-head"><div><h3>Hành trình của LOUIS</h3><p>Theo dõi sự tiến bộ của LOUIS qua từng buổi học.</p></div></div><div className="report-grid"><div><span>Học viên</span><b>LOUIS</b></div><div><span>Câu đố trong ngân hàng</span><b>{puzzles.length}</b></div><div><span>Thử thách hoàn thành</span><b>{solvedIds.length}</b></div><div><span>Sao LOUIS tích lũy</span><b>{activeStudent.stars}</b></div><div><span>Điểm XP tích lũy</span><b>{activeStudent.points}</b></div></div><div className="report-note"><ShieldCheck size={17}/> Báo cáo theo thời gian và phân tích chủ đề cần luyện thêm sẽ được đồng bộ khi kết nối Supabase.</div></div>}
          </section>}

          <footer className="site-footer"><span>♞ VƯƠNG QUỐC 64 Ô</span><span>Học vui · Nghĩ sâu · Chơi đẹp</span><span>© Chess Adventure</span></footer>
        </div>
      </div>

      {toast && <div className="toast"><Check size={17}/>{toast}</div>}
      {!isSupabaseConfigured && <div className="demo-ribbon"><span/> BẢN DEMO · Dữ liệu lưu trên trình duyệt này · <a href="/login">Đăng nhập hệ thống thật</a></div>}
    </main>
  );
}
