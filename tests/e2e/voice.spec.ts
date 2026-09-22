import { test, expect, type Page } from "@playwright/test";
// Chromium's fake microphone produces a repeating beep, so two real browsers
// can hold a real peer-to-peer call in CI with no hardware.
test.use({
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      // Both peers run on this test machine; avoid multicast DNS on CI runners.
      "--disable-features=WebRtcHideLocalIpsWithMdns",
    ],
  },
  permissions: ["microphone", "local-network-access"],
});
// Keep a handle on every connection so the test can read WebRTC's own
// statistics. Injected as text: a serialized function would carry build helpers.
const trackConnections = `
  window.__pcs = [];
  const Original = window.RTCPeerConnection;
  window.RTCPeerConnection = function (config) {
    // This tests real local UDP audio and application signaling. Public STUN
    // availability and NAT traversal are separate deployment checks.
    const pc = new Original({ ...config, iceServers: [] });
    window.__pcs.push(pc);
    return pc;
  };
  window.RTCPeerConnection.prototype = Original.prototype;
`;
// Whether real sound is arriving, read from WebRTC's own counters so it does
// not depend on a sound card. Opus encodes silence (a muted microphone) in
// about 34 bytes per packet and a voice in well over 50.
async function bytesPerPacket(page: Page) {
  const sample = () =>
    page.evaluate(async () => {
      let bytes = 0,
        packets = 0;
      for (const pc of (window as any).__pcs as RTCPeerConnection[]) {
        if (pc.connectionState !== "connected") continue;
        (await pc.getStats()).forEach((r: any) => {
          if (r.type === "inbound-rtp" && r.kind === "audio") {
            bytes += r.bytesReceived ?? 0;
            packets += r.packetsReceived ?? 0;
          }
        });
      }
      return { bytes, packets };
    });
  const first = await sample();
  await page.waitForTimeout(1500);
  const second = await sample();
  const packets = second.packets - first.packets;
  return packets > 20 ? (second.bytes - first.bytes) / packets : 0;
}
const SILENCE = 45;
const seatBadge = (page: Page, name: string) =>
  page
    .locator(".player-zone, .lobby-seat")
    .filter({ hasText: name })
    .locator(".voice-badge");
