// Username rules, shared by the server (which enforces them) and the client
// (which explains them before the request is made).
export const USERNAME_RULE = "3 to 20 letters, numbers, _ or -";
export function cleanUsername(raw: unknown): string {
  if (typeof raw !== "string") throw new Error("Choose a username.");
  const value = raw.trim();
  if (!/^[A-Za-z0-9_-]{3,20}$/.test(value))
    throw new Error(`Usernames are ${USERNAME_RULE}.`);
  return value;
}
export const usernameKey = (name: string) => name.toLowerCase();
