"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Chess, type Square, type Move } from "chess.js";
import { ArrowLeft, Check, CircleHelp, Hand, Lightbulb, Play, RotateCcw, Sparkles, Undo2, Volume2, VolumeX } from "lucide-react";
import type { Puzzle, PuzzleAward } from "@/lib/types";

type Props = {
  puzzle: Puzzle;
  studentName: string;
  studentAvatar?: string | null;
  onSolved: (puzzleId: string, stars: number, points: number, movesUci: string[], hintsUsed: number, elapsedSeconds: number, stateToken: string | null) => void | PuzzleAward | Promise<void | PuzzleAward>;
  onValidateMove?: (puzzleId: string, movesSoFar: string[], nextMove: string, stateToken: string | null) => Promise<{
    accepted: boolean;
    opponentMoves: string[];
    completed: boolean;
    stateToken: string | null;
    message?: string;
  }>;
  onGetVisualHint: (puzzleId: string, movesSoFar: string[], stateToken: string | null, step: number) => Promise<{ from: string; to?: string }>;
  onExit: () => void;
};

const PIECES: Record<string, string> = {
  wk: "♔", wq: "♕", wr: "♖", wb: "♗", wn: "♘", wp: "♙",
  bk: "♚", bq: "♛", br: "♜", bb: "♝", bn: "♞", bp: "♟",
};
const FILES = "abcdefgh";

