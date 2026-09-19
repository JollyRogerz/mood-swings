// Table voice chat: the rules for who may talk and what may be relayed.
//
// Audio never touches this server. Browsers connect to each other directly
// (WebRTC); the room only passes along the small messages two browsers need to
// find one another, and only between seated players who have both joined voice.
export interface VoiceMember {
  muted: boolean;
}
export type VoiceRoster = Record<string, VoiceMember>;
export interface IceServer {
  urls: string[];
  username?: string;
  credential?: string;
}
// Free public STUN servers tell a browser its own public address. A TURN relay
// is optional and only used when the host configures one.
export function iceServers(
  env: Record<string, string | undefined>,
): IceServer[] {
  const servers: IceServer[] = [
    {
      urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"],
    },
  ];
  const turn = env.TURN_URL?.split(",")
    .map((u) => u.trim())
    .filter((u) => /^turns?:/.test(u));
  if (turn?.length && env.TURN_USERNAME && env.TURN_CREDENTIAL)
    servers.push({
      urls: turn,
      username: env.TURN_USERNAME,
      credential: env.TURN_CREDENTIAL,
    });
  return servers;
}
export type Signal =
  | { description: { type: "offer" | "answer" | "rollback"; sdp?: string } }
  | {
      candidate: {
        candidate: string;
        sdpMid: string | null;
        sdpMLineIndex: number | null;
        usernameFragment: string | null;
      } | null;
    };
const MAX_SDP = 12_000;
const text = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.length <= max;
// Rebuild the message from known fields only, so nothing else is relayed.
export function cleanSignal(raw: unknown): Signal | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, any>;
  if (r.description && typeof r.description === "object") {
    const { type, sdp } = r.description;
    if (!["offer", "answer", "rollback"].includes(type)) return undefined;
    if (sdp !== undefined && !text(sdp, MAX_SDP)) return undefined;
    return { description: sdp === undefined ? { type } : { type, sdp } };
  }
  if ("candidate" in r) {
    if (r.candidate === null) return { candidate: null };
    const c = r.candidate;
    if (!c || typeof c !== "object" || !text(c.candidate, 600))
      return undefined;
    return {
      candidate: {
        candidate: c.candidate,
        sdpMid: text(c.sdpMid, 32) ? c.sdpMid : null,
        sdpMLineIndex:
          Number.isInteger(c.sdpMLineIndex) && c.sdpMLineIndex >= 0
            ? c.sdpMLineIndex
            : null,
        usernameFragment: text(c.usernameFragment, 64)
          ? c.usernameFragment
          : null,
      },
    };
  }
  return undefined;
}
// Where a friend's voice sits between your ears, from where their seat sits on
// your screen: opponents are laid out left to right in table order.
export function seatPan(order: string[], you: string, other: string): number {
  const others = order.filter((id) => id !== you);
  const i = others.indexOf(other);
  if (i < 0 || others.length < 2) return 0;
  return Number((-0.7 + (1.4 * i) / (others.length - 1)).toFixed(2));
}
// The peer with the smaller id yields when both sides offer at once.
export const isPolite = (you: string, other: string) => you < other;
