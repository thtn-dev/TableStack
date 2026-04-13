package mutation

import (
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"
)

// identifierRe limits column/table/schema names to safe characters only.
var identifierRe = regexp.MustCompile(`^[a-zA-Z0-9_]+$`)

// validateIdentifier returns an error if name contains unsafe characters.
func validateIdentifier(name string) error {
	if name == "" {
		return errors.New("identifier must not be empty")
	}
	if !identifierRe.MatchString(name) {
		return fmt.Errorf("invalid identifier %q: only [a-zA-Z0-9_] allowed", name)
	}
	return nil
}

// sortedKeys returns the keys of a map sorted alphabetically for deterministic output.
func sortedKeys(m map[string]any) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

// SQLBuilder generates parameterized SQL for UPDATE, DELETE, and SELECT.
// Each database dialect has its own implementation.
type SQLBuilder interface {
	// BuildUpdate returns a parameterized UPDATE statement and argument slice.
	BuildUpdate(req UpdateRowRequest) (query string, args []any, err error)

	// BuildDelete returns a parameterized DELETE statement and argument slice.
	BuildDelete(req DeleteRowsRequest) (query string, args []any, err error)

	// BuildSelect returns a parameterized SELECT * statement for a single row lookup.
	BuildSelect(schema, table string, primaryKeys map[string]any) (query string, args []any, err error)
}

// builderForDialect returns the correct SQLBuilder for the given driver name.
func builderForDialect(dialect string) (SQLBuilder, error) {
	switch dialect {
	case "postgres", "":
		return &PostgresSQLBuilder{}, nil
	case "mysql":
		return &MySQLSQLBuilder{}, nil
	default:
		return nil, fmt.Errorf("unsupported dialect %q", dialect)
	}
}

// =============================================================================
// PostgreSQL — placeholders: $1,$2,…  quotes: "double"
// =============================================================================

// PostgresSQLBuilder generates PostgreSQL-compatible parameterized SQL.
type PostgresSQLBuilder struct{}

func (b *PostgresSQLBuilder) quoteIdent(s string) string { return `"` + s + `"` }

func (b *PostgresSQLBuilder) tableRef(schema, table string) string {
	if schema == "" {
		schema = "public"
	}
	return b.quoteIdent(schema) + "." + b.quoteIdent(table)
}

func (b *PostgresSQLBuilder) placeholder(n int) string { return fmt.Sprintf("$%d", n) }

// BuildUpdate builds:
//
//	UPDATE "schema"."table" SET "col1"=$1, "col2"=$2 WHERE "pk"=$3 [AND "col1"=$4 ...]
//
// Primary keys are required. Changes must be non-empty.
// If a CellChange.OldValue is non-nil it is appended to the WHERE clause for
// optimistic concurrency control.
func (b *PostgresSQLBuilder) BuildUpdate(req UpdateRowRequest) (string, []any, error) {
	if len(req.Changes) == 0 {
		return "", nil, errors.New("changes must not be empty")
	}
	if len(req.PrimaryKeys) == 0 {
		return "", nil, errors.New("primaryKeys must not be empty: UPDATE without WHERE is not allowed")
	}
	if err := validateIdentifier(req.Table); err != nil {
		return "", nil, fmt.Errorf("table: %w", err)
	}
	if req.Schema != "" {
		if err := validateIdentifier(req.Schema); err != nil {
			return "", nil, fmt.Errorf("schema: %w", err)
		}
	}

	args := make([]any, 0)
	idx := 1

	// SET clause
	setParts := make([]string, 0, len(req.Changes))
	for _, c := range req.Changes {
		if err := validateIdentifier(c.Column); err != nil {
			return "", nil, fmt.Errorf("SET column: %w", err)
		}
		setParts = append(setParts, fmt.Sprintf("%s = %s", b.quoteIdent(c.Column), b.placeholder(idx)))
		args = append(args, c.NewValue)
		idx++
	}

	// WHERE clause — primary key conditions (sorted for determinism)
	pkCols := sortedKeys(req.PrimaryKeys)
	whereParts := make([]string, 0, len(pkCols)+len(req.Changes))
	for _, col := range pkCols {
		if err := validateIdentifier(col); err != nil {
			return "", nil, fmt.Errorf("PK column: %w", err)
		}
		whereParts = append(whereParts, fmt.Sprintf("%s = %s", b.quoteIdent(col), b.placeholder(idx)))
		args = append(args, req.PrimaryKeys[col])
		idx++
	}

	// Optimistic lock: include old values in WHERE when provided
	for _, c := range req.Changes {
		if c.OldValue != nil {
			whereParts = append(whereParts, fmt.Sprintf("%s = %s", b.quoteIdent(c.Column), b.placeholder(idx)))
			args = append(args, c.OldValue)
			idx++
		}
	}

	query := fmt.Sprintf("UPDATE %s SET %s WHERE %s",
		b.tableRef(req.Schema, req.Table),
		strings.Join(setParts, ", "),
		strings.Join(whereParts, " AND "),
	)
	return query, args, nil
}

