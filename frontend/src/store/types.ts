// =============================================================================
// Domain Types — mirrors wailsjs/go/models.ts but as plain interfaces
// so components never depend on the generated class constructors directly.
// =============================================================================

// Re-exported from wailsjs for convenience — use these everywhere in the app.
export type { store, db } from "../../wailsjs/go/models";

// ---------------------------------------------------------------------------
// Convenience plain-object aliases (avoids `new store.Profile()` noise)
// ---------------------------------------------------------------------------

import type { store, db } from "../../wailsjs/go/models";

/** A connection profile as stored on disk (password masked after load). */
export type Profile = store.Profile;

/** Result of a one-shot test connection. */
export type ConnectResult = db.ConnectResult;

/** A database in the server. */
export type DatabaseInfo = db.DatabaseInfo;

/** A table or view inside a schema. */
export type TableInfo = db.TableInfo;

/** A column descriptor. */
export type ColumnInfo = db.ColumnInfo;

/** An index descriptor. */
export type IndexInfo = db.IndexInfo;

/** Result of a SQL query execution. */
export type QueryResult = db.QueryResult;

// ---------------------------------------------------------------------------
// UI-level compound types
// ---------------------------------------------------------------------------

/** Uniquely identifies a table: profileId + schema + tableName */
export interface TableRef {
  profileId: string;
  schema: string;
  table: string;
}

/** Cache key for column / index lookups. */
export type TableCacheKey = `${string}::${string}::${string}`;

export function toTableCacheKey(ref: TableRef): TableCacheKey {
  return `${ref.profileId}::${ref.schema}::${ref.table}`;
}

/** Per-connection schema tree state. */
export interface SchemaNode {
  profileId: string;
  databases: string[];        // ListDatabases result flattened to names
  schemas: string[];          // ListSchemas result
  /** schema → tables */
  tablesBySchema: Record<string, TableInfo[]>;
}

/** Loading / async operation states. */
export type AsyncStatus = "idle" | "loading" | "success" | "error";

export interface AsyncState<T> {
  status: AsyncStatus;
  data: T | null;
  error: string | null;
}

export function asyncIdle<T>(): AsyncState<T> {
  return { status: "idle", data: null, error: null };
}

export function asyncLoading<T>(previous?: T | null): AsyncState<T> {
  return { status: "loading", data: previous ?? null, error: null };
}

export function asyncSuccess<T>(data: T): AsyncState<T> {
  return { status: "success", data, error: null };
}

export function asyncError<T>(error: string, previous?: T | null): AsyncState<T> {
  return { status: "error", data: previous ?? null, error };
}