// This is the one scenario that needs real UDP between two browsers on a shared
// CI machine, so it is allowed to try again; the app itself also re-attempts a
// stalled link, which the generous connection timeout leaves room for.
test.describe.configure({ retries: 2 });
test("two friends talk over a direct connection; the gallery cannot join", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(trackConnections);
  await page.goto("/");
  await page.getByLabel("Your name at the table").fill("Alice");
  await page.getByRole("button", { name: "Create a table" }).click();
  await expect(page.locator(".invite-code")).toBeVisible();
  const url = page.url();
  const friendContext = await browser.newContext({
    permissions: ["microphone", "local-network-access"],
  });
  const friend = await friendContext.newPage();
  friend.on("pageerror", (e) => errors.push(e.message));
  await friend.addInitScript(trackConnections);
  await friend.goto(url);
  await friend.getByLabel("Your name at the table").fill("Bob");
  await friend.getByRole("button", { name: "Join", exact: true }).click();
  await expect(page.getByText("Bob", { exact: true })).toBeVisible();
  // Voice is opt-in, works in the lobby, and you arrive muted.
  await expect(page.locator(".voice-badge")).toHaveCount(0);
  await page.getByRole("button", { name: "Join voice chat" }).click();
  await expect(
    page.getByRole("button", { name: "Unmute microphone" }),
  ).toBeVisible();
  await expect(seatBadge(friend, "Alice")).toHaveClass(/muted/);
  await expect(
    friend.getByRole("button", { name: "Join voice chat" }),
  ).toContainText("1 in voice");
  await friend.getByRole("button", { name: "Join voice chat" }).click();
  await expect(seatBadge(page, "Bob")).toBeVisible();
  try {
    // The two browsers reach each other directly.
    await expect(seatBadge(page, "Bob")).toHaveClass(/connected/, {
      timeout: 45000,
    });
    await expect(seatBadge(friend, "Alice")).toHaveClass(/connected/, {
      timeout: 45000,
    });
  } catch (error) {
    for (const [name, participant] of [
      ["alice", page],
      ["bob", friend],
    ] as const) {
      await info.attach(`${name}-rtc-diagnostics`, {
        contentType: "application/json",
        body: JSON.stringify(
          await participant.evaluate(async () =>
            Promise.all(
              ((window as any).__pcs as RTCPeerConnection[]).map(
                async (pc) => ({
                  connection: pc.connectionState,
                  ice: pc.iceConnectionState,
                  gathering: pc.iceGatheringState,
                  signaling: pc.signalingState,
                  local: pc.localDescription,
                  remote: pc.remoteDescription,
                  stats: Array.from((await pc.getStats()).values()),
                }),
              ),
            ),
          ),
          null,
          2,
        ),
      });
    }
    throw error;
  }
  // Both are muted: packets flow, but they carry only silence.
  const muted = await bytesPerPacket(page);
  expect(muted).toBeGreaterThan(0);
  expect(muted).toBeLessThan(SILENCE);
  // Once Bob unmutes, Alice really receives his voice.
  await friend.getByRole("button", { name: "Unmute microphone" }).click();
  await expect(seatBadge(page, "Bob")).not.toHaveClass(/muted/);
  await expect
    .poll(() => bytesPerPacket(page), { timeout: 30000 })
    .toBeGreaterThan(SILENCE);
  // Alice is still muted, so Bob receives silence until she unmutes.
  expect(await bytesPerPacket(friend)).toBeLessThan(SILENCE);
  await page.getByRole("button", { name: "Unmute microphone" }).click();
  await expect
    .poll(() => bytesPerPacket(friend), { timeout: 30000 })
    .toBeGreaterThan(SILENCE);
  // The call carries on into the game, and muting silences the wire again.
  await page.getByRole("button", { name: "Start the game" }).click();
  await expect(friend.locator(".board")).toBeVisible();
  await expect(seatBadge(friend, "Alice")).toHaveClass(/connected/);
  await expect
    .poll(() => bytesPerPacket(page), { timeout: 30000 })
    .toBeGreaterThan(SILENCE);
  await friend.getByRole("button", { name: "Mute microphone" }).click();
  await expect(seatBadge(page, "Bob")).toHaveClass(/muted/);
  await expect
    .poll(() => bytesPerPacket(page), { timeout: 30000 })
    .toBeLessThan(SILENCE);
  // Spectators see who is in voice but get no controls.
  const watcherContext = await browser.newContext();
  const watcher = await watcherContext.newPage();
  await watcher.goto(url + "?watch=1");
  await watcher.getByLabel("Your name at the table").fill("Watcher");
  await watcher.getByRole("button", { name: "Watch this table" }).click();
  await expect(watcher.locator(".spectator-bar")).toBeVisible();
  await expect(watcher.locator(".voice-dock")).toHaveCount(0);
  await expect(watcher.locator(".voice-badge")).toHaveCount(2);
  // Hanging up removes the badge everywhere.
  await friend.getByRole("button", { name: "Leave voice chat" }).click();
  await expect(seatBadge(page, "Bob")).toHaveCount(0);
  await expect(
    friend.getByRole("button", { name: "Join voice chat" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  await watcherContext.close();
  await friendContext.close();
});

test("a late microphone permission cannot join voice after leaving the table", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints);
      (window as any).__lateStream = stream;
      await new Promise<void>((resolve) => {
        (window as any).__grantMic = resolve;
      });
      return stream;
    };
  });
  await page.goto("/");
  await page.getByLabel("Your name at the table").fill("Late mic");
  await page.getByRole("button", { name: "Create a table" }).click();
  await page.getByRole("button", { name: "Join voice chat" }).click();
  await expect
    .poll(() => page.evaluate(() => !!(window as any).__grantMic))
    .toBe(true);
  await page.getByRole("button", { name: "Leave table", exact: true }).click();
  await page.evaluate(() => (window as any).__grantMic());
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).__lateStream
          .getTracks()
          .every((t: MediaStreamTrack) => t.readyState === "ended"),
      ),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Create a table" }).click();
  await expect(
    page.getByRole("button", { name: "Join voice chat" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Unmute microphone" }),
  ).toHaveCount(0);
});
