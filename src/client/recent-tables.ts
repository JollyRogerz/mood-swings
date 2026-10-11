const KEY = "mood-recent-tables-v1";
const MAX_TABLES = 6;
const CODE = /^[A-Z2-9]{8}$/;

type RecentStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

// Room codes are the only saved data. Never cache table names, visibility,
// players, or membership; those can change after a visitor leaves.
export function readRecentTables(storage: RecentStorage): string[] {
  try {
    const value: unknown = JSON.parse(storage.getItem(KEY) ?? "[]");
    if (!Array.isArray(value)) return [];
    return [
      ...new Set(
        value
          .slice(0, 30)
          .filter(
            (item): item is string =>
              typeof item === "string" && CODE.test(item),
          ),
      ),
    ].slice(0, MAX_TABLES);
  } catch {
    return [];
  }
}

export function rememberTable(storage: RecentStorage, code: string): string[] {
  const recent = readRecentTables(storage);
  if (!CODE.test(code)) return recent;
  const next = [code, ...recent.filter((item) => item !== code)].slice(
    0,
    MAX_TABLES,
  );
  try {
    storage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Playing does not depend on local storage having room for the list.
  }
  return next;
}

export function forgetTable(storage: RecentStorage, code: string): string[] {
  const next = readRecentTables(storage).filter((item) => item !== code);
  try {
    if (next.length) storage.setItem(KEY, JSON.stringify(next));
    else storage.removeItem(KEY);
  } catch {
    // The visible list can still be cleared for this page.
  }
  return next;
}

export function clearRecentTables(storage: RecentStorage): void {
  try {
    storage.removeItem(KEY);
  } catch {
    // A blocked storage API must not interfere with the rest of the page.
  }
}
