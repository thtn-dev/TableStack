// =============================================================================
// Domain Types — mirrors generated bindings models but as plain aliases
// so components never depend on the generated class constructors directly.
// =============================================================================

// ---------------------------------------------------------------------------
// Convenience plain-object aliases
// ---------------------------------------------------------------------------

import type { Profile as StoreProfile } from "../../bindings/github.com/thtn-dev/table_stack/internal/store/models";
import type {
  ConnectResult as DBConnectResult,
  DatabaseInfo as DBDatabaseInfo,
  TableInfo as DBTableInfo,
  ColumnInfo as DBColumnInfo,
  IndexInfo as DBIndexInfo,
  QueryResult as DBQueryResult,
} from "../../bindings/github.com/thtn-dev/table_stack/internal/db/models";

/** A connection profile as stored on disk (password masked after load). */
export type Profile = StoreProfile;

/** Result of a one-shot test connection. */
export type ConnectResult = DBConnectResult;

/** A database in the server. */
export type DatabaseInfo = DBDatabaseInfo;

/** A table or view inside a schema. */
export type TableInfo = DBTableInfo;

/** A column descriptor. */
export type ColumnInfo = DBColumnInfo;

/** An index descriptor. */
export type IndexInfo = DBIndexInfo;

/** Result of a SQL query execution. */
export type QueryResult = DBQueryResult;

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
  databases: string[]; // ListDatabases result flattened to names
  schemas: string[]; // ListSchemas result
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

export function asyncError<T>(
  error: string,
  previous?: T | null,
): AsyncState<T> {
  return { status: "error", data: previous ?? null, error };
}
