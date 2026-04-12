// SQL completion source for CodeMirror 6.
// Provides table, column (dot-notation), function, and keyword completions
// driven by SchemaResult + DialectInfo fetched from the Go backend.

import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
} from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";
import type { SchemaResult, DialectInfo, TableSchema } from "@/types/schema";
import { parseSqlContext } from "./sqlContext";

// ---------------------------------------------------------------------------
// Base SQL keywords — always available regardless of schema/dialect.
// ---------------------------------------------------------------------------
const BASE_KEYWORDS: string[] = [
  "SELECT", "FROM", "WHERE", "AND", "OR", "NOT", "IN", "NOT IN",
  "LIKE", "BETWEEN", "IS NULL", "IS NOT NULL",
  "INSERT INTO", "VALUES", "UPDATE", "SET", "DELETE FROM",
  "CREATE TABLE", "ALTER TABLE", "DROP TABLE", "TRUNCATE TABLE",
  "CREATE INDEX", "DROP INDEX", "CREATE VIEW", "DROP VIEW",
  "JOIN", "LEFT JOIN", "RIGHT JOIN", "INNER JOIN", "FULL JOIN", "CROSS JOIN",
  "GROUP BY", "ORDER BY", "HAVING", "LIMIT", "OFFSET",
  "UNION", "UNION ALL", "INTERSECT", "EXCEPT",
  "DISTINCT", "ALL", "AS",
  "BEGIN", "COMMIT", "ROLLBACK",
  "CASE", "WHEN", "THEN", "ELSE", "END",
  "CAST", "COALESCE", "NULLIF",
  "COUNT", "SUM", "AVG", "MIN", "MAX",
  "ASC", "DESC", "NULLS FIRST", "NULLS LAST",
  "PRIMARY KEY", "FOREIGN KEY", "UNIQUE", "NOT NULL", "DEFAULT", "CHECK",
  "CONSTRAINT", "REFERENCES",
  "IF EXISTS", "IF NOT EXISTS",
  "EXPLAIN",
];

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a CodeMirror CompletionSource that suggests:
 *  1. Columns for dot-notation (tablename.cursor) — highest priority
 *  2. Context-filtered tables/columns based on SQL position
 *  3. Built-in functions from dialect info
 *  4. SQL keywords (base + dialect-specific)
 *
 * If schema is null only keywords are returned (no crash).
 */
export function createSqlCompletion(
  schema: SchemaResult | null,
  dialect: DialectInfo | null,
): CompletionSource {
  const tableMap = buildTableMap(schema);
  const keywordCompletions = buildKeywordCompletions(dialect);
  const functionCompletions = buildFunctionCompletions(dialect);

  return (ctx: CompletionContext): CompletionResult | null => {
    // Match word characters, dots, and schema.table patterns
    const word = ctx.matchBefore(/[\w$.]+/);
    if (!word && !ctx.explicit) return null;

    const from = word?.from ?? ctx.pos;
    const docText = ctx.state.doc.toString();
    const sqlCtx = parseSqlContext(docText, ctx.pos);

    // ── Dot-notation: tablename.cursor ──────────────────────────────────────
    if (sqlCtx.position === "dot-notation" && sqlCtx.dotPrefix) {
      const cols = resolveColumns(sqlCtx.dotPrefix, sqlCtx.aliases, tableMap);
      if (cols.length > 0) {
        return {
          from: word ? word.from + word.text.indexOf(".") + 1 : ctx.pos,
          options: cols,
          validFor: /^\w*$/,
        };
      }
    }

    const options: Completion[] = [];

    // ── Context-aware completions ────────────────────────────────────────────
    switch (sqlCtx.position) {
      case "after-from":
      case "after-join":
        options.push(...buildTableCompletions(tableMap, 10));
        break;

      case "after-select":
      case "after-where":
      case "after-set":
      case "after-orderby":
      case "after-having": {
        const inScopeColumns = buildInScopeColumnCompletions(
          sqlCtx.aliases,
          tableMap,
          10,
        );
        options.push(...inScopeColumns);
        if (inScopeColumns.length === 0) {
          options.push(...buildTableCompletions(tableMap, 5));
        }
        options.push(...functionCompletions);
        options.push(...keywordCompletions);
        break;
      }

      default:
        options.push(...buildTableCompletions(tableMap, 0));
        options.push(...functionCompletions);
        options.push(...keywordCompletions);
    }

    if (options.length === 0 && !ctx.explicit) return null;

    return {
      from,
      options: filterByPrefix(options, sqlCtx.currentToken),
      validFor: /^[\w$.]*$/,
    };
  };
}

