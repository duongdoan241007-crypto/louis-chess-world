export type XpRank = {
  level: number;
  title: string;
  minXp: number;
  nextXp: number | null;
  progressXp: number;
  progressPercent: number;
  remainingXp: number;
};

const RANKS = [
  { level: 1, title: "Tốt tập sự", minXp: 0, nextXp: 300 },
  { level: 2, title: "Nhà thám hiểm", minXp: 300, nextXp: 800 },
  { level: 3, title: "Chiến thuật gia", minXp: 800, nextXp: 1600 },
  { level: 4, title: "Hiệp sĩ", minXp: 1600, nextXp: 3000 },
  { level: 5, title: "Đại kiện tướng nhí", minXp: 3000, nextXp: null },
] as const;

/** Derive a display rank from the authoritative XP total. Never trust a client-supplied rank. */
export function getXpRank(rawXp: number): XpRank {
  const xp = Number.isFinite(rawXp) ? Math.max(0, Math.floor(rawXp)) : 0;
  const current = [...RANKS].reverse().find((rank) => xp >= rank.minXp) ?? RANKS[0];
  if (current.nextXp === null) {
    return {
      level: current.level,
      title: current.title,
      minXp: current.minXp,
      nextXp: null,
      progressXp: xp - current.minXp,
      progressPercent: 100,
      remainingXp: 0,
    };
  }
  const span = current.nextXp - current.minXp;
  const progressXp = Math.min(span, Math.max(0, xp - current.minXp));
  return {
    level: current.level,
    title: current.title,
    minXp: current.minXp,
    nextXp: current.nextXp,
    progressXp,
    progressPercent: Math.min(100, Math.floor((progressXp / span) * 100)),
    remainingXp: Math.max(0, current.nextXp - xp),
  };
}

export function defaultXpReward(difficulty: string): number {
  if (difficulty === "Khó") return 200;
  if (difficulty === "Vừa") return 150;
  return 100;
}
