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
  if (game.result && accounts) await accounts.results.record(game.result);
}
