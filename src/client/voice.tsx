import React, { useCallback, useEffect, useRef, useState } from "react";
import type { Room } from "@colyseus/sdk";
import { Mic, MicOff, PhoneOff, Headphones } from "lucide-react";
import {
  isPolite,
  seatPan,
  type IceServer,
  type Signal,
  type VoiceRoster,
} from "../game/voice";
import "./voice.css";
// Voice chat between the seated players. Audio goes browser to browser over
// WebRTC; the game room only introduces the browsers to each other. Each pair
// follows the "perfect negotiation" pattern, so the same code runs on both
// sides and simultaneous offers resolve themselves.
type LinkState = "connecting" | "connected" | "failed";
interface Peer {
  pc: RTCPeerConnection;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  attempts: number;
  watchdog?: ReturnType<typeof setInterval>;
  audio?: HTMLAudioElement;
  nodes?: { source: MediaStreamAudioSourceNode; analyser: AnalyserNode };
}
const MIC: MediaStreamConstraints = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
  },
  video: false,
};
const VOICE_BITRATE = 32_000;
// A link that has not connected is nudged every so often, a few times, before
// it is reported as unreachable.
const RETRY_EVERY_MS = 10_000;
const MAX_ATTEMPTS = 3;
export const voiceSupported = () =>
  typeof RTCPeerConnection !== "undefined" &&
  !!navigator.mediaDevices?.getUserMedia;
