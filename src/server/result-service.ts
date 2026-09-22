import type { Accounts } from "./auth";
import type { Game } from "../game/types";
let accounts: Accounts | undefined;
export function configureResults(value: Accounts | undefined) {
  accounts = value;
}
export async function attributeMatch(game: Game) {
  game.matchAccounts = Object.fromEntries(
    await Promise.all(
      game.players.map(async (p) => [
        p.id,
        !p.bot && accounts ? await accounts.store.userFor(p.id) : null,
      ]),
    ),
  );
}
export async function recordResult(game: Game) {
  if (!game.result) return;
  if (!accounts) {
    if (game.result.players.some((p) => p.userId))
      throw new Error(
        "Profiles are unavailable; keep the saved result until recording can resume.",
      );
    return;
  }
  await accounts.results.record(game.result);
}
