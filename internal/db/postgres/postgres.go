package postgres

import (
	"database/sql"
	"fmt"
	"time"

	_ "github.com/lib/pq"

	"github.com/thtn-dev/table_stack/internal/db"
)

func init() {
	db.Register("postgres", &Driver{})
}

type Driver struct{}

func (d *Driver) Open(p db.Profile) (*sql.DB, error) {
	sslMode := p.SSLMode
	if sslMode == "" {
		sslMode = "disable"
	}

	dsn := fmt.Sprintf(
		"host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
		p.Host, p.Port, p.User, p.Password, p.Database, sslMode,
	)

	conn, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, fmt.Errorf("sql.Open: %w", err)
	}

	conn.SetMaxOpenConns(10)
	conn.SetMaxIdleConns(3)
	conn.SetConnMaxLifetime(30 * time.Minute)
	conn.SetConnMaxIdleTime(5 * time.Minute)

	if err := conn.Ping(); err != nil {
		_ = conn.Close()
		return nil, fmt.Errorf("ping failed: %w", err)
	}

	return conn, nil
}

func (d *Driver) ServerVersion(conn *sql.DB) (string, error) {
	var version string
	if err := conn.QueryRow("SELECT version()").Scan(&version); err != nil {
		return "", err
	}
	return version, nil
}

func (d *Driver) ListDatabases(conn *sql.DB) ([]db.DatabaseInfo, error) {
	rows, err := conn.Query(`
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

	var dbs []db.DatabaseInfo
	for rows.Next() {
		var d db.DatabaseInfo
		if err := rows.Scan(&d.Name); err != nil {
			return nil, err
		}
		dbs = append(dbs, d)
	}
	return dbs, rows.Err()
}

func (d *Driver) ListSchemas(conn *sql.DB) ([]string, error) {
	rows, err := conn.Query(`
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

func (d *Driver) ListTables(conn *sql.DB, schema string) ([]db.TableInfo, error) {
	if schema == "" {
		schema = "public"
	}

	rows, err := conn.Query(`
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

	var tables []db.TableInfo
	for rows.Next() {
		var t db.TableInfo
		if err := rows.Scan(&t.Schema, &t.Name, &t.Type); err != nil {
			return nil, err
		}
		tables = append(tables, t)
	}
	return tables, rows.Err()
}

func (d *Driver) DescribeTable(conn *sql.DB, schema, table string) ([]db.ColumnInfo, error) {
	rows, err := conn.Query(`
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
			) AS is_primary_key,
			COALESCE(
				(
					COALESCE(c.is_generated, 'NEVER') = 'ALWAYS'
					OR COALESCE(c.column_default, '') LIKE 'nextval(%'
				),
				false
			) AS is_generated
		FROM information_schema.columns c
		WHERE c.table_schema = $1
		  AND c.table_name   = $2
		ORDER BY c.ordinal_position
	`, schema, table)
	if err != nil {
		return nil, fmt.Errorf("describe table: %w", err)
	}
	defer rows.Close()

	var cols []db.ColumnInfo
	for rows.Next() {
		var c db.ColumnInfo
		if err := rows.Scan(
			&c.Name, &c.DataType, &c.IsNullable,
			&c.DefaultValue, &c.Position, &c.IsPrimaryKey, &c.IsGenerated,
		); err != nil {
			return nil, err
		}
		cols = append(cols, c)
	}
	return cols, rows.Err()
}

func (d *Driver) ListIndexes(conn *sql.DB, schema, table string) ([]db.IndexInfo, error) {
	rows, err := conn.Query(`
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

	var indexes []db.IndexInfo
	for rows.Next() {
		var idx db.IndexInfo
		var colArray string
		if err := rows.Scan(&idx.Name, &idx.Unique, &colArray); err != nil {
			return nil, err
		}
		idx.Columns = parsePostgresArray(colArray)
		indexes = append(indexes, idx)
	}
	return indexes, rows.Err()
}

func parsePostgresArray(s string) []string {
	if len(s) < 2 {
		return nil
	}
	s = s[1 : len(s)-1]
	if s == "" {
		return nil
	}
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
