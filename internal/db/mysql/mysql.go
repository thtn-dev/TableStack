package mysql

import (
	"database/sql"
	"fmt"
	"time"

	_ "github.com/go-sql-driver/mysql"

	"github.com/thtn-dev/table_stack/internal/db"
)

func init() {
	db.Register("mysql", &Driver{})
}

type Driver struct{}

func (d *Driver) Open(p db.Profile) (*sql.DB, error) {
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?parseTime=true&charset=utf8mb4",
		p.User, p.Password, p.Host, p.Port, p.Database,
	)

	if p.SSLMode == "require" {
		dsn += "&tls=true"
	}

	conn, err := sql.Open("mysql", dsn)
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
	if err := conn.QueryRow("SELECT VERSION()").Scan(&version); err != nil {
		return "", err
	}
	return "MySQL " + version, nil
}

func (d *Driver) ListDatabases(conn *sql.DB) ([]db.DatabaseInfo, error) {
	rows, err := conn.Query("SHOW DATABASES")
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
	var current string
	if err := conn.QueryRow("SELECT DATABASE()").Scan(&current); err != nil {
		return nil, err
	}
	return []string{current}, nil
}

func (d *Driver) ListTables(conn *sql.DB, schema string) ([]db.TableInfo, error) {
	if schema == "" {
		if err := conn.QueryRow("SELECT DATABASE()").Scan(&schema); err != nil {
			return nil, err
		}
	}

	rows, err := conn.Query(`
		SELECT table_schema, table_name, table_type
		FROM information_schema.tables
		WHERE table_schema = ?
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
			c.COLUMN_NAME,
			c.DATA_TYPE,
			c.IS_NULLABLE = 'YES'          AS is_nullable,
			COALESCE(c.COLUMN_DEFAULT, '')  AS column_default,
			c.ORDINAL_POSITION,
			c.COLUMN_KEY = 'PRI'            AS is_primary_key
		FROM information_schema.columns c
		WHERE c.TABLE_SCHEMA = ?
		  AND c.TABLE_NAME   = ?
		ORDER BY c.ORDINAL_POSITION
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
			&c.DefaultValue, &c.Position, &c.IsPrimaryKey,
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
			INDEX_NAME,
			NOT NON_UNIQUE AS is_unique,
			GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns
		FROM information_schema.statistics
		WHERE TABLE_SCHEMA = ?
		  AND TABLE_NAME   = ?
		GROUP BY INDEX_NAME, NON_UNIQUE
		ORDER BY INDEX_NAME
	`, schema, table)
	if err != nil {
		return nil, fmt.Errorf("list indexes: %w", err)
	}
	defer rows.Close()

	var indexes []db.IndexInfo
	for rows.Next() {
		var idx db.IndexInfo
		var colStr string
		if err := rows.Scan(&idx.Name, &idx.Unique, &colStr); err != nil {
			return nil, err
		}
		idx.Columns = splitCSV(colStr)
		indexes = append(indexes, idx)
	}
	return indexes, rows.Err()
}

func splitCSV(s string) []string {
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
