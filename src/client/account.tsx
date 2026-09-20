import React, { useCallback, useEffect, useState } from "react";
import { createAuthClient } from "better-auth/client";
import { anonymousClient } from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";
import { Fingerprint, LogOut, UserRound, X } from "lucide-react";
import { USERNAME_RULE, cleanUsername } from "../game/account";
import { useOverlayScrollLock } from "./portable";
import "./account.css";
// Always same-origin: the Vite dev server proxies /api, and a session cookie
// set by another origin would never come back.
const auth = createAuthClient({
  baseURL: location.origin,
  plugins: [anonymousClient(), passkeyClient()],
});
type Provider = "discord" | "google";
const PROVIDER_NAMES: Record<Provider, string> = {
  discord: "Discord",
  google: "Google",
};
export interface Account {
  accounts: boolean;
  providers: Provider[];
  linked: boolean;
  user: null | { id: string; username: string | null; devices: number };
}
const GUEST: Account = {
  accounts: false,
  providers: [],
  linked: false,
  user: null,
};
async function call(
  url: string,
  token: string,
  method = "GET",
  body?: unknown,
) {
  const r = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: {
      "x-mood-session": token,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.error ?? "Something went wrong.");
  return json;
}
const message = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong.";
// Better Auth reports failures as a value, not by throwing.
function check<T extends { error?: { message?: string } | null } | undefined>(
  result: T,
  fallback: string,
) {
  if (result?.error) throw new Error(result.error.message || fallback);
  return result;
}
export function useAccount(token: string) {
  const [account, setAccount] = useState<Account>(GUEST);
  const refresh = useCallback(async () => {
    try {
      let next: Account = await call("/api/account", token);
      // Signing in anywhere makes this device part of the account, so its
      // games are counted without another step.
      if (next.user?.username && !next.linked) {
        await call("/api/account/link", token, "POST", { token });
        next = await call("/api/account", token);
      }
      setAccount(next);
      return next;
    } catch {
      setAccount(GUEST);
      return GUEST;
    }
  }, [token]);
  useEffect(() => void refresh(), [refresh]);
  return { account, refresh };
}
export function AccountButton({
  token,
  account,
  refresh,
}: {
  token: string;
  account: Account;
  refresh: () => Promise<Account>;
}) {
  const needsName = !!account.user && !account.user.username;
  const [open, setOpen] = useState(false);
  // Coming back from Discord or Google lands here signed in but unnamed.
  useEffect(() => {
    if (needsName) setOpen(true);
  }, [needsName]);
  useOverlayScrollLock(open);
  if (!account.accounts) return null;
  const label = account.user?.username ?? "Save profile";
  return (
    <>
      <button
        className="account-button"
        aria-label={account.user?.username ? "Your profile" : "Save profile"}
        onClick={() => setOpen(true)}
      >
        <UserRound size={16} />
        <span>{label}</span>
      </button>
      {open && (
        <div className="modal-backdrop preferences-backdrop">
          <div
            className="preferences-panel account-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Your profile"
          >
            <button
              className="close-modal"
              data-dialog-close
              aria-label="Close profile"
              onClick={() => setOpen(false)}
            >
              <X />
            </button>
            <AccountBody
              token={token}
              account={account}
              refresh={refresh}
              close={() => setOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}
function AccountBody({
  token,
  account,
  refresh,
  close,
}: {
  token: string;
  account: Account;
  refresh: () => Promise<Account>;
  close: () => void;
}) {
  const [username, setUsername] = useState(
    localStorage.getItem("mood-name")?.replace(/[^A-Za-z0-9_-]/g, "") ?? "",
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirming, setConfirming] = useState(false);
  const run = (work: () => Promise<unknown>) => async () => {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  const saveName = () =>
    call("/api/account/username", token, "POST", {
      username: cleanUsername(username),
    });
  const social = (provider: Provider) =>
    run(async () => {
      check(
        await auth.signIn.social({ provider, callbackURL: location.href }),
        `Could not reach ${PROVIDER_NAMES[provider]}.`,
      );
    });
  // Signed in through Discord or Google, or a passkey profile that lost its
  // name half way: all that is missing is the username.
  if (account.user && !account.user.username)
    return (
      <>
        <span className="eyebrow">ONE LAST THING</span>
        <h2>Pick a username.</h2>
        <UsernameField value={username} onChange={setUsername} />
        <Problem text={error} />
        <button
          className="primary"
          disabled={busy}
          onClick={run(async () => {
            await saveName();
            await refresh();
          })}
        >
          Save username
        </button>
        <button
          className="text-button"
          disabled={busy}
          onClick={run(async () => {
            await auth.signOut();
            await refresh();
          })}
        >
          Not now, sign me out
        </button>
      </>
    );
  if (account.user)
    return (
      <>
        <span className="eyebrow">YOUR PROFILE</span>
        <h2>{account.user.username}</h2>
        <p className="account-note">
          Signed in on {account.user.devices}{" "}
          {account.user.devices === 1 ? "device" : "devices"}. Games you finish
          here are saved to this profile.
        </p>
        <Problem text={error} />
        <button
          className="account-choice"
          disabled={busy}
          onClick={run(async () => {
            check(
              await auth.passkey.addPasskey({
                name: `${account.user!.username} on this device`,
              }),
              "The passkey was not saved.",
            );
          })}
        >
          <Fingerprint size={18} /> Add a passkey on this device
        </button>
        {account.providers.map((p) => (
          <button
            key={p}
            className="account-choice"
            disabled={busy}
            onClick={run(async () => {
              check(
                await auth.linkSocial({
                  provider: p,
                  callbackURL: location.href,
                }),
                `Could not reach ${PROVIDER_NAMES[p]}.`,
              );
            })}
          >
            Connect {PROVIDER_NAMES[p]}
          </button>
        ))}
        <button
          className="account-choice"
          disabled={busy}
          onClick={run(async () => {
            await auth.signOut();
            await refresh();
            close();
          })}
        >
          <LogOut size={18} /> Sign out
        </button>
        {confirming ? (
          <div className="account-danger" role="alert">
            <p>
              This removes your username, your linked devices and your sign-in
              methods. It cannot be undone.
            </p>
            <button
              className="primary"
              disabled={busy}
              onClick={run(async () => {
                await call("/api/account", token, "DELETE");
                await refresh();
                close();
              })}
            >
              Yes, delete my profile
            </button>
            <button
              className="text-button"
              onClick={() => setConfirming(false)}
            >
              Keep it
            </button>
          </div>
        ) : (
          <button className="text-button" onClick={() => setConfirming(true)}>
            Delete my profile
          </button>
        )}
      </>
    );
  return (
    <>
      <span className="eyebrow">KEEP YOUR SEAT AT EVERY TABLE</span>
      <h2>Save your profile.</h2>
      <p className="account-note">
        No email and no password. Your device confirms it’s you with Face ID, a
        fingerprint or its PIN.
      </p>
      <UsernameField value={username} onChange={setUsername} />
      <Problem text={error} />
      <button
        className="primary"
        disabled={busy}
        onClick={run(async () => {
          cleanUsername(username);
          check(await auth.signIn.anonymous(), "Could not start a profile.");
          try {
            check(
              await auth.passkey.addPasskey({ name: username.trim() }),
              "The passkey was not saved.",
            );
            await saveName();
          } catch (e) {
            // Never leave a nameless, keyless account behind.
            await auth.deleteAnonymousUser().catch(() => auth.signOut());
            throw e;
          }
          await refresh();
        })}
      >
        <Fingerprint size={18} /> Save with a passkey
      </button>
      {account.providers.map((p) => (
        <button
          key={p}
          className="account-choice"
          disabled={busy}
          onClick={social(p)}
        >
          Continue with {PROVIDER_NAMES[p]}
        </button>
      ))}
      <div className="account-divider">ALREADY HAVE ONE?</div>
      <button
        className="account-choice"
        disabled={busy}
        onClick={run(async () => {
          check(await auth.signIn.passkey(), "That passkey was not accepted.");
          await refresh();
        })}
      >
        Sign in with a passkey
      </button>
    </>
  );
}
function UsernameField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="account-field">
      Username
      <input
        aria-label="Username"
        value={value}
        maxLength={20}
        autoComplete="username webauthn"
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
      />
      <small>{USERNAME_RULE}</small>
    </label>
  );
}
function Problem({ text }: { text: string }) {
  return text ? (
    <p className="account-error" role="alert">
      {text}
    </p>
  ) : null;
}
