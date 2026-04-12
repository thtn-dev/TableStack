package db

import (
	"strings"
	"time"
)

type QueryResult struct {
	Columns  []string `json:"columns"`
	Rows     [][]any  `json:"rows"`
	Affected int64    `json:"affected"`
	Duration float64  `json:"duration"`
	Error    string   `json:"error"`
}

func (m *Manager) ExecuteQuery(connID, sqlStr string) (*QueryResult, error) {
	conn, err := m.Get(connID)
	if err != nil {
		return nil, err
	}

	start := time.Now()
	rows, err := conn.DB.Query(sqlStr)
	duration := time.Since(start).Seconds() * 1000

	if err != nil {
		res, execErr := conn.DB.Exec(sqlStr)
		if execErr != nil {
			return &QueryResult{
				Error:    err.Error(),
				Duration: duration,
			}, nil
		}
		affected, _ := res.RowsAffected()
		// Invalidate schema cache on successful DDL
		if isDDLStatement(sqlStr) {
			m.cache.Invalidate(connID)
			if m.onDDL != nil {
				m.onDDL(connID)
			}
		}
		return &QueryResult{
			Affected: affected,
			Duration: duration,
		}, nil
	}
	defer rows.Close()

	columns, err := rows.Columns()
	if err != nil {
		return nil, err
	}

	var resultRows [][]any
	for rows.Next() {
		values := make([]any, len(columns))
		scanArgs := make([]any, len(columns))
		for i := range values {
			scanArgs[i] = &values[i]
		}

		if err := rows.Scan(scanArgs...); err != nil {
			return nil, err
		}

		row := make([]any, len(columns))
		for i, v := range values {
			row[i] = convertValue(v)
		}
		resultRows = append(resultRows, row)
	}

	return &QueryResult{
		Columns:  columns,
		Rows:     resultRows,
		Duration: duration,
	}, rows.Err()
}

// isDDLStatement reports whether query is a DDL statement (CREATE / ALTER /
// DROP / RENAME TABLE|VIEW|INDEX, TRUNCATE). Leading whitespace and single-line
// SQL comments (-- ...) are stripped before matching.
func isDDLStatement(query string) bool {
	s := strings.ToUpper(strings.TrimSpace(query))
	// Strip leading single-line comments
	for strings.HasPrefix(s, "--") {
		nl := strings.IndexByte(s, '\n')
		if nl < 0 {
			return false
		}
		s = strings.TrimSpace(s[nl+1:])
	}
	for _, prefix := range ddlPrefixes {
		if strings.HasPrefix(s, prefix) {
			return true
		}
	}
	return false
}

var ddlPrefixes = []string{
	"CREATE TABLE", "CREATE VIEW", "CREATE INDEX", "CREATE UNIQUE INDEX",
	"CREATE MATERIALIZED VIEW",
	"ALTER TABLE", "ALTER VIEW",
	"DROP TABLE", "DROP VIEW", "DROP INDEX",
	"RENAME TABLE",
	"TRUNCATE TABLE", "TRUNCATE",
}

func convertValue(v any) any {
	switch t := v.(type) {
	case []byte:
		return string(t)
	case time.Time:
		return t.Format(time.RFC3339)
	default:
		return t
	}
}
