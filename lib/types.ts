export type Student = {
  id: string;
  name: string;
  nickname: string;
  level: string;
  stars: number;
  points: number;
  solved: number;
  accuracy: number;
  streak: number;
  className: string;
  avatar: string | null;
  color: string;
};

export type Puzzle = {
  id: string;
  title: string;
  subtitle: string;
  difficulty: "Dễ" | "Vừa" | "Khó";
  theme: string;
  fen: string;
  solution: string[];
  hint: string;
  explanation: string;
  reward: number;
  rewardPoints: number;
  zone: string;
};

export type AppSection = "home" | "map" | "puzzles" | "class" | "teacher";

export type PuzzleAward = {
  awarded: boolean;
  stars: number;
  points: number;
  totalPoints: number;
  alreadySolved?: boolean;
};
