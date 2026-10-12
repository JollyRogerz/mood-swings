import { describe, expect, it } from "vitest";
import { formatActivityReport } from "../src/client/bug-report";

describe("shareable activity report", () => {
  it("includes device context and the latest 30 events in play order", () => {
    const report = formatActivityReport(
      {
        round: 3,
        status: "playing",
        playerCount: 4,
        activePlayer: "Ember",
        log: Array.from({ length: 35 }, (_, i) => ({
          id: i + 1,
          text: `Event ${i + 1}`,
        })),
      },
      { userAgent: "Test browser", viewport: "390 × 844" },
    );
    expect(report).toContain("Browser / device: Test browser");
    expect(report).toContain("Viewport: 390 × 844");
    expect(report).toContain("Round: 3 · Players: 4 · State: playing");
    expect(report).toContain("Current turn: Ember");
    expect(report).not.toContain("Event 5");
    expect(report).toContain("1. Event 6");
    expect(report).toContain("30. Event 35");
    expect(report.indexOf("Event 6")).toBeLessThan(report.indexOf("Event 35"));
  });
});