function uci(move: Move) {
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

export default function ChessArena({ puzzle, studentName, studentAvatar, onSolved, onValidateMove, onGetVisualHint, onExit }: Props) {
  const [fen, setFen] = useState(puzzle.fen);
  const [history, setHistory] = useState<string[]>([puzzle.fen]);
  const [moveUciHistory, setMoveUciHistory] = useState<string[]>([]);
  const [stateToken, setStateToken] = useState<string | null>(null);
  const [stateTokenHistory, setStateTokenHistory] = useState<(string | null)[]>([null]);
  const [hintsUsed, setHintsUsed] = useState(0);
  const startedAtRef = useRef(Date.now());
  const [selected, setSelected] = useState<Square | null>(null);
  const [targetMoves, setTargetMoves] = useState<Move[]>([]);
  const [promotion, setPromotion] = useState<{ from: Square; to: Square; choices: Move[] } | null>(null);
  const [hintOpen, setHintOpen] = useState(false);
  const [message, setMessage] = useState("Chọn một quân cờ rồi chạm vào ô muốn đi nhé!");
  const [solved, setSolved] = useState(false);
  const [solvedAward, setSolvedAward] = useState<PuzzleAward | null>(null);
  const [checkingMove, setCheckingMove] = useState(false);
  const checkingMoveRef = useRef(false);
  const [sound, setSound] = useState(false);
  const [visualHint, setVisualHint] = useState<{ from: Square; to?: Square; stage: 1 | 2 | 3 } | null>(null);
  const [hintStep, setHintStep] = useState(0);
  const [hintLoading, setHintLoading] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);

  const game = useMemo(() => new Chess(fen), [fen]);
  const board = game.board();
  const currentMoves = game.moves({ verbose: true });

  useEffect(() => {
    setFen(puzzle.fen);
    setHistory([puzzle.fen]);
    startedAtRef.current = Date.now();
    setMoveUciHistory([]);
    setStateToken(null);
    setStateTokenHistory([null]);
    setHintsUsed(0);
    setSelected(null);
    setTargetMoves([]);
    setPromotion(null);
    setHintOpen(false);
    setVisualHint(null);
    setHintStep(0);
    setHintLoading(false);
    setPreviewVisible(false);
    setSolved(false);
    setSolvedAward(null);
    setMessage("Chạm vào một quân cờ để bắt đầu nhé!");
  }, [puzzle.id, puzzle.fen]);

  const commitMove = async (move: Move) => {
    if (checkingMoveRef.current) return;
    checkingMoveRef.current = true;
    setCheckingMove(true);
    try {
      const next = new Chess(fen);
      const applied = next.move({ from: move.from, to: move.to, promotion: move.promotion });
      if (!applied) return;
      const played = uci(applied);
      const nextHistory = [...history, next.fen()];
      const nextMoveHistory = [...moveUciHistory, played];
      let opponentReplied = false;
      let completed = false;
      let nextStateToken: string | null = stateToken;

      if (onValidateMove) {
        let validation;
        try {
          validation = await onValidateMove(puzzle.id, moveUciHistory, played, stateToken);
        } catch {
          setMessage("Chưa xác nhận được nước đi. Con kiểm tra kết nối rồi thử lại nhé!");
          return;
        }
        if (!validation.accepted) {
          setMessage(validation.message || "Chưa đúng hướng rồi. Con thử nghĩ thêm nhé!");
          setSelected(null);
          setTargetMoves([]);
          return;
        }
        for (const replyUci of validation.opponentMoves) {
          const reply = next.move({
            from: replyUci.slice(0, 2) as Square,
            to: replyUci.slice(2, 4) as Square,
            ...(replyUci[4] ? { promotion: replyUci[4] } : {}),
          });
          if (!reply) throw new Error("Nước đáp trả không hợp lệ.");
          nextMoveHistory.push(uci(reply));
          nextHistory.push(next.fen());
          opponentReplied = true;
        }
        completed = validation.completed;
        nextStateToken = validation.stateToken;
      } else {
        const expected = puzzle.solution[history.length - 1];
        if (played !== expected) {
          setMessage("Chưa phải nước đi của thử thách này. Con thử nhìn thêm một chút nhé!");
          setSelected(null);
          setTargetMoves([]);
          return;
        }
        const playerColor = new Chess(puzzle.fen).turn();
        // If the authored line includes a forced opponent reply, play it automatically.
        while (nextMoveHistory.length < puzzle.solution.length && next.turn() !== playerColor) {
          const replyUci = puzzle.solution[nextMoveHistory.length];
          const from = replyUci.slice(0, 2) as Square;
          const to = replyUci.slice(2, 4) as Square;
          const promotion = replyUci[4];
          const replyCandidate = next.moves({ verbose: true }).find((candidate) =>
            candidate.from === from && candidate.to === to && (candidate.promotion ?? "") === (promotion ?? "")
          );
          if (!replyCandidate) {
            setMessage("Lời giải đang thiếu hoặc sai nước đáp trả của đối phương. Thầy cần kiểm tra lại câu đố.");
            return;
          }
          const reply = next.move({ from, to, ...(promotion ? { promotion } : {}) });
          if (!reply) return;
          nextMoveHistory.push(uci(reply));
          nextHistory.push(next.fen());
          opponentReplied = true;
        }
        completed = nextMoveHistory.length >= puzzle.solution.length;
      }

      setSelected(null);
      setTargetMoves([]);
      setPromotion(null);
      setVisualHint(null);
      setHintStep(0);
      setPreviewVisible(false);
      if (completed) {
        try {
          const award = await onSolved(
            puzzle.id,
            puzzle.reward,
            puzzle.rewardPoints,
            nextMoveHistory,
            hintsUsed,
            Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000)),
            nextStateToken,
          );
          setSolvedAward(award ?? { awarded: true, stars: puzzle.reward, points: puzzle.rewardPoints, totalPoints: 0 });
        } catch {
          setMessage("Chưa lưu được kết quả. Kết nối mạng rồi thử lại nhé!");
          return;
        }
        setSolved(true);
        setMessage("Tuyệt vời! Con đã tìm ra lời giải! 🌟");
        playSuccessTone();
        speak("Tuyệt vời! Con đã tìm ra lời giải!");
      } else {
        setMessage(opponentReplied ? "Đối phương đã đáp trả. Bây giờ đến lượt con tìm nước đi tiếp theo!" : "Chính xác! Bây giờ hãy tiếp tục tìm nước đi tiếp theo.");
      }
      setHistory(nextHistory);
      setMoveUciHistory(nextMoveHistory);
      setStateToken(nextStateToken);
      setStateTokenHistory((current) => [...current, nextStateToken]);
      setFen(next.fen());
    } finally {
      checkingMoveRef.current = false;
      setCheckingMove(false);
    }
  };

  const speak = (text: string) => {
    if (!sound || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "vi-VN";
      utterance.rate = 0.88;
      utterance.pitch = 1.08;
      window.speechSynthesis.speak(utterance);
    } catch { /* Device speech support is optional. */ }
  };

  const requestVisualHint = async (stage: 1 | 2 | 3) => {
    if (hintLoading || checkingMove || solved) return;
    setHintLoading(true);
    try {
      const result = await onGetVisualHint(puzzle.id, moveUciHistory, stateToken, stage);
      if (!/^[a-h][1-8]$/.test(result.from) || (result.to && !/^[a-h][1-8]$/.test(result.to))) {
        throw new Error("Gợi ý nhận được không hợp lệ.");
      }
      setVisualHint({ from: result.from as Square, ...(result.to ? { to: result.to as Square } : {}), stage });
      setHintStep(stage);
      setPreviewVisible(stage === 3);
      setHintsUsed((count) => count + 1);
      if (stage === 1) {
        setMessage("Hãy chạm vào quân đang phát sáng nhé!");
        speak("Con hãy chạm vào quân cờ đang phát sáng.");
      } else if (stage === 2) {
        setMessage("Hãy nhìn mũi tên và tìm ô đích nhé!");
        speak("Con nhìn mũi tên. Hãy đưa quân cờ đến ô đang phát sáng.");
      } else {
        setMessage("Con xem mẫu rồi tự đi lại một lần nhé!");
        speak("Con hãy quan sát nước đi mẫu, rồi tự làm lại nhé.");
      }
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Chưa tải được gợi ý hình ảnh.");
    } finally {
      setHintLoading(false);
    }
  };

  const nextVisualHint = () => {
    const next = hintStep >= 3 ? 1 : hintStep + 1;
    void requestVisualHint(next as 1 | 2 | 3);
  };

  const clearVisualHint = () => {
    setVisualHint(null);
    setHintStep(0);
    setPreviewVisible(false);
    setMessage("Con có thể tự tìm nước đi. Nếu cần, hãy dùng một gợi ý bằng hình nhé!");
  };

  const handleSquare = (square: Square) => {
    if (solved || promotion || checkingMoveRef.current) return;
    const piece = game.get(square);
    if (selected) {
      const candidates = targetMoves.filter((move) => move.to === square);
      if (candidates.length > 1) {
        setPromotion({ from: selected, to: square, choices: candidates });
        return;
      }
      if (candidates.length === 1) {
        void commitMove(candidates[0]);
        return;
      }
    }
    if (piece && piece.color === game.turn()) {
      const moves = currentMoves.filter((move) => move.from === square);
      setSelected(square);
      setTargetMoves(moves);
      setMessage(moves.length ? "Con có thể đi đến những ô được đánh dấu." : "Quân này hiện chưa có nước đi hợp lệ.");
    } else {
      setSelected(null);
      setTargetMoves([]);
    }
  };

  const reset = () => {
    setFen(puzzle.fen);
    setHistory([puzzle.fen]);
    startedAtRef.current = Date.now();
    setMoveUciHistory([]);
    setStateToken(null);
    setStateTokenHistory([null]);
    setHintsUsed(0);
    setSelected(null);
    setTargetMoves([]);
    setPromotion(null);
    setSolved(false);
    setHintOpen(false);
    setVisualHint(null);
    setHintStep(0);
    setPreviewVisible(false);
    setMessage("Mình bắt đầu lại nhé. Con có thể làm được!");
  };

  const undo = () => {
    if (history.length <= 1 || solved) return;
    const pliesToUndo = moveUciHistory.length > 1 && moveUciHistory.length % 2 === 0 ? 2 : 1;
    const nextHistory = history.slice(0, -pliesToUndo);
    setHistory(nextHistory);
    setMoveUciHistory((current) => current.slice(0, -pliesToUndo));
    const previousTokens = stateTokenHistory.slice(0, -1);
    const previousToken = previousTokens[previousTokens.length - 1] ?? null;
    setStateTokenHistory(previousTokens.length ? previousTokens : [null]);
    setStateToken(previousToken);
    setFen(nextHistory[nextHistory.length - 1]);
    setSelected(null);
    setTargetMoves([]);
    setMessage("Đã quay lại nước đi trước.");
  };

  const legalTargets = new Set(targetMoves.map((move) => move.to));
  const check = game.isCheck();

  const playSuccessTone = () => {
    if (!sound || typeof window === "undefined" || !window.AudioContext) return;
    try {
      const context = new window.AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(660, context.currentTime);
      oscillator.frequency.setValueAtTime(880, context.currentTime + 0.12);
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.32);
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.start(); oscillator.stop(context.currentTime + 0.34);
      oscillator.onended = () => { void context.close(); };
    } catch { /* Sound is optional and must never block puzzle completion. */ }
  };

  return (
    <section className="arena-view">
      <div className="arena-topline">
        <button className="back-link" onClick={onExit} disabled={checkingMove}><ArrowLeft size={17} /> Quay lại thử thách</button>
        <button className="icon-button" aria-label={sound ? "Tắt âm thanh và giọng nói" : "Bật âm thanh và giọng nói"} title={sound ? "Tắt giọng nói" : "Bật giọng nói"} onClick={() => { setSound((value) => !value); if (!sound) window.setTimeout(() => { try { const utterance = new SpeechSynthesisUtterance("Âm thanh đã bật"); utterance.lang = "vi-VN"; window.speechSynthesis?.speak(utterance); } catch { /* Optional voice support. */ } }, 0); }}>
          {sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>
      </div>
      <div className="arena-heading">
        <div className="arena-heading-personal">
          {studentAvatar ? <img className="arena-student-avatar" src={studentAvatar} alt={`Ảnh ${studentName}`} /> : <span className="arena-student-avatar arena-student-avatar-fallback">{studentName.slice(0, 1).toLocaleUpperCase("vi-VN")}</span>}
          <div>
            <div className="eyebrow">THỬ THÁCH DÀNH RIÊNG CHO {studentName.toLocaleUpperCase("vi-VN")}</div>
            <h1>{puzzle.title}</h1>
            <p>{puzzle.subtitle}</p>
          </div>
        </div>
        <div className="arena-reward"><span>✧</span><b>+{puzzle.rewardPoints} XP</b><small>+{puzzle.reward} sao vàng</small></div>
      </div>
      <div className="arena-layout">
        <div className="board-panel">
          <div className="turn-strip"><span className="turn-dot" /> {solved ? "Thử thách hoàn thành" : check ? "Vua đang bị chiếu" : game.turn() === "w" ? "Đến lượt Trắng" : "Đến lượt Đen"}<span className="move-counter">Nước {Math.floor((history.length - 1) / 2) + 1}</span></div>
          <div className="visual-mode-toolbar" aria-label="Chế độ hỗ trợ bằng hình ảnh">
            <button className={`visual-mode-button ${!visualHint ? "active" : ""}`} onClick={clearVisualHint} disabled={checkingMove || hintLoading} aria-label="Tự khám phá">
              <Hand size={24}/><span>Tự chơi</span>
            </button>
            <button className={`visual-mode-button visual-hint-button ${visualHint && visualHint.stage < 3 ? "active" : ""}`} onClick={nextVisualHint} disabled={checkingMove || hintLoading || solved} aria-label="Gợi ý bằng hình ảnh">
              <Lightbulb size={24}/><span>{hintLoading ? "Đang tìm..." : "Gợi ý hình"}</span><i>{hintStep ? `${hintStep}/3` : "✦"}</i>
            </button>
            <button className={`visual-mode-button visual-watch-button ${previewVisible ? "active" : ""}`} onClick={() => void requestVisualHint(3)} disabled={checkingMove || hintLoading || solved} aria-label="Xem nước đi mẫu">
              <Play size={24}/><span>Xem mẫu</span>
            </button>
          </div>
          <div className={`chessboard ${previewVisible ? "preview-active" : ""}`} role="grid" aria-label="Bàn cờ vua 8 nhân 8">
            {board.map((row, rowIndex) => row.map((piece, colIndex) => {
              const square = `${FILES[colIndex]}${8 - rowIndex}` as Square;
              const isLight = (rowIndex + colIndex) % 2 === 0;
              const isSelected = selected === square;
              const canMove = legalTargets.has(square);
              const symbol = piece ? PIECES[`${piece.color}${piece.type}`] : "";
              return (
                <button
                  key={square}
                  className={`square ${isLight ? "light" : "dark"} ${isSelected ? "selected" : ""} ${canMove ? "can-move" : ""} ${visualHint?.from === square ? "visual-origin" : ""} ${visualHint?.to === square ? "visual-destination" : ""}`}
                  onClick={() => handleSquare(square)}
                  aria-label={`${square}${piece ? `, ${piece.color === "w" ? "quân trắng" : "quân đen"} ${piece.type}` : ""}`}
                  role="gridcell"
                >
                  {colIndex === 0 && <span className="rank-label">{8 - rowIndex}</span>}
                  {rowIndex === 7 && <span className="file-label">{FILES[colIndex]}</span>}
                  {symbol && <span className={`piece ${piece?.color === "w" ? "white-piece" : "black-piece"}`}>{symbol}</span>}
                  {canMove && <span className={`move-dot ${piece ? "capture-dot" : ""}`} />}
                </button>
              );
            }))}
            {visualHint && visualHint.to && (() => {
              const fromFile = visualHint.from.charCodeAt(0) - 97;
              const fromRank = 8 - Number(visualHint.from[1]);
              const toFile = visualHint.to.charCodeAt(0) - 97;
              const toRank = 8 - Number(visualHint.to[1]);
              const x1 = fromFile * 100 + 50;
              const y1 = fromRank * 100 + 50;
              const x2 = toFile * 100 + 50;
              const y2 = toRank * 100 + 50;
              return <svg className={`visual-hint-arrow ${previewVisible ? "is-preview" : ""}`} viewBox="0 0 800 800" aria-hidden="true">
                <defs><marker id="visual-arrow-head" markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#168a55"/></marker></defs>
                <line x1={x1} y1={y1} x2={x2} y2={y2} markerEnd="url(#visual-arrow-head)"/>
                <circle cx={x1} cy={y1} r="29" className="visual-arrow-origin"/>
                <circle cx={x2} cy={y2} r="35" className="visual-arrow-target"/>
              </svg>;
            })()}
            {previewVisible && visualHint?.to && (() => {
              const fromFile = visualHint.from.charCodeAt(0) - 97;
              const fromRow = 8 - Number(visualHint.from[1]);
              const toFile = visualHint.to.charCodeAt(0) - 97;
              const toRow = 8 - Number(visualHint.to[1]);
              const pieceAtSource = game.get(visualHint.from);
              const ghost = pieceAtSource ? PIECES[`${pieceAtSource.color}${pieceAtSource.type}`] : "♟";
              return <span
                key={`${puzzle.id}-${moveUciHistory.length}-${visualHint.from}-${visualHint.to}`}
                className={`preview-piece-ghost ${pieceAtSource?.color === "w" ? "white-piece" : "black-piece"}`}
                style={{
                  left: `${fromFile * 12.5 + 6.25}%`,
                  top: `${fromRow * 12.5 + 6.25}%`,
                  "--end-x": `${toFile * 12.5 + 6.25}%`,
                  "--end-y": `${toRow * 12.5 + 6.25}%`,
                } as CSSProperties}
                aria-hidden="true"
              >{ghost}</span>;
            })()}
          </div>
          {promotion && <div className="promotion-picker"><b>Chọn quân phong cấp</b>{promotion.choices.map((move) => <button key={move.promotion} onClick={() => { void commitMove(move); }}>{move.promotion?.toUpperCase()}</button>)}</div>}
          <div className={`coach-message ${solved ? "success-message" : ""}`}>
            <span className="coach-avatar">♘</span><span>{checkingMove ? "Đang kiểm tra nước đi của con..." : message}</span>
          </div>
          <div className="board-actions">
            <button className="soft-button" onClick={undo} disabled={history.length <= 1 || solved || checkingMove}><Undo2 size={16} /> Lùi một nước</button>
            <button className="soft-button" onClick={reset} disabled={checkingMove}><RotateCcw size={16} /> Chơi lại</button>
            <button className="soft-button hint-button" disabled={checkingMove || solved} onClick={() => { setHintOpen((value) => { if (!value) { setHintsUsed((count) => count + 1); speak(puzzle.hint); } return !value; }); setMessage(puzzle.hint); }}><Lightbulb size={16} /> Gợi ý bằng lời</button>
          </div>
          {hintOpen && <div className="hint-card"><Lightbulb size={17} /><p>{puzzle.hint}</p></div>}
          {solved && <div className="solved-banner"><Sparkles size={19} /><div><b>Con làm rất tốt!</b><span>{solvedAward?.awarded === false ? "Thử thách này đã nhận thưởng trước đó." : `+${solvedAward?.points ?? puzzle.rewardPoints} XP · Tổng ${solvedAward?.totalPoints ? `${solvedAward.totalPoints} XP` : "đã cập nhật"} · +${solvedAward?.stars ?? puzzle.reward} sao vàng!`}</span></div><button onClick={onExit}>Tiếp tục</button></div>}
        </div>
        <aside className="arena-side">
          <div className="side-card objective-card">
            <div className="side-card-top"><span className="mini-icon yellow">♟</span><span className="eyebrow">NHIỆM VỤ</span></div>
            <h3>{puzzle.theme}</h3>
            <p>{puzzle.subtitle}</p>
            <div className="objective-progress"><span style={{ width: solved ? "100%" : "12%" }} /></div>
            <small>{solved ? "Đã hoàn thành" : "Đang chờ nước đi của con"}</small>
          </div>
          <div className="side-card">
            <div className="side-card-top"><span className="mini-icon blue"><CircleHelp size={17} /></span><span className="eyebrow">MẸO NHỎ</span></div>
            <h3>Nhìn toàn bàn cờ</h3>
            <p>Trước khi đi, hãy tự hỏi: quân nào đang bị tấn công và ô đến có an toàn không?</p>
          </div>
          <div className="side-card notation-card">
            <span className="eyebrow">LỊCH SỬ NƯỚC ĐI</span>
            {history.length === 1 ? <p className="muted">Các nước đi của con sẽ xuất hiện ở đây.</p> : <ol>{history.slice(1).map((item, index) => <li key={`${item}-${index}`}>Nước {index + 1}: {index === 0 ? "Con đã tìm ra nước đi!" : "Tiếp tục"}</li>)}</ol>}
          </div>
          <div className="tiny-note"><Check size={14} /> Mỗi nước đi đều được kiểm tra theo luật cờ vua.</div>
        </aside>
      </div>
    </section>
  );
}
