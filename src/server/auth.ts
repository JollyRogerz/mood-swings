import {
  MemoryCollectionStore,
  PostgresCollectionStore,
  type CollectionStore,
} from "./collection";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { getMigrations } from "better-auth/db/migration";
import { fromNodeHeaders } from "better-auth/node";
import { anonymous } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import type { IncomingHttpHeaders } from "node:http";
import { Pool } from "pg";
import {
  MemoryResultStore,
  PostgresResultStore,
  type ResultStore,
} from "./results";
import { randomBytes } from "node:crypto";
import {
  MemoryAccountStore,
  PostgresAccountStore,
  type AccountStore,
} from "./accounts";
export const PROVIDERS = ["discord", "google"] as const;
export type Provider = (typeof PROVIDERS)[number];
type Env = Record<string, string | undefined>;
export function baseUrl(env: Env) {
  if (env.BETTER_AUTH_URL) return env.BETTER_AUTH_URL.replace(/\/+$/, "");
  if (env.RAILWAY_PUBLIC_DOMAIN) return `https://${env.RAILWAY_PUBLIC_DOMAIN}`;
  return `http://localhost:${env.PORT ?? 3000}`;
}
export function accountOrigins(env: Env): string[] {
  const url = new URL(baseUrl(env));
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  return local
    ? [
        ...new Set([
          url.origin,
          `http://localhost:${url.port || 80}`,
          `http://127.0.0.1:${url.port || 80}`,
          "http://127.0.0.1:5173",
          "http://localhost:5173",
        ]),
      ]
    : [url.origin];
}
// A provider is offered only when both halves of its credentials are present,
// so a half-configured deploy shows no dead button.
export function configuredProviders(env: Env): Provider[] {
  return PROVIDERS.filter(
    (p) =>
      env[`${p.toUpperCase()}_CLIENT_ID`] &&
      env[`${p.toUpperCase()}_CLIENT_SECRET`],
  );
}
export type AccountsMode = "off" | "memory" | "postgres";
export function accountsMode(env: Env): AccountsMode {
  if (env.MOOD_ACCOUNTS === "memory") return "memory";
  if (env.DATABASE_URL && env.BETTER_AUTH_SECRET) return "postgres";
  return "off";
}
export interface Accounts {
  origins: string[];
  auth: ReturnType<typeof build>;
  store: AccountStore;
  results: ResultStore;
  collection: CollectionStore;
  providers: Provider[];
  userId(headers: IncomingHttpHeaders): Promise<string | null>;
  // A passkey profile starts life as an anonymous user. Once it has a
  // username it is a real account: clearing the flag lets a social login be
  // linked to it later instead of replacing it.
  settle(userId: string): Promise<void>;
  destroy(userId: string): Promise<void>;
}
function build(env: Env, database: Pool | ReturnType<typeof memoryAdapter>) {
  const url = baseUrl(env),
    providers = configuredProviders(env);
  return betterAuth({
    baseURL: url,
    secret: env.BETTER_AUTH_SECRET ?? randomBytes(32).toString("hex"),
    database,
    trustedOrigins: accountOrigins(env),
    socialProviders: Object.fromEntries(
      providers.map((p) => [
        p,
        {
          clientId: env[`${p.toUpperCase()}_CLIENT_ID`]!,
          clientSecret: env[`${p.toUpperCase()}_CLIENT_SECRET`]!,
        },
      ]),
    ),
    account: { accountLinking: { enabled: true } },
    plugins: [
      anonymous(),
      passkey({
        rpID: new URL(url).hostname,
        rpName: "Mood Swings Online",
        origin: url,
      }),
    ],
    telemetry: { enabled: false },
  });
}
export async function createAccounts(
  env: Env = process.env,
): Promise<Accounts | undefined> {
  const mode = accountsMode(env);
  if (mode === "off") {
    if (env.DATABASE_URL)
      console.warn("Accounts are off: set BETTER_AUTH_SECRET to enable them.");
    return undefined;
  }
  let auth: ReturnType<typeof build>,
    store: AccountStore,
    results: ResultStore,
    collection: CollectionStore;
  if (mode === "memory") {
    auth = build(
      env,
      memoryAdapter({
        user: [],
        session: [],
        account: [],
        verification: [],
        passkey: [],
      }),
    );
    store = new MemoryAccountStore();
    results = new MemoryResultStore(store);
    collection = new MemoryCollectionStore();
  } else {
    const pool = new Pool({ connectionString: env.DATABASE_URL, max: 5 });
    auth = build(env, pool);
    const { runMigrations } = await getMigrations(auth.options);
    await runMigrations();
    store = new PostgresAccountStore(pool);
    results = new PostgresResultStore(pool);
    collection = new PostgresCollectionStore(pool);
  }
  await store.init();
  await results.init();
  await collection.init();
  return {
    origins: accountOrigins(env),
    auth,
    store,
    results,
    collection,
    providers: configuredProviders(env),
    async userId(headers) {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(headers),
      });
      return session?.user.id ?? null;
    },
    async settle(userId) {
      const ctx = await auth.$context;
      await ctx.internalAdapter.updateUser(userId, { isAnonymous: false });
    },
    async destroy(userId) {
      const ctx = await auth.$context;
      await results.anonymize(userId);
      await collection.erase(userId);
      await store.remove(userId);
      await ctx.adapter.deleteMany({
        model: "passkey",
        where: [{ field: "userId", value: userId }],
      });
      await ctx.internalAdapter.deleteUserSessions(userId);
      await ctx.internalAdapter.deleteAccounts(userId);
      await ctx.internalAdapter.deleteUser(userId);
    },
  };
}
