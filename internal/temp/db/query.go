package db

import (
	"time"
)

// QueryResult chứa kết quả của một câu query
type QueryResult struct {
	Columns  []string `json:"columns"`
	Rows     [][]any  `json:"rows"`
	Affected int64    `json:"affected"`
	Duration float64  `json:"duration"` // ms
	Error    string   `json:"error"`
}

// ExecuteQuery thực thi một câu lệnh SQL bất kỳ.
// Phần này dùng database/sql thuần nên chạy được với mọi driver.
func (m *Manager) ExecuteQuery(connID, sqlStr string) (*QueryResult, error) {
	conn, err := m.Get(connID)
	if err != nil {
		return nil, err
	}

	start := time.Now()
	rows, err := conn.DB.Query(sqlStr)
	duration := time.Since(start).Seconds() * 1000

	if err != nil {
		// Thử Exec nếu Query lỗi (cho các command non-SELECT)
		res, execErr := conn.DB.Exec(sqlStr)
		if execErr != nil {
			return &QueryResult{
				Error:    err.Error(),
				Duration: duration,
			}, nil
		}
		affected, _ := res.RowsAffected()
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

// convertValue chuyển data type sang JSON-safe types
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
