export interface ActivityReportInput {
  round: number;
  status: string;
  playerCount: number;
  activePlayer?: string;
  log: { id: number; text: string }[];
}

export interface ActivityReportDevice {
  userAgent: string;
  viewport: string;
}

/** A short, shareable report. It deliberately excludes room codes and hidden hands. */
export function formatActivityReport(
  game: ActivityReportInput,
  device: ActivityReportDevice,
): string {
  const recent = game.log.slice(-30);
  return [
    "Mood Swings playtest report",
    "What happened: [describe the issue]",
    "What I expected: [describe the expected result]",
    "Phone model (if applicable): [add model]",
    `Browser / device: ${device.userAgent || "Unknown"}`,
    `Viewport: ${device.viewport}`,
    `Round: ${game.round} · Players: ${game.playerCount} · State: ${game.status}`,
    `Current turn: ${game.activePlayer || "None"}`,
    "",
    "Recent activity (oldest to newest; context only, not a full replay):",
    ...(recent.length
      ? recent.map((entry, index) => `${index + 1}. ${entry.text}`)
      : ["No activity recorded yet."]),
  ].join("\n");
}
