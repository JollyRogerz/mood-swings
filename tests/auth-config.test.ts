import { expect, it } from "vitest";
import { accountOrigins } from "../src/server/auth";
it("limits hosted profile writes to the configured site", () => {
  expect(accountOrigins({ RAILWAY_PUBLIC_DOMAIN: "game.example" })).toEqual([
    "https://game.example",
  ]);
  expect(
    accountOrigins({ BETTER_AUTH_URL: "https://custom.example/" }),
  ).toEqual(["https://custom.example"]);
});
it("allows local frontend development only for a local server", () => {
  expect(accountOrigins({ PORT: "3008" })).toEqual(
    expect.arrayContaining([
      "http://localhost:3008",
      "http://127.0.0.1:3008",
      "http://localhost:5173",
    ]),
  );
});