// BuildDelete builds:
//
//	DELETE FROM "schema"."table" WHERE ("pk1") IN (($1), ($2))
//	DELETE FROM "schema"."table" WHERE ("pk1","pk2") IN (($1,$2), ($3,$4))
//
// PrimaryKeys must not be empty.
func (b *PostgresSQLBuilder) BuildDelete(req DeleteRowsRequest) (string, []any, error) {
	if len(req.PrimaryKeys) == 0 {
		return "", nil, errors.New("primaryKeys must not be empty: DELETE without WHERE is not allowed")
	}
	if err := validateIdentifier(req.Table); err != nil {
		return "", nil, fmt.Errorf("table: %w", err)
	}
	if req.Schema != "" {
		if err := validateIdentifier(req.Schema); err != nil {
			return "", nil, fmt.Errorf("schema: %w", err)
		}
	}

	// Derive PK column list from the first row (sorted for determinism)
	pkCols := sortedKeys(req.PrimaryKeys[0])
	for _, col := range pkCols {
		if err := validateIdentifier(col); err != nil {
			return "", nil, fmt.Errorf("PK column: %w", err)
		}
	}

	// Column list: ("col1", "col2")
	quotedCols := make([]string, len(pkCols))
	for i, col := range pkCols {
		quotedCols[i] = b.quoteIdent(col)
	}
	colList := "(" + strings.Join(quotedCols, ", ") + ")"

	// Value tuples and args
	args := make([]any, 0, len(req.PrimaryKeys)*len(pkCols))
	idx := 1
	tuples := make([]string, 0, len(req.PrimaryKeys))
	for _, pkRow := range req.PrimaryKeys {
		placeholders := make([]string, len(pkCols))
		for i, col := range pkCols {
			placeholders[i] = b.placeholder(idx)
			args = append(args, pkRow[col])
			idx++
		}
		tuples = append(tuples, "("+strings.Join(placeholders, ", ")+")")
	}

	query := fmt.Sprintf("DELETE FROM %s WHERE %s IN (%s)",
		b.tableRef(req.Schema, req.Table),
		colList,
		strings.Join(tuples, ", "),
	)
	return query, args, nil
}

// BuildSelect builds:
//
//	SELECT * FROM "schema"."table" WHERE "pk1"=$1 AND "pk2"=$2 LIMIT 1
func (b *PostgresSQLBuilder) BuildSelect(schema, table string, primaryKeys map[string]any) (string, []any, error) {
	if len(primaryKeys) == 0 {
		return "", nil, errors.New("primaryKeys must not be empty")
	}
	if err := validateIdentifier(table); err != nil {
		return "", nil, fmt.Errorf("table: %w", err)
	}
	if schema != "" {
		if err := validateIdentifier(schema); err != nil {
			return "", nil, fmt.Errorf("schema: %w", err)
		}
	}

	pkCols := sortedKeys(primaryKeys)
	whereParts := make([]string, len(pkCols))
	args := make([]any, len(pkCols))
	for i, col := range pkCols {
		if err := validateIdentifier(col); err != nil {
			return "", nil, fmt.Errorf("PK column: %w", err)
		}
		whereParts[i] = fmt.Sprintf("%s = %s", b.quoteIdent(col), b.placeholder(i+1))
		args[i] = primaryKeys[col]
	}

	query := fmt.Sprintf("SELECT * FROM %s WHERE %s LIMIT 1",
		b.tableRef(schema, table),
		strings.Join(whereParts, " AND "),
	)
	return query, args, nil
}

// =============================================================================
// MySQL — placeholders: ?  quotes: `backtick`
// =============================================================================

// MySQLSQLBuilder generates MySQL-compatible parameterized SQL.
type MySQLSQLBuilder struct{}

func (b *MySQLSQLBuilder) quoteIdent(s string) string { return "`" + s + "`" }

func (b *MySQLSQLBuilder) tableRef(schema, table string) string {
	if schema == "" {
		return b.quoteIdent(table)
	}
	return b.quoteIdent(schema) + "." + b.quoteIdent(table)
}

