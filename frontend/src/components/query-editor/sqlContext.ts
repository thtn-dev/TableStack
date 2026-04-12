// SQL context analyser — determines what kind of completion should be offered
// based on the text before the cursor within the current SQL statement.
//
// Strategy: regex-based scan from cursor position backwards. Lezer syntax tree
// integration is a possible enhancement but regex covers the common cases well
// enough, especially for incomplete / partially-typed SQL.

/** Describes what is expected at the current cursor position. */
export type SqlPosition =
  | "after-from"     // SELECT * FROM | , JOIN | ON ...
  | "after-join"     // ... LEFT JOIN |
  | "after-select"   // SELECT |, SELECT a, |
  | "after-where"    // WHERE |, AND |, OR |
  | "after-set"      // UPDATE tbl SET |
  | "after-orderby"  // ORDER BY |, GROUP BY |
  | "after-having"   // HAVING |
  | "dot-notation"   // tablename.|  or alias.|
  | "unknown";

/** A table reference extracted from the current statement. */
export interface TableAlias {
  /** The alias or bare table name used in the query. */
  alias: string;
  /** Schema name if explicitly qualified (e.g. public.users). */
  schema: string | null;
  /** The actual table name. */
  table: string;
}

/** Result of analysing the SQL around the cursor. */
export interface SqlContext {
  position: SqlPosition;
  /** Tables and aliases extracted from the current statement's FROM/JOIN. */
  aliases: TableAlias[];
  /** The token immediately before the cursor (for prefix filtering). */
  currentToken: string;
  /** Dot-notation prefix: the word before the trailing dot (if any). */
  dotPrefix: string | null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * parseSqlContext analyses `docText` up to `cursorPos` and returns a
 * SqlContext describing what the completion engine should offer.
 */
export function parseSqlContext(docText: string, cursorPos: number): SqlContext {
  const stmt = extractCurrentStatement(docText, cursorPos);
  const localPos = cursorPos - (docText.length - stmt.length);
  const textBefore = stmt.slice(0, Math.max(0, localPos));

  const dotPrefix = getDotPrefix(textBefore);
  if (dotPrefix !== null) {
    return {
      position: "dot-notation",
      aliases: extractTablesAndAliases(stmt),
      currentToken: "",
      dotPrefix,
    };
  }

  const currentToken = getCurrentToken(textBefore);
  const beforeToken = textBefore.slice(0, textBefore.length - currentToken.length).trimEnd();
  const position = detectPosition(beforeToken);

  return {
    position,
    aliases: extractTablesAndAliases(stmt),
    currentToken,
    dotPrefix: null,
  };
}

/**
 * extractTablesAndAliases scans a single SQL statement and returns all
 * table references (from FROM, JOIN, UPDATE, INSERT INTO clauses).
 */
export function extractTablesAndAliases(stmt: string): TableAlias[] {
  const result: TableAlias[] = [];
  const upper = stmt.toUpperCase();

  // Patterns: FROM tbl [AS] alias, JOIN tbl [AS] alias, UPDATE tbl [AS] alias
  // Handles: schema.table, quoted "schema"."table", plain names
  const tablePattern =
    /(?:FROM|JOIN|UPDATE)\s+((?:"[^"]+"|[\w]+)(?:\.(?:"[^"]+"|[\w]+))?)(?:\s+(?:AS\s+)?((?:"[^"]+"|[\w]+)))?/gi;

  let match: RegExpExecArray | null;
  while ((match = tablePattern.exec(stmt)) !== null) {
    const fullRef = match[1].replace(/"/g, "");
    const parts = fullRef.split(".");
    const table = parts.length > 1 ? parts[1] : parts[0];
    const schema = parts.length > 1 ? parts[0] : null;
    const rawAlias = match[2] ? match[2].replace(/"/g, "") : null;

    // Skip SQL keywords that look like table names
    if (isSqlKeyword(rawAlias ?? table)) continue;

    const alias = rawAlias ?? table;
    result.push({ alias, schema, table });
  }

  // INSERT INTO tbl (…)
  const insertPattern = /INSERT\s+INTO\s+((?:"[^"]+"|[\w]+)(?:\.(?:"[^"]+"|[\w]+))?)/gi;
  while ((match = insertPattern.exec(stmt)) !== null) {
    const fullRef = match[1].replace(/"/g, "");
    const parts = fullRef.split(".");
    const table = parts.length > 1 ? parts[1] : parts[0];
    const schema = parts.length > 1 ? parts[0] : null;
    if (!isSqlKeyword(table)) {
      result.push({ alias: table, schema, table });
    }
  }

  void upper; // suppress unused warning
  return dedupeAliases(result);
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/** Return the statement that contains cursorPos, splitting on unquoted `;`. */
function extractCurrentStatement(sql: string, cursorPos: number): string {
  let inSingle = false;
  let inDouble = false;
  let stmtStart = 0;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === ";" && !inSingle && !inDouble) {
      if (i >= cursorPos) break; // cursor is in this statement
      stmtStart = i + 1;
    }
  }

  return sql.slice(stmtStart);
}

/** Return the word-token immediately before the cursor (may be empty). */
function getCurrentToken(textBefore: string): string {
  const m = textBefore.match(/[\w$]+$/);
  return m ? m[0] : "";
}

/** If the text ends with `word.` return `word`, otherwise null. */
function getDotPrefix(textBefore: string): string | null {
  const m = textBefore.match(/([\w$]+)\.\s*$/);
  return m ? m[1] : null;
}

/** Determine the SQL position keyword preceding the current cursor token. */
function detectPosition(beforeToken: string): SqlPosition {
  const upper = beforeToken.toUpperCase().trimEnd();

  if (/\b(?:FROM|JOIN|LEFT\s+JOIN|RIGHT\s+JOIN|INNER\s+JOIN|FULL\s+(?:OUTER\s+)?JOIN|CROSS\s+JOIN|NATURAL\s+JOIN)\s*$/.test(upper)) {
    return "after-from";
  }
  if (/\bJOIN\s*$/.test(upper)) return "after-join";
  if (/\b(?:WHERE|AND|OR|NOT|ON)\s*$/.test(upper)) return "after-where";
  if (/\bSELECT(?:\s+DISTINCT)?\s*$/.test(upper) || /,\s*$/.test(upper)) return "after-select";
  if (/\bSET\s*$/.test(upper)) return "after-set";
  if (/\b(?:ORDER\s+BY|GROUP\s+BY)\s*$/.test(upper)) return "after-orderby";
  if (/\bHAVING\s*$/.test(upper)) return "after-having";

  return "unknown";
}

const SQL_KEYWORD_SET = new Set([
  "SELECT", "FROM", "WHERE", "JOIN", "ON", "AS", "AND", "OR", "NOT",
  "IN", "BETWEEN", "LIKE", "IS", "NULL", "INNER", "LEFT", "RIGHT",
  "FULL", "OUTER", "CROSS", "NATURAL", "GROUP", "ORDER", "BY",
  "HAVING", "LIMIT", "OFFSET", "UNION", "INTERSECT", "EXCEPT",
  "INSERT", "INTO", "VALUES", "UPDATE", "SET", "DELETE", "CREATE",
  "ALTER", "DROP", "TABLE", "VIEW", "INDEX", "WITH", "RECURSIVE",
]);

function isSqlKeyword(word: string): boolean {
  return SQL_KEYWORD_SET.has(word.toUpperCase());
}

function dedupeAliases(aliases: TableAlias[]): TableAlias[] {
  const seen = new Set<string>();
  return aliases.filter((a) => {
    if (seen.has(a.alias)) return false;
    seen.add(a.alias);
    return true;
  });
}
