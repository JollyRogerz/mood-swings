import { describe, expect, it } from "vitest";
import { cleanSignal, iceServers, isPolite, seatPan } from "../src/game/voice";
describe("table voice chat rules", () => {
  it("uses free STUN by default and a relay only when fully configured", () => {
    expect(iceServers({})).toEqual([
      {
        urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"],
      },
    ]);
    expect(iceServers({ TURN_URL: "turn:relay.example:3478" })).toHaveLength(1);
    expect(
      iceServers({
        TURN_URL:
          "turn:relay.example:3478, turns:relay.example:443, http://nope",
        TURN_USERNAME: "u",
        TURN_CREDENTIAL: "c",
      })[1],
    ).toEqual({
      urls: ["turn:relay.example:3478", "turns:relay.example:443"],
      username: "u",
      credential: "c",
    });
  });
  it("relays only well-formed handshake messages, rebuilt from known fields", () => {
    expect(
      cleanSignal({
        description: { type: "offer", sdp: "v=0", evil: 1 },
        extra: "x",
      }),
    ).toEqual({ description: { type: "offer", sdp: "v=0" } });
    expect(cleanSignal({ description: { type: "rollback" } })).toEqual({
      description: { type: "rollback" },
    });
    expect(cleanSignal({ candidate: null })).toEqual({ candidate: null });
    expect(
      cleanSignal({
        candidate: {
          candidate: "candidate:1 1 udp 1 10.0.0.1 5000 typ host",
          sdpMid: "0",
          sdpMLineIndex: 0,
          usernameFragment: "abcd",
          foo: "bar",
        },
      }),
    ).toEqual({
      candidate: {
        candidate: "candidate:1 1 udp 1 10.0.0.1 5000 typ host",
        sdpMid: "0",
        sdpMLineIndex: 0,
        usernameFragment: "abcd",
      },
    });
    for (const bad of [
      null,
      "offer",
      {},
      { description: { type: "pranswer", sdp: "x" } },
      { description: { type: "offer", sdp: "x".repeat(12_001) } },
      { description: { type: "offer", sdp: 5 } },
      { candidate: { candidate: 7 } },
      { candidate: { candidate: "x".repeat(601) } },
      { candidate: "text" },
    ])
      expect(cleanSignal(bad)).toBeUndefined();
  });
  it("pans each friend to where their seat is on your screen", () => {
    const order = ["a", "b", "c", "d"];
    expect(seatPan(order, "a", "b")).toBe(-0.7);
    expect(seatPan(order, "a", "c")).toBe(0);
    expect(seatPan(order, "a", "d")).toBe(0.7);
    expect(seatPan(order, "c", "a")).toBe(-0.7);
    expect(seatPan(["a", "b", "c"], "b", "c")).toBe(0.7);
    expect(seatPan(["a", "b"], "a", "b")).toBe(0);
    expect(seatPan(order, "a", "zz")).toBe(0);
  });
  it("exactly one side of every pair is polite", () => {
    expect(isPolite("a", "b")).toBe(true);
    expect(isPolite("b", "a")).toBe(false);
  });
});
