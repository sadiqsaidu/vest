/**
 * Scope filtering — shared between the audit page and any future server
 * filter helpers. Pure functions over the data shapes returned by
 * `/api/cap-tables/[id]` and `/api/cap-tables/[id]/activity`.
 */

export type ScopeKind = "master" | "mint" | "yearly" | "monthly";

export type ScopeParams = {
  mint?: string;
  year?: number;
  month?: number; // 1–12
};

/** Inclusive [start, end) unix-second range that the scope covers. */
export function scopeWindow(
  scope: ScopeKind,
  params: ScopeParams,
): { startSec: number; endSec: number } | null {
  if (scope === "master" || scope === "mint") return null;
  if (scope === "yearly") {
    if (!params.year) return null;
    const start = Date.UTC(params.year, 0, 1) / 1000;
    const end = Date.UTC(params.year + 1, 0, 1) / 1000;
    return { startSec: start, endSec: end };
  }
  if (scope === "monthly") {
    if (!params.year || !params.month) return null;
    const m = params.month - 1;
    const start = Date.UTC(params.year, m, 1) / 1000;
    const end = Date.UTC(params.year, m + 1, 1) / 1000;
    return { startSec: start, endSec: end };
  }
  return null;
}

/**
 * Decide whether a given UTXO/schedule row falls within the scope.
 *
 * For yearly/monthly: any timestamp on the row (unlock, creation tx,
 * claim) falling inside the window is sufficient. Schedule rows whose
 * unlock_timestamp is outside the window AND have no in-scope events
 * are excluded.
 *
 * For mint: include only if the cap_table mint matches.
 *
 * For master: always include.
 */
export function rowInScope(
  scope: ScopeKind,
  params: ScopeParams,
  capTableMint: string,
  row: {
    unlock_timestamp: number;
    claimed_at?: string | null;
    utxo_creation_tx?: string | null;
  },
  capTableCreatedAtSec?: number,
): boolean {
  if (scope === "master") return true;
  if (scope === "mint") return params.mint === capTableMint;
  const win = scopeWindow(scope, params);
  if (!win) return false;
  if (
    row.unlock_timestamp >= win.startSec &&
    row.unlock_timestamp < win.endSec
  ) {
    return true;
  }
  if (row.claimed_at) {
    const t = Math.floor(new Date(row.claimed_at).getTime() / 1000);
    if (t >= win.startSec && t < win.endSec) return true;
  }
  if (row.utxo_creation_tx && capTableCreatedAtSec !== undefined) {
    if (
      capTableCreatedAtSec >= win.startSec &&
      capTableCreatedAtSec < win.endSec
    ) {
      return true;
    }
  }
  return false;
}

/** Filter an activity event by scope. */
export function eventInScope(
  scope: ScopeKind,
  params: ScopeParams,
  capTableMint: string,
  event: { at: string; data?: { mint?: string } | null },
): boolean {
  if (scope === "master") return true;
  if (scope === "mint") return params.mint === capTableMint;
  const win = scopeWindow(scope, params);
  if (!win) return false;
  const t = Math.floor(new Date(event.at).getTime() / 1000);
  return t >= win.startSec && t < win.endSec;
}
