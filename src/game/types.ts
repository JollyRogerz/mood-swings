export type Color = "white" | "blue" | "black" | "red" | "green";
export interface Definition {
  id: string;
  name: string;
  color: Color;
  rarity: string;
  printed_values: number[];
  normalized_dice: string;
  rules_text: string;
  rulings: string[];
  images: { path: string }[];
  ability_types: string[];
}
export interface Mood {
  uid: string;
  def: string;
  copy?: string;
  zone: "deck" | "hand" | "play" | "discard";
  owner: string;
  entered: number;
  serial: number;
  life?: number;
  chosenValue?: number;
  chosenColor?: Color;
  chosenPlayer?: string;
  target?: string;
  turnUsed?: number;
}
export type Difficulty = "easy" | "normal" | "hard" | "fly";
// Ephemeral table chatter. Neither is part of the saved game state.
export const REACTIONS = [
  "😂",
  "😮",
  "😭",
  "🔥",
  "👏",
  "💀",
  "❤️",
  "🤔",
] as const;
export type Reaction = (typeof REACTIONS)[number];
export const PRESENCES = [
  "idle",
  "holding",
  "reading",
  "rules",
  "away",
] as const;
export type Presence = (typeof PRESENCES)[number];
export interface Player {
  bot?: Difficulty;
  id: string;
  name: string;
  wins: number;
  connected: boolean;
}
export interface Grant {
  id: string;
  label: string;
  source: "hand" | "discard";
  filter?: "same" | "different" | "even" | "odd" | "specific";
  specific?: string;
  sourceMood?: string;
  cleanup?: "discard" | "hand";
}
// Tasks are deliberately JSON data, not closures, so games can resume after a restart.
export interface Task {
  kind: string;
  actor: string;
  card?: string;
  stage?: number;
  data?: Record<string, any>;
}
export interface Option {
  id: string;
  label: string;
  card?: string;
  player?: string;
}
export interface Prompt {
  id: string;
  actor: string;
  title: string;
  options: Option[];
  min: number;
  max: number;
  task: Task;
  constraints?: {
    allowedCounts?: number[];
    maxValue?: number;
    differentPlayers?: boolean;
    samePlayer?: boolean;
    matchingPair?: boolean;
  };
}
export interface Suppression {
  target: string;
  source?: string;
  controller?: string;
  round?: number;
}
export interface Delayed {
  id: string;
  sourceDef?: string;
  life?: number;
  targetLife?: number;
  kind: "bashfulness" | "return" | "discard" | "hand" | "swap";
  actor: string;
  card: string;
  target?: string;
  player?: string;
  round: number;
}
export interface Game {
  pace?: import("./pacing").Pace;
  revealReady?: string[];
  visibility?: "private" | "public";
  version: 1;
  revision: number;
  status: "lobby" | "playing" | "finished";
  players: Player[];
  host: string;
  cards: Mood[];
  deck: string[];
  discard: string[];
  round: number;
  turn: number;
  order: string[];
  turnIndex: number;
  rng: number;
  serial: number;
  grants: Grant[];
  queue: Task[];
  prompt?: Prompt;
  suppressions: Suppression[];
  delayed: Delayed[];
  transfers: { source: string; target: string; from: string; taker: string }[];
  nextPlays: { player: string; afterTurn: number; label: string }[];
  bans: { round: number; color: Color }[];
  noScoring: boolean;
  nextFirst?: string;
  roundAward: number;
  discardedRound: number;
  scores: Record<string, number>;
  playPauseUntil?: number;
  lastPlayed?: { id: number; actor: string; def: string; originalDef: string };
  roundPauseUntil?: number;
  lastRound?: {
    round: number;
    scores: Record<string, number>;
    skippedBy?: "awe";
    winner?: string;
    hurtFeelings?: string;
    nextFirst?: string;
    order?: string[];
  };
  winner?: string;
  scoring: boolean;
  afterCursor?: number;
  afterDone: string[];
  log: { id: number; text: string }[];
  pride?: string;
  seed: number;
}
// A decision answered from the hand, before the card is played.
export interface PlannedChoice {
  title: string;
  selected: string[];
}
export type Action =
  | { type: "play"; card: string; grant: string; choices?: PlannedChoice[] }
  | { type: "choose"; prompt: string; selected: string[] }
  | { type: "pass" };
export interface PublicCard extends Mood {
  name: string;
  color: Color;
  value: number;
  suppressed: boolean;
  image: string;
  rules: string;
}
export interface PublicRoom {
  code: string;
  hostName: string;
  players: number;
  bots: number;
}
export interface View {
  pace?: import("./pacing").Pace;
  revealReady?: string[];
  visibility?: "private" | "public";
  presence?: Record<string, Presence>;
  roundPauseMs?: number;
  playPauseMs?: number;
  lastPlayed?: Game["lastPlayed"];
  order: string[];
  suppressions: Suppression[];
  revision: number;
  status: Game["status"];
  players: (Player & { handCount: number; score: number })[];
  host: string;
  you: string;
  hand: PublicCard[];
  moods: PublicCard[];
  discard: PublicCard[];
  deckCount: number;
  round: number;
  active?: string;
  grants: Grant[];
  playable: Record<string, string[]>;
  prompt?: Omit<Prompt, "task">;
  waitingFor?: string;
  winner?: string;
  lastRound?: Game["lastRound"];
  log: Game["log"];
  scoring: boolean;
}
