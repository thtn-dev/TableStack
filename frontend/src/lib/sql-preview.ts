import type { DirtyRow } from "@/types/mutation";

// =============================================================================
// SQL Preview Utilities
// Generates human-readable SQL scripts for UPDATE and DELETE operations.
// These are for display/preview only — the backend uses its own parameterised
// builders for the actual execution.
// =============================================================================

/**
 * Format a value as a SQL literal (no parameterisation — preview only).
 * Strings are single-quoted with internal quotes escaped.
 */
export function formatSQLValue(val: unknown): string {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "number") return String(val);
  if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
  // Escape single quotes in strings
  return `'${String(val).replace(/'/g, "''")}'`;
}

/** Quote an identifier with double-quotes (PostgreSQL / standard SQL). */
function qi(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

const SEPARATOR = "-- " + "-".repeat(60);

/**
 * Generate a preview UPDATE script for all dirty rows.
 * One UPDATE statement per row, separated by a comment divider.
 * Returns empty string when there are no changes.
 */
export function generateUpdatePreview(
  schema: string,
  table: string,
  dirtyRows: Map<string, DirtyRow>,
): string {
  if (dirtyRows.size === 0) return "";

  const tableRef = schema ? `${qi(schema)}.${qi(table)}` : qi(table);
  const stmts: string[] = [];
  let index = 1;

  for (const row of dirtyRows.values()) {
    const entries = Object.entries(row.changes);
    if (entries.length === 0) continue;

    const setClauses = entries
      .map(([col, { newValue }]) => `  ${qi(col)} = ${formatSQLValue(newValue)}`)
      .join(",\n");

    const whereClauses = Object.entries(row.primaryKeys)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([col, val]) => `${qi(col)} = ${formatSQLValue(val)}`)
      .join(" AND ");

    stmts.push(
      `${SEPARATOR}\n-- Row ${index++}\n${SEPARATOR}\nUPDATE ${tableRef}\nSET\n${setClauses}\nWHERE ${whereClauses};`,
    );
  }

  return stmts.join("\n\n");
}

/**
 * Generate a preview DELETE script for the given list of primary key maps.
 * One DELETE statement per row, separated by a comment divider.
 * Returns empty string when pkList is empty.
 */
export function generateDeletePreview(
  schema: string,
  table: string,
  pkList: Record<string, unknown>[],
): string {
  if (pkList.length === 0) return "";

  const tableRef = schema ? `${qi(schema)}.${qi(table)}` : qi(table);
  const pkCols = Object.keys(pkList[0]).sort();
  const stmts: string[] = [];

  pkList.forEach((pk, i) => {
    const whereClauses = pkCols
      .map((col) => `${qi(col)} = ${formatSQLValue(pk[col])}`)
      .join(" AND ");

    stmts.push(
      `${SEPARATOR}\n-- Row ${i + 1}\n${SEPARATOR}\nDELETE FROM ${tableRef}\nWHERE ${whereClauses};`,
    );
  });

  return stmts.join("\n\n");
}