export interface Voice {
  supported: boolean;
  joined: boolean;
  joining: boolean;
  muted: boolean;
  error: string;
  roster: VoiceRoster;
  links: Record<string, LinkState>;
  speaking: Record<string, boolean>;
  join: () => Promise<void>;
  leave: () => void;
  toggleMute: () => void;
}
export function useVoice({
  room,
  epoch,
  you,
  order,
  ice,
  initialRoster,
  enabled,
}: {
  room: React.RefObject<Room | null>;
  // Changes whenever the socket is replaced (first connect, reconnect).
  epoch: number;
  you: string;
  order: string[];
  ice?: IceServer[];
  initialRoster?: VoiceRoster;
  enabled: boolean;
}): Voice {
  const [roster, setRoster] = useState<VoiceRoster>({});
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [muted, setMuted] = useState(true);
  const [error, setError] = useState("");
  const [links, setLinks] = useState<Record<string, LinkState>>({});
  const [speaking, setSpeaking] = useState<Record<string, boolean>>({});
  const peers = useRef(new Map<string, Peer>());
  const mic = useRef<MediaStream | undefined>(undefined);
  const context = useRef<AudioContext | undefined>(undefined);
  const micAnalyser = useRef<AnalyserNode | undefined>(undefined);
  const live = useRef({ muted, you, order, ice });
  live.current = { muted, you, order, ice };
  // Set synchronously, before the room is told: a friend's offer can arrive
  // before React has committed the `joined` state, and must not be dropped.
  const inCall = useRef(false);
  useEffect(() => {
    if (initialRoster) setRoster(initialRoster);
  }, [initialRoster]);
  const send = (to: string, data: Signal) =>
    room.current?.send("rtc", { to, data });
  const closePeer = useCallback((id: string) => {
    const p = peers.current.get(id);
    if (!p) return;
    p.pc.ontrack = p.pc.onicecandidate = p.pc.onnegotiationneeded = null;
    p.pc.onconnectionstatechange = null;
    clearInterval(p.watchdog);
    p.pc.close();
    p.nodes?.source.disconnect();
    if (p.audio) p.audio.srcObject = null;
    peers.current.delete(id);
    setLinks(({ [id]: _gone, ...rest }) => rest);
  }, []);
  const openPeer = useCallback(
    (id: string) => {
      if (peers.current.has(id) || !mic.current) return;
      const pc = new RTCPeerConnection({
        iceServers: live.current.ice as RTCIceServer[] | undefined,
      });
      const peer: Peer = {
        pc,
        polite: isPolite(live.current.you, id),
        makingOffer: false,
        ignoreOffer: false,
        attempts: 0,
      };
      // Try again when a link stalls: a lost handshake message, a slow network,
      // or a first path that did not work out. An offer nobody answered is
      // withdrawn first, because a restart only begins from a settled state.
      const retry = async () => {
        if (pc.connectionState === "connected") return;
        if (peer.attempts >= MAX_ATTEMPTS) {
          clearInterval(peer.watchdog);
          setLinks((old) => ({ ...old, [id]: "failed" }));
          return;
        }
        peer.attempts++;
        setLinks((old) => ({ ...old, [id]: "connecting" }));
        try {
          if (pc.signalingState === "have-local-offer")
            await pc.setLocalDescription({ type: "rollback" });
          pc.restartIce();
        } catch {
          // The next tick tries again.
        }
      };
      peer.watchdog = setInterval(retry, RETRY_EVERY_MS);
      peers.current.set(id, peer);
      setLinks((old) => ({ ...old, [id]: "connecting" }));
      for (const track of mic.current.getTracks())
        pc.addTrack(track, mic.current);
      pc.onnegotiationneeded = async () => {
        try {
          peer.makingOffer = true;
          await pc.setLocalDescription();
          send(id, { description: pc.localDescription!.toJSON() as any });
        } catch {
          // A failed offer is retried by the next negotiationneeded.
        } finally {
          peer.makingOffer = false;
        }
      };
      pc.onicecandidate = ({ candidate }) =>
        send(id, { candidate: candidate ? (candidate.toJSON() as any) : null });
      pc.onconnectionstatechange = () => {
        const s = pc.connectionState;
        if (s === "connected") {
          setLinks((old) => ({ ...old, [id]: "connected" }));
          // Voice does not need music quality; keep everyone's upload small.
          for (const sender of pc.getSenders()) {
            if (sender.track?.kind !== "audio") continue;
            const params = sender.getParameters();
            params.encodings = params.encodings?.length
              ? params.encodings
              : [{}];
            params.encodings[0].maxBitrate = VOICE_BITRATE;
            sender.setParameters(params).catch(() => {});
          }
          peer.attempts = 0;
        } else if (s === "failed") void retry();
        else if (s === "disconnected" || s === "connecting")
          setLinks((old) => ({ ...old, [id]: "connecting" }));
      };
      pc.ontrack = ({ streams, track }) => {
        const stream = streams[0] ?? new MediaStream([track]);
        // Chrome only pulls remote WebRTC audio into Web Audio while a media
        // element also holds the stream, so keep a silent one attached.
        const audio = new Audio();
        audio.srcObject = stream;
        audio.muted = true;
        void audio.play().catch(() => {});
        peer.audio = audio;
        const ctx = context.current;
        if (!ctx) {
          audio.muted = false;
          return;
        }
        const source = ctx.createMediaStreamSource(stream),
          analyser = ctx.createAnalyser(),
          panner = ctx.createStereoPanner();
        analyser.fftSize = 512;
        panner.pan.value = seatPan(live.current.order, live.current.you, id);
        source.connect(analyser);
        source.connect(panner).connect(ctx.destination);
        // Until the audio engine is running, play the stream plainly so friends
        // are heard either way; hand over to the panned mix once it starts.
        const handOver = () => (audio.muted = ctx.state === "running");
        ctx.addEventListener("statechange", handOver);
        handOver();
        peer.nodes = { source, analyser };
      };
    },
    [room],
  );
  // Incoming handshake messages and roster updates, for the current socket.
  useEffect(() => {
    const r = room.current;
    if (!r) return;
    const offRoster = r.onMessage("voice", (next: VoiceRoster) =>
      setRoster(next),
    );
    const offRtc = r.onMessage(
      "rtc",
      async ({ from, data }: { from: string; data: Signal }) => {
        if (!inCall.current) return;
        if (!peers.current.has(from)) openPeer(from);
        const peer = peers.current.get(from);
        if (!peer) return;
        const { pc } = peer;
        try {
          if ("description" in data) {
            const description = data.description as RTCSessionDescriptionInit;
            const collision =
              description.type === "offer" &&
              (peer.makingOffer || pc.signalingState !== "stable");
            peer.ignoreOffer = !peer.polite && collision;
            if (peer.ignoreOffer) return;
            await pc.setRemoteDescription(description);
            if (description.type === "offer") {
              await pc.setLocalDescription();
              send(from, { description: pc.localDescription!.toJSON() as any });
            }
          } else {
            try {
              await pc.addIceCandidate(data.candidate ?? undefined);
            } catch (e) {
              if (!peer.ignoreOffer) throw e;
            }
          }
        } catch {
          // One bad message must not take the call down.
        }
      },
    );
    // A fresh socket means the room forgot us: announce again.
    if (inCall.current)
      r.send("voice", { on: true, muted: live.current.muted });
    return () => {
      (offRoster as unknown as () => void)?.();
      (offRtc as unknown as () => void)?.();
    };
  }, [epoch, enabled, openPeer]);
  // Keep one connection per other member while we are in voice.
  useEffect(() => {
    if (!joined) return;
    const others = Object.keys(roster).filter((id) => id !== you);
    for (const id of others) openPeer(id);
    for (const id of [...peers.current.keys()])
      if (!others.includes(id)) closePeer(id);
  }, [roster, joined, you, openPeer, closePeer]);
  // Who is talking, from the loudness of each stream.
  useEffect(() => {
    if (!joined) return;
    const buffer = new Uint8Array(256);
    const loud = (a?: AnalyserNode) => {
      if (!a) return false;
      a.getByteTimeDomainData(buffer);
      let sum = 0;
      for (const v of buffer) sum += (v - 128) ** 2;
      return Math.sqrt(sum / buffer.length) > 6;
    };
    const timer = setInterval(() => {
      const next: Record<string, boolean> = {};
      if (!live.current.muted && loud(micAnalyser.current)) next[you] = true;
      for (const [id, p] of peers.current)
        if (loud(p.nodes?.analyser)) next[id] = true;
      setSpeaking((old) =>
        JSON.stringify(old) === JSON.stringify(next) ? old : next,
      );
    }, 160);
    return () => clearInterval(timer);
  }, [joined, you]);
  const leave = useCallback(() => {
    if (!inCall.current) return;
    inCall.current = false;
    for (const id of [...peers.current.keys()]) closePeer(id);
    mic.current?.getTracks().forEach((t) => t.stop());
    mic.current = undefined;
    micAnalyser.current = undefined;
    void context.current?.close().catch(() => {});
    context.current = undefined;
    setJoined(false);
    setMuted(true);
    setSpeaking({});
    room.current?.send("voice", { on: false });
  }, [closePeer, room]);
  const join = useCallback(async () => {
    if (joined || joining) return;
    setError("");
    setJoining(true);
    // Start the audio engine inside the click, before the permission prompt can
    // outlast the browser's "user gesture" window. Never wait on it.
    const Ctx: typeof AudioContext | undefined =
      window.AudioContext ?? (window as any).webkitAudioContext;
    const ctx = Ctx ? new Ctx() : undefined;
    void ctx?.resume().catch(() => {});
    try {
      const stream = await navigator.mediaDevices.getUserMedia(MIC);
      // You join listening; the microphone opens when you unmute.
      stream.getAudioTracks().forEach((t) => (t.enabled = false));
      mic.current = stream;
      if (ctx) {
        context.current = ctx;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        ctx.createMediaStreamSource(stream).connect(analyser);
        micAnalyser.current = analyser;
      }
      inCall.current = true;
      setMuted(true);
      setJoined(true);
      room.current?.send("voice", { on: true, muted: true });
    } catch (e) {
      void ctx?.close().catch(() => {});
      const name = (e as DOMException)?.name;
      setError(
        name === "NotAllowedError" || name === "SecurityError"
          ? "Microphone access was blocked. Allow it in the browser to join voice."
          : name === "NotFoundError"
            ? "No microphone was found on this device."
            : "Could not start the microphone.",
      );
    } finally {
      setJoining(false);
    }
  }, [joined, joining, room]);
  const toggleMute = useCallback(() => {
    void context.current?.resume().catch(() => {});
    const next = !live.current.muted;
    mic.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
    room.current?.send("voice", { on: true, muted: next });
  }, [room]);
  // Leaving the table, or losing the seat, ends the call.
  useEffect(() => {
    if (!enabled && inCall.current) leave();
  }, [enabled, leave]);
  useEffect(() => () => leave(), []);
  return {
    supported: voiceSupported(),
    joined,
    joining,
    muted,
    error,
    roster,
    links,
    speaking,
    join,
    leave,
    toggleMute,
  };
}
// The controls, in the header: join, then mute and hang up.
export function VoiceDock({ voice }: { voice: Voice }) {
  if (!voice.supported) return null;
  const others = Object.keys(voice.roster).length - (voice.joined ? 1 : 0);
  const failed = Object.values(voice.links).filter(
    (s) => s === "failed",
  ).length;
  if (!voice.joined)
    return (
      <span className="voice-dock">
        <button
          className="voice-join"
          onClick={voice.join}
          disabled={voice.joining}
          aria-label="Join voice chat"
        >
          <Headphones size={16} />
          <span>
            {voice.joining
              ? "Asking for the mic…"
              : others > 0
                ? `Join voice · ${others} talking`
                : "Join voice"}
          </span>
        </button>
        {voice.error && (
          <small className="voice-note" role="alert">
            {voice.error}
          </small>
        )}
      </span>
    );
  return (
    <span className="voice-dock joined">
      <button
        className={`voice-mic ${voice.muted ? "muted" : "live"}`}
        onClick={voice.toggleMute}
        aria-pressed={!voice.muted}
        aria-label={voice.muted ? "Unmute microphone" : "Mute microphone"}
      >
        {voice.muted ? <MicOff size={16} /> : <Mic size={16} />}
        <span>{voice.muted ? "Muted" : "Live"}</span>
      </button>
      <button
        className="voice-leave"
        onClick={voice.leave}
        aria-label="Leave voice chat"
      >
        <PhoneOff size={15} />
      </button>
      {failed > 0 && (
        <small className="voice-note" role="status">
          {failed === 1 ? "One friend’s" : `${failed} friends’`} network blocks
          direct audio.
        </small>
      )}
    </span>
  );
}
// A small badge on a seat: in voice, muted, talking, or unreachable.
export function VoiceBadge({ voice, id }: { voice: Voice; id: string }) {
  const member = voice.roster[id];
  if (!member) return null;
  const talking = !!voice.speaking[id];
  const link = voice.links[id];
  const label = member.muted
    ? "In voice, muted"
    : talking
      ? "Talking"
      : link === "failed"
        ? "In voice, but their network blocks direct audio"
        : link === "connecting"
          ? "Connecting voice…"
          : "In voice";
  return (
    <span
      className={`voice-badge ${talking ? "talking" : ""} ${member.muted ? "muted" : ""} ${link ?? ""}`}
      title={label}
      aria-label={label}
      role="img"
    >
      {member.muted ? <MicOff size={12} /> : <Mic size={12} />}
    </span>
  );
}