/**
 * Returns a CodeMirror `autocompletion()` extension configured with the
 * schema-aware completion source.
 */
export function buildCompletionExtension(
  schema: SchemaResult | null,
  dialect: DialectInfo | null,
): Extension {
  return autocompletion({
    override: [createSqlCompletion(schema, dialect)],
    activateOnTyping: true,
    maxRenderedOptions: 100,
  });
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

type TableMap = Map<string, TableSchema>;

function buildTableMap(schema: SchemaResult | null): TableMap {
  const m: TableMap = new Map();
  if (!schema) return m;
  const multiSchema = schema.schemas.length > 1;
  for (const ds of schema.schemas) {
    for (const tbl of ds.tables) {
      // Bare name always available
      m.set(tbl.name.toLowerCase(), tbl);
      // Qualified name when >1 schema
      if (multiSchema) {
        m.set(`${ds.name}.${tbl.name}`.toLowerCase(), tbl);
      }
    }
  }
  return m;
}

function buildTableCompletions(tableMap: TableMap, boost: number): Completion[] {
  const seen = new Set<string>();
  const options: Completion[] = [];
  for (const [label, tbl] of tableMap) {
    if (seen.has(label)) continue;
    seen.add(label);
    if (options.length >= 500) break; // guard against enormous schemas
    options.push({
      label,
      type: tbl.type === "VIEW" ? "type" : "class",
      detail: tbl.type === "VIEW" ? "view" : "table",
      boost,
    });
  }
  return options;
}

function buildInScopeColumnCompletions(
  aliases: import("./sqlContext").TableAlias[],
  tableMap: TableMap,
  boost: number,
): Completion[] {
  if (aliases.length === 0) return [];
  const options: Completion[] = [];
  for (const alias of aliases) {
    const tbl =
      tableMap.get(alias.table.toLowerCase()) ??
      (alias.schema
        ? tableMap.get(`${alias.schema}.${alias.table}`.toLowerCase())
        : undefined);
    if (!tbl) continue;
    for (const col of tbl.columns) {
      options.push({
        label: col.name,
        type: "variable",
        detail: col.dataType + (col.isPrimaryKey ? " (PK)" : ""),
        boost,
      });
    }
  }
  return options;
}

function resolveColumns(
  dotPrefix: string,
  aliases: import("./sqlContext").TableAlias[],
  tableMap: TableMap,
): Completion[] {
  const lower = dotPrefix.toLowerCase();
  // Try alias resolution first
  const found = aliases.find((a) => a.alias.toLowerCase() === lower);
  const tableName = found ? found.table : lower;
  const schemaName = found?.schema ?? null;

  const tbl =
    tableMap.get(tableName.toLowerCase()) ??
    (schemaName
      ? tableMap.get(`${schemaName}.${tableName}`.toLowerCase())
      : undefined) ??
    tableMap.get(lower);

  if (!tbl) return [];
  return tbl.columns.map((col) => ({
    label: col.name,
    type: "variable",
    detail: col.dataType + (col.isPrimaryKey ? " (PK)" : ""),
    boost: 100,
  }));
}

function buildKeywordCompletions(dialect: DialectInfo | null): Completion[] {
  const combined = new Set([
    ...BASE_KEYWORDS,
    ...(dialect?.keywords ?? []),
  ]);
  return Array.from(combined).map((kw) => ({
    label: kw,
    type: "keyword",
    boost: -10,
  }));
}

function buildFunctionCompletions(dialect: DialectInfo | null): Completion[] {
  if (!dialect) return [];
  return dialect.functions.map((fn) => ({
    label: fn.name,
    type: "function",
    detail: fn.signature,
    info: fn.description,
    boost: 5,
  }));
}

function filterByPrefix(options: Completion[], prefix: string): Completion[] {
  if (!prefix) return options;
  const upper = prefix.toUpperCase();
  return options.filter((o) => o.label.toUpperCase().startsWith(upper));
}
