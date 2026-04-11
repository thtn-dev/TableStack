package mutation

// CellChange represents a modification to a single column value.
type CellChange struct {
	Column   string `json:"column"`
	OldValue any    `json:"oldValue"` // used for optimistic locking; nil = no lock
	NewValue any    `json:"newValue"`
}

// UpdateRowRequest describes a single row mutation.
type UpdateRowRequest struct {
	Schema      string         `json:"schema"`
	Table       string         `json:"table"`
	PrimaryKeys map[string]any `json:"primaryKeys"` // e.g. {"id": 42} or {"org_id": 1, "user_id": 5}
	Changes     []CellChange   `json:"changes"`
}

// UpdateBulkRequest wraps multiple row updates for a single transaction.
type UpdateBulkRequest struct {
	Rows []UpdateRowRequest `json:"rows"`
}

// DeleteRowsRequest describes rows to delete from a single table.
type DeleteRowsRequest struct {
	Schema      string           `json:"schema"`
	Table       string           `json:"table"`
	PrimaryKeys []map[string]any `json:"primaryKeys"` // one map per row
}

// MutationResponse is returned to the frontend after any mutation operation.
type MutationResponse struct {
	Success      bool            `json:"success"`
	AffectedRows int64           `json:"affectedRows"`
	Errors       []MutationError `json:"errors,omitempty"`
}

// MutationError describes a failure for a single row in a bulk operation.
type MutationError struct {
	RowIndex int    `json:"rowIndex"`
	Code     string `json:"code"`    // see Err* constants below
	Message  string `json:"message"`
}

// Error code constants returned in MutationError.Code.
const (
	ErrRowNotFound         = "ROW_NOT_FOUND"       // 0 rows affected — row deleted or never existed
	ErrConflict            = "CONFLICT"             // 0 rows affected — row was modified by another session
	ErrConstraintViolation = "CONSTRAINT_VIOLATION" // FK / unique / check constraint failed
)
