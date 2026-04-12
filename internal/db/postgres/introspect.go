package postgres

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/thtn-dev/table_stack/internal/db"
)

// IntrospectSchema returns the full SchemaResult for the connected PostgreSQL
// database: all user schemas with their tables, columns, indexes, and FKs.
// Schemas that cannot be read (e.g. insufficient privileges) are silently
// skipped so one inaccessible schema does not abort the entire introspection.
func (d *Driver) IntrospectSchema(ctx context.Context, conn *sql.DB) (*db.SchemaResult, error) {
	schemas, err := pgSchemaNames(ctx, conn)
	if err != nil {
		return nil, fmt.Errorf("list schema names: %w", err)
	}

	result := &db.SchemaResult{Schemas: make([]db.DatabaseSchema, 0, len(schemas))}
	for _, name := range schemas {
		ds, err := pgBuildSchema(ctx, conn, name)
		if err != nil {
			continue // skip inaccessible schema
		}
		result.Schemas = append(result.Schemas, ds)
	}
	return result, nil
}

func pgSchemaNames(ctx context.Context, conn *sql.DB) ([]string, error) {
	rows, err := conn.QueryContext(ctx, `
		SELECT schema_name
		FROM information_schema.schemata
		WHERE schema_name NOT IN ('pg_catalog','information_schema','pg_toast')
		  AND schema_name NOT LIKE 'pg_temp_%'
		ORDER BY schema_name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var names []string
	for rows.Next() {
		var s string
		if err := rows.Scan(&s); err != nil {
			return nil, err
		}
		names = append(names, s)
	}
	return names, rows.Err()
}

func pgBuildSchema(ctx context.Context, conn *sql.DB, schema string) (db.DatabaseSchema, error) {
	tables, err := pgTableNames(ctx, conn, schema)
	if err != nil {
		return db.DatabaseSchema{}, err
	}
	if len(tables) == 0 {
		return db.DatabaseSchema{Name: schema}, nil
	}

	colMap, _ := pgColumnMap(ctx, conn, schema)
	idxMap, _ := pgIndexMap(ctx, conn, schema)
	fkMap, _ := pgFKMap(ctx, conn, schema)

	for i := range tables {
		tables[i].Columns = colMap[tables[i].Name]
		tables[i].Indexes = idxMap[tables[i].Name]
		tables[i].ForeignKeys = fkMap[tables[i].Name]
	}
	return db.DatabaseSchema{Name: schema, Tables: tables}, nil
}

func pgTableNames(ctx context.Context, conn *sql.DB, schema string) ([]db.TableSchema, error) {
	rows, err := conn.QueryContext(ctx, `
		SELECT table_name,
		       CASE WHEN table_type = 'BASE TABLE' THEN 'TABLE' ELSE 'VIEW' END
		FROM information_schema.tables
		WHERE table_schema = $1
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

func pgColumnMap(ctx context.Context, conn *sql.DB, schema string) (map[string][]db.ColumnSchema, error) {
	rows, err := conn.QueryContext(ctx, `
		SELECT
			c.table_name,
			c.column_name,
			c.data_type,
			(c.is_nullable = 'YES')  AS is_nullable,
			c.column_default,
			EXISTS (
				SELECT 1
				FROM information_schema.table_constraints tc
				JOIN information_schema.key_column_usage kcu
					ON tc.constraint_name = kcu.constraint_name
					AND tc.table_schema   = kcu.table_schema
					AND tc.table_name     = kcu.table_name
				WHERE tc.constraint_type = 'PRIMARY KEY'
				  AND tc.table_schema    = c.table_schema
				  AND tc.table_name      = c.table_name
				  AND kcu.column_name    = c.column_name
			) AS is_primary_key
		FROM information_schema.columns c
		WHERE c.table_schema = $1
		ORDER BY c.table_name, c.ordinal_position
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

func pgIndexMap(ctx context.Context, conn *sql.DB, schema string) (map[string][]db.IndexSchema, error) {
	rows, err := conn.QueryContext(ctx, `
		SELECT
			t.relname                                     AS table_name,
			i.relname                                     AS index_name,
			ix.indisunique                                AS is_unique,
			array_agg(a.attname ORDER BY k.ordinality)   AS columns
		FROM pg_class t
		JOIN pg_index     ix ON t.oid = ix.indrelid
		JOIN pg_class     i  ON i.oid = ix.indexrelid
		JOIN pg_namespace n  ON n.oid = t.relnamespace
		JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ordinality) ON true
		JOIN pg_attribute a  ON a.attrelid = t.oid AND a.attnum = k.attnum
		WHERE n.nspname = $1
		  AND t.relkind = 'r'
		  AND a.attnum  > 0
		GROUP BY t.relname, i.relname, ix.indisunique
		ORDER BY t.relname, i.relname
	`, schema)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	m := make(map[string][]db.IndexSchema)
	for rows.Next() {
		var tableName string
		var idx db.IndexSchema
		var colArray string
		if err := rows.Scan(&tableName, &idx.Name, &idx.IsUnique, &colArray); err != nil {
			return nil, err
		}
		idx.Columns = parsePostgresArray(colArray)
		m[tableName] = append(m[tableName], idx)
	}
	return m, rows.Err()
}

func pgFKMap(ctx context.Context, conn *sql.DB, schema string) (map[string][]db.ForeignKey, error) {
	rows, err := conn.QueryContext(ctx, `
		SELECT
			tc.table_name,
			tc.constraint_name,
			kcu.column_name,
			ccu.table_name  AS referenced_table,
			ccu.column_name AS referenced_column
		FROM information_schema.table_constraints tc
		JOIN information_schema.key_column_usage kcu
			ON tc.constraint_name = kcu.constraint_name
			AND tc.table_schema   = kcu.table_schema
		JOIN information_schema.constraint_column_usage ccu
			ON ccu.constraint_name = tc.constraint_name
			AND ccu.table_schema   = tc.table_schema
		WHERE tc.constraint_type = 'FOREIGN KEY'
		  AND tc.table_schema = $1
		ORDER BY tc.table_name, tc.constraint_name
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
