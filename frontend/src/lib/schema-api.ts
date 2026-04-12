// Manual Wails v3 binding stubs for the schema introspection methods added in
// app.go. These use pre-computed FNV-32a binding IDs that match those generated
// by the Wails binding generator when `wails3 dev` is run.
//
// Binding IDs (FNV-32a of "main.App.<MethodName>"):
//   GetSchema      → 2867622096
//   RefreshSchema  → 2678621399
//   GetDialectInfo → 1471150675
//
// Once `wails3 dev` regenerates frontend/bindings/, these functions can be
// replaced with imports from the generated app.ts.

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: Unused imports
import { Call as $Call, CancellablePromise as $CancellablePromise } from "@wailsio/runtime";
import type { SchemaResult, DialectInfo } from "@/types/schema";

/**
 * GetSchema returns the aggregated schema for profileID (cached 5 min on the
 * Go side). Used to populate the SQL completion engine with table/column info.
 */
export function GetSchema(profileID: string): $CancellablePromise<SchemaResult | null> {
  return $Call.ByID(2867622096, profileID) as $CancellablePromise<SchemaResult | null>;
}

/**
 * RefreshSchema bypasses the Go cache and re-introspects the database.
 * Call this after DDL that was applied outside of the app.
 */
export function RefreshSchema(profileID: string): $CancellablePromise<SchemaResult | null> {
  return $Call.ByID(2678621399, profileID) as $CancellablePromise<SchemaResult | null>;
}

/**
 * GetDialectInfo returns static dialect metadata (keywords, functions, types)
 * for the driver associated with profileID.
 */
export function GetDialectInfo(profileID: string): $CancellablePromise<DialectInfo | null> {
  return $Call.ByID(1471150675, profileID) as $CancellablePromise<DialectInfo | null>;
}