// BuildUpdate builds MySQL UPDATE with ? placeholders.
func (b *MySQLSQLBuilder) BuildUpdate(req UpdateRowRequest) (string, []any, error) {
	if len(req.Changes) == 0 {
		return "", nil, errors.New("changes must not be empty")
	}
	if len(req.PrimaryKeys) == 0 {
		return "", nil, errors.New("primaryKeys must not be empty: UPDATE without WHERE is not allowed")
	}
	if err := validateIdentifier(req.Table); err != nil {
		return "", nil, fmt.Errorf("table: %w", err)
	}
	if req.Schema != "" {
		if err := validateIdentifier(req.Schema); err != nil {
			return "", nil, fmt.Errorf("schema: %w", err)
		}
	}

	args := make([]any, 0)

	setParts := make([]string, 0, len(req.Changes))
	for _, c := range req.Changes {
		if err := validateIdentifier(c.Column); err != nil {
			return "", nil, fmt.Errorf("SET column: %w", err)
		}
		setParts = append(setParts, fmt.Sprintf("%s = ?", b.quoteIdent(c.Column)))
		args = append(args, c.NewValue)
	}

	pkCols := sortedKeys(req.PrimaryKeys)
	whereParts := make([]string, 0, len(pkCols)+len(req.Changes))
	for _, col := range pkCols {
		if err := validateIdentifier(col); err != nil {
			return "", nil, fmt.Errorf("PK column: %w", err)
		}
		whereParts = append(whereParts, fmt.Sprintf("%s = ?", b.quoteIdent(col)))
		args = append(args, req.PrimaryKeys[col])
	}

	for _, c := range req.Changes {
		if c.OldValue != nil {
			whereParts = append(whereParts, fmt.Sprintf("%s = ?", b.quoteIdent(c.Column)))
			args = append(args, c.OldValue)
		}
	}

	query := fmt.Sprintf("UPDATE %s SET %s WHERE %s",
		b.tableRef(req.Schema, req.Table),
		strings.Join(setParts, ", "),
		strings.Join(whereParts, " AND "),
	)
	return query, args, nil
}

// BuildDelete builds MySQL DELETE with ? placeholders.
func (b *MySQLSQLBuilder) BuildDelete(req DeleteRowsRequest) (string, []any, error) {
	if len(req.PrimaryKeys) == 0 {
		return "", nil, errors.New("primaryKeys must not be empty: DELETE without WHERE is not allowed")
	}
	if err := validateIdentifier(req.Table); err != nil {
		return "", nil, fmt.Errorf("table: %w", err)
	}
	if req.Schema != "" {
		if err := validateIdentifier(req.Schema); err != nil {
			return "", nil, fmt.Errorf("schema: %w", err)
		}
	}

	pkCols := sortedKeys(req.PrimaryKeys[0])
	for _, col := range pkCols {
		if err := validateIdentifier(col); err != nil {
			return "", nil, fmt.Errorf("PK column: %w", err)
		}
	}

	quotedCols := make([]string, len(pkCols))
	for i, col := range pkCols {
		quotedCols[i] = b.quoteIdent(col)
	}
	colList := "(" + strings.Join(quotedCols, ", ") + ")"

	args := make([]any, 0, len(req.PrimaryKeys)*len(pkCols))
	tuples := make([]string, 0, len(req.PrimaryKeys))
	for _, pkRow := range req.PrimaryKeys {
		placeholders := make([]string, len(pkCols))
		for i, col := range pkCols {
			placeholders[i] = "?"
			args = append(args, pkRow[col])
		}
		tuples = append(tuples, "("+strings.Join(placeholders, ", ")+")")
	}

	query := fmt.Sprintf("DELETE FROM %s WHERE %s IN (%s)",
		b.tableRef(req.Schema, req.Table),
		colList,
		strings.Join(tuples, ", "),
	)
	return query, args, nil
}

// BuildSelect builds:
//
//	SELECT * FROM `schema`.`table` WHERE `pk1`=? AND `pk2`=? LIMIT 1
func (b *MySQLSQLBuilder) BuildSelect(schema, table string, primaryKeys map[string]any) (string, []any, error) {
	if len(primaryKeys) == 0 {
		return "", nil, errors.New("primaryKeys must not be empty")
	}
	if err := validateIdentifier(table); err != nil {
		return "", nil, fmt.Errorf("table: %w", err)
	}
	if schema != "" {
		if err := validateIdentifier(schema); err != nil {
			return "", nil, fmt.Errorf("schema: %w", err)
		}
	}

	pkCols := sortedKeys(primaryKeys)
	whereParts := make([]string, len(pkCols))
	args := make([]any, len(pkCols))
	for i, col := range pkCols {
		if err := validateIdentifier(col); err != nil {
			return "", nil, fmt.Errorf("PK column: %w", err)
		}
		whereParts[i] = fmt.Sprintf("%s = ?", b.quoteIdent(col))
		args[i] = primaryKeys[col]
	}

	query := fmt.Sprintf("SELECT * FROM %s WHERE %s LIMIT 1",
		b.tableRef(schema, table),
		strings.Join(whereParts, " AND "),
	)
	return query, args, nil
}
