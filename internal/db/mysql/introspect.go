package mysql

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/thtn-dev/table_stack/internal/db"
)

// IntrospectSchema returns the full SchemaResult for the connected MySQL
// database. MySQL connections are scoped to a single database, so the result
// always contains exactly one DatabaseSchema whose name is the current DB.
func (d *Driver) IntrospectSchema(ctx context.Context, conn *sql.DB) (*db.SchemaResult, error) {
	var schemaName string
	if err := conn.QueryRowContext(ctx, "SELECT DATABASE()").Scan(&schemaName); err != nil {
		return nil, fmt.Errorf("get current database: %w", err)
	}

	tables, err := myTableNames(ctx, conn, schemaName)
	if err != nil {
		return nil, fmt.Errorf("list tables: %w", err)
	}

	if len(tables) == 0 {
		return &db.SchemaResult{
			Schemas: []db.DatabaseSchema{{Name: schemaName}},
		}, nil
	}

	colMap, _ := myColumnMap(ctx, conn, schemaName)
	idxMap, _ := myIndexMap(ctx, conn, schemaName)
	fkMap, _ := myFKMap(ctx, conn, schemaName)

	for i := range tables {
		tables[i].Columns = colMap[tables[i].Name]
		tables[i].Indexes = idxMap[tables[i].Name]
		tables[i].ForeignKeys = fkMap[tables[i].Name]
	}

	return &db.SchemaResult{
		Schemas: []db.DatabaseSchema{{Name: schemaName, Tables: tables}},
	}, nil
}

func myTableNames(ctx context.Context, conn *sql.DB, schema string) ([]db.TableSchema, error) {
	rows, err := conn.QueryContext(ctx, `
		SELECT table_name,
		       CASE WHEN table_type = 'BASE TABLE' THEN 'TABLE' ELSE 'VIEW' END
		FROM information_schema.tables
		WHERE table_schema = ?
		  AND table_type IN ('BASE TABLE','VIEW')
		ORDER BY table_type, table_name
	`, schema)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var tables []db.TableSchema
	for rows.Next() {
		var t db.TableSchema
		if err := rows.Scan(&t.Name, &t.Type); err != nil {
			return nil, err
		}
		tables = append(tables, t)
	}
	return tables, rows.Err()
}

func myColumnMap(ctx context.Context, conn *sql.DB, schema string) (map[string][]db.ColumnSchema, error) {
	rows, err := conn.QueryContext(ctx, `
		SELECT
			TABLE_NAME,
			COLUMN_NAME,
			DATA_TYPE,
			(IS_NULLABLE = 'YES')  AS is_nullable,
			COLUMN_DEFAULT,
			(COLUMN_KEY = 'PRI')   AS is_primary_key
		FROM information_schema.COLUMNS
		WHERE TABLE_SCHEMA = ?
		ORDER BY TABLE_NAME, ORDINAL_POSITION
	`, schema)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	m := make(map[string][]db.ColumnSchema)
	for rows.Next() {
		var tableName string
		var col db.ColumnSchema
		var def sql.NullString
		if err := rows.Scan(&tableName, &col.Name, &col.DataType,
			&col.IsNullable, &def, &col.IsPrimaryKey); err != nil {
			return nil, err
		}
		if def.Valid {
			col.DefaultValue = &def.String
		}
		m[tableName] = append(m[tableName], col)
	}
	return m, rows.Err()
}

func myIndexMap(ctx context.Context, conn *sql.DB, schema string) (map[string][]db.IndexSchema, error) {
	rows, err := conn.QueryContext(ctx, `
		SELECT
			TABLE_NAME,
			INDEX_NAME,
			NOT NON_UNIQUE                                          AS is_unique,
			GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX)        AS columns
		FROM information_schema.STATISTICS
		WHERE TABLE_SCHEMA = ?
		GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE
		ORDER BY TABLE_NAME, INDEX_NAME
	`, schema)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	m := make(map[string][]db.IndexSchema)
	for rows.Next() {
		var tableName string
		var idx db.IndexSchema
		var colStr string
		if err := rows.Scan(&tableName, &idx.Name, &idx.IsUnique, &colStr); err != nil {
			return nil, err
		}
		idx.Columns = splitCSV(colStr)
		m[tableName] = append(m[tableName], idx)
	}
	return m, rows.Err()
}

func myFKMap(ctx context.Context, conn *sql.DB, schema string) (map[string][]db.ForeignKey, error) {
	rows, err := conn.QueryContext(ctx, `
		SELECT
			TABLE_NAME,
			CONSTRAINT_NAME,
			COLUMN_NAME,
			REFERENCED_TABLE_NAME,
			REFERENCED_COLUMN_NAME
		FROM information_schema.KEY_COLUMN_USAGE
		WHERE TABLE_SCHEMA = ?
		  AND REFERENCED_TABLE_NAME IS NOT NULL
		ORDER BY TABLE_NAME, CONSTRAINT_NAME
	`, schema)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	m := make(map[string][]db.ForeignKey)
	for rows.Next() {
		var tableName string
		var fk db.ForeignKey
		if err := rows.Scan(&tableName, &fk.Name, &fk.Column,
			&fk.ReferencedTable, &fk.ReferencedColumn); err != nil {
			return nil, err
		}
		m[tableName] = append(m[tableName], fk)
	}
	return m, rows.Err()
}
