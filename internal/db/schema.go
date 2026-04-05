package db

import (
	"fmt"
)

// ---- Structs ----

type DatabaseInfo struct {
	Name string `json:"name"`
}

type TableInfo struct {
	Schema string `json:"schema"`
	Name   string `json:"name"`
	Type   string `json:"type"` // BASE TABLE | VIEW
}

type ColumnInfo struct {
	Name         string `json:"name"`
	DataType     string `json:"dataType"`
	IsNullable   bool   `json:"isNullable"`
	IsPrimaryKey bool   `json:"isPrimaryKey"`
	DefaultValue string `json:"defaultValue"`
	Position     int    `json:"position"`
}

type IndexInfo struct {
	Name    string   `json:"name"`
	Columns []string `json:"columns"`
	Unique  bool     `json:"unique"`
}

// ---- Schema methods ----

// ListDatabases trả về tất cả databases mà user có quyền truy cập
func (m *Manager) ListDatabases(connID string) ([]DatabaseInfo, error) {
	conn, err := m.Get(connID)
	if err != nil {
		return nil, err
	}

	rows, err := conn.DB.Query(`
		SELECT datname
		FROM pg_database
		WHERE datistemplate = false
		  AND has_database_privilege(datname, 'CONNECT')
		ORDER BY datname
	`)
	if err != nil {
		return nil, fmt.Errorf("list databases: %w", err)
	}
	defer rows.Close()

	var dbs []DatabaseInfo
	for rows.Next() {
		var d DatabaseInfo
		if err := rows.Scan(&d.Name); err != nil {
			return nil, err
		}
		dbs = append(dbs, d)
	}
	return dbs, rows.Err()
}

// ListTables trả về tables + views trong 1 schema (mặc định "public")
func (m *Manager) ListTables(connID, schema string) ([]TableInfo, error) {
	conn, err := m.Get(connID)
	if err != nil {
		return nil, err
	}

	if schema == "" {
		schema = "public"
	}

	rows, err := conn.DB.Query(`
		SELECT table_schema, table_name, table_type
		FROM information_schema.tables
		WHERE table_schema = $1
		  AND table_type IN ('BASE TABLE', 'VIEW')
		ORDER BY table_type, table_name
	`, schema)
	if err != nil {
		return nil, fmt.Errorf("list tables: %w", err)
	}
	defer rows.Close()

	var tables []TableInfo
	for rows.Next() {
		var t TableInfo
		if err := rows.Scan(&t.Schema, &t.Name, &t.Type); err != nil {
			return nil, err
		}
		tables = append(tables, t)
	}
	return tables, rows.Err()
}

// ListSchemas trả về tất cả schemas trong database hiện tại
func (m *Manager) ListSchemas(connID string) ([]string, error) {
	conn, err := m.Get(connID)
	if err != nil {
		return nil, err
	}

	rows, err := conn.DB.Query(`
		SELECT schema_name
		FROM information_schema.schemata
		WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
		  AND schema_name NOT LIKE 'pg_temp_%'
		ORDER BY schema_name
	`)
	if err != nil {
		return nil, fmt.Errorf("list schemas: %w", err)
	}
	defer rows.Close()

	var schemas []string
	for rows.Next() {
		var s string
		if err := rows.Scan(&s); err != nil {
			return nil, err
		}
		schemas = append(schemas, s)
	}
	return schemas, rows.Err()
}

// DescribeTable trả về columns của 1 table kèm PK info
func (m *Manager) DescribeTable(connID, schema, table string) ([]ColumnInfo, error) {
	conn, err := m.Get(connID)
	if err != nil {
		return nil, err
	}

	rows, err := conn.DB.Query(`
		SELECT
			c.column_name,
			c.data_type,
			c.is_nullable = 'YES'                     AS is_nullable,
			COALESCE(c.column_default, '')             AS column_default,
			c.ordinal_position,
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
		  AND c.table_name   = $2
		ORDER BY c.ordinal_position
	`, schema, table)
	if err != nil {
		return nil, fmt.Errorf("describe table: %w", err)
	}
	defer rows.Close()

	var cols []ColumnInfo
	for rows.Next() {
		var c ColumnInfo
		if err := rows.Scan(
			&c.Name, &c.DataType, &c.IsNullable,
			&c.DefaultValue, &c.Position, &c.IsPrimaryKey,
		); err != nil {
			return nil, err
		}
		cols = append(cols, c)
	}
	return cols, rows.Err()
}

// ListIndexes trả về indexes của 1 table
func (m *Manager) ListIndexes(connID, schema, table string) ([]IndexInfo, error) {
	conn, err := m.Get(connID)
	if err != nil {
		return nil, err
	}

	rows, err := conn.DB.Query(`
		SELECT
			i.relname                        AS index_name,
			ix.indisunique                   AS is_unique,
			array_agg(a.attname ORDER BY k.ordinality) AS columns
		FROM pg_class t
		JOIN pg_index ix ON t.oid = ix.indrelid
		JOIN pg_class i  ON i.oid = ix.indexrelid
		JOIN pg_namespace n ON n.oid = t.relnamespace
		JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ordinality)
			ON true
		JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
		WHERE n.nspname = $1
		  AND t.relname = $2
		  AND t.relkind = 'r'
		GROUP BY i.relname, ix.indisunique
		ORDER BY i.relname
	`, schema, table)
	if err != nil {
		return nil, fmt.Errorf("list indexes: %w", err)
	}
	defer rows.Close()

	var indexes []IndexInfo
	for rows.Next() {
		var idx IndexInfo
		// columns là array từ PostgreSQL, cần parse
		var colArray string
		if err := rows.Scan(&idx.Name, &idx.Unique, &colArray); err != nil {
			return nil, err
		}
		// Parse "{col1,col2}" → []string
		idx.Columns = parsePostgresArray(colArray)
		indexes = append(indexes, idx)
	}
	return indexes, rows.Err()
}

// parsePostgresArray chuyển "{a,b,c}" → []string{"a","b","c"}
func parsePostgresArray(s string) []string {
	if len(s) < 2 {
		return nil
	}
	// bỏ { và }
	s = s[1 : len(s)-1]
	if s == "" {
		return nil
	}
	// split bằng dấu phẩy đơn giản (column names không có dấu phẩy)
	var result []string
	start := 0
	for i := 0; i <= len(s); i++ {
		if i == len(s) || s[i] == ',' {
			result = append(result, s[start:i])
			start = i + 1
		}
	}
	return result
}
