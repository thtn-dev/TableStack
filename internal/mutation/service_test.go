package mutation

import (
	"database/sql"
	"errors"
	"testing"
)

// =============================================================================
// Mock implementations of dbTxRunner / txRunner
// =============================================================================

// mockExecResult configures one ExecContext call's return values.
type mockExecResult struct {
	rowsAffected int64
	err          error
}

// mockTx records whether the transaction was committed or rolled back and
// dispatches pre-configured results for each execContext call in order.
type mockTx struct {
	results    []mockExecResult
	callIndex  int
	committed  bool
	rolledBack bool
}

func (m *mockTx) execContext(_ string, _ ...any) (sql.Result, error) {
	if m.callIndex >= len(m.results) {
		// Default: 1 row affected, no error
		return &mockResult{rowsAffected: 1}, nil
	}
	r := m.results[m.callIndex]
	m.callIndex++
	if r.err != nil {
		return nil, r.err
	}
	return &mockResult{rowsAffected: r.rowsAffected}, nil
}

func (m *mockTx) commit() error   { m.committed = true; return nil }
func (m *mockTx) rollback() error { m.rolledBack = true; return nil }

// mockResult implements sql.Result.
type mockResult struct {
	rowsAffected int64
}

func (r *mockResult) LastInsertId() (int64, error) { return 0, nil }
func (r *mockResult) RowsAffected() (int64, error) { return r.rowsAffected, nil }

// mockDB creates a dbTxRunner that returns the given mockTx (or an error).
type mockDB struct {
	tx       *mockTx
	beginErr error
}

func (m *mockDB) beginTx() (txRunner, error) {
	if m.beginErr != nil {
		return nil, m.beginErr
	}
	return m.tx, nil
}

// builder used by all service tests — no DB required
var pgBuilder = &PostgresSQLBuilder{}

// singleRowUpdateReq builds a minimal valid UpdateBulkRequest.
func singleRowUpdateReq() UpdateBulkRequest {
	return UpdateBulkRequest{
		Rows: []UpdateRowRequest{{
			Schema:      "public",
			Table:       "users",
			PrimaryKeys: map[string]any{"id": 1},
			Changes:     []CellChange{{Column: "name", NewValue: "Alice"}},
		}},
	}
}

// =============================================================================
// ExecuteUpdate tests
// =============================================================================

func TestExecuteUpdate_Success(t *testing.T) {
	tx := &mockTx{results: []mockExecResult{{rowsAffected: 1}}}
	db := &mockDB{tx: tx}

	resp := executeUpdateWith(db, pgBuilder, singleRowUpdateReq())

	if !resp.Success {
		t.Errorf("expected Success=true, got errors: %v", resp.Errors)
	}
	if resp.AffectedRows != 1 {
		t.Errorf("AffectedRows = %d, want 1", resp.AffectedRows)
	}
	if !tx.committed {
		t.Error("expected transaction to be committed")
	}
	if tx.rolledBack {
		t.Error("transaction should not have been rolled back")
	}
}

func TestExecuteUpdate_Conflict(t *testing.T) {
	// RowsAffected = 0 means another session changed or deleted the row.
	tx := &mockTx{results: []mockExecResult{{rowsAffected: 0}}}
	db := &mockDB{tx: tx}

	resp := executeUpdateWith(db, pgBuilder, singleRowUpdateReq())

	if resp.Success {
		t.Error("expected Success=false for zero-rows-affected")
	}
	if len(resp.Errors) == 0 {
		t.Fatal("expected at least one error")
	}
	if resp.Errors[0].Code != ErrConflict {
		t.Errorf("error code = %q, want %q", resp.Errors[0].Code, ErrConflict)
	}
	if !tx.rolledBack {
		t.Error("expected transaction to be rolled back on conflict")
	}
}

func TestExecuteUpdate_DBError(t *testing.T) {
	dbErr := errors.New("connection reset by peer")
	tx := &mockTx{results: []mockExecResult{{err: dbErr}}}
	db := &mockDB{tx: tx}

	resp := executeUpdateWith(db, pgBuilder, singleRowUpdateReq())

	if resp.Success {
		t.Error("expected Success=false for DB error")
	}
	if len(resp.Errors) == 0 {
		t.Fatal("expected at least one error")
	}
	if !tx.rolledBack {
		t.Error("expected transaction to be rolled back on DB error")
	}
}

func TestExecuteUpdate_PartialFail(t *testing.T) {
	// Bulk: 3 rows. Row[1] (index 1) fails — all must be rolled back.
	tx := &mockTx{results: []mockExecResult{
		{rowsAffected: 1},                       // row 0 succeeds
		{rowsAffected: 0},                       // row 1: conflict (0 affected)
		{rowsAffected: 1},                       // row 2: never reached
	}}
	db := &mockDB{tx: tx}

	req := UpdateBulkRequest{
		Rows: []UpdateRowRequest{
			{Schema: "public", Table: "users", PrimaryKeys: map[string]any{"id": 1}, Changes: []CellChange{{Column: "name", NewValue: "A"}}},
			{Schema: "public", Table: "users", PrimaryKeys: map[string]any{"id": 2}, Changes: []CellChange{{Column: "name", NewValue: "B"}}},
			{Schema: "public", Table: "users", PrimaryKeys: map[string]any{"id": 3}, Changes: []CellChange{{Column: "name", NewValue: "C"}}},
		},
	}

	resp := executeUpdateWith(db, pgBuilder, req)

	if resp.Success {
		t.Error("expected Success=false when a row fails")
	}
	if len(resp.Errors) == 0 {
		t.Fatal("expected errors for failed row")
	}
	if resp.Errors[0].RowIndex != 1 {
		t.Errorf("RowIndex = %d, want 1", resp.Errors[0].RowIndex)
	}
	if !tx.rolledBack {
		t.Error("expected full rollback when any row fails")
	}
	if tx.committed {
		t.Error("transaction must not have been committed")
	}
}

// =============================================================================
// ExecuteDelete tests
// =============================================================================

func singleRowDeleteReq() DeleteRowsRequest {
	return DeleteRowsRequest{
		Schema:      "public",
		Table:       "users",
		PrimaryKeys: []map[string]any{{"id": 42}},
	}
}

func TestExecuteDelete_Success(t *testing.T) {
	tx := &mockTx{results: []mockExecResult{{rowsAffected: 1}}}
	db := &mockDB{tx: tx}

	resp := executeDeleteWith(db, pgBuilder, singleRowDeleteReq())

	if !resp.Success {
		t.Errorf("expected Success=true, got errors: %v", resp.Errors)
	}
	if resp.AffectedRows != 1 {
		t.Errorf("AffectedRows = %d, want 1", resp.AffectedRows)
	}
	if !tx.committed {
		t.Error("expected transaction to be committed")
	}
}

func TestExecuteDelete_RowNotFound(t *testing.T) {
	// 0 rows affected — the requested PK doesn't exist
	tx := &mockTx{results: []mockExecResult{{rowsAffected: 0}}}
	db := &mockDB{tx: tx}

	resp := executeDeleteWith(db, pgBuilder, singleRowDeleteReq())

	if resp.Success {
		t.Error("expected Success=false when row not found")
	}
	if len(resp.Errors) == 0 {
		t.Fatal("expected at least one error")
	}
	if resp.Errors[0].Code != ErrRowNotFound {
		t.Errorf("error code = %q, want %q", resp.Errors[0].Code, ErrRowNotFound)
	}
	if !tx.rolledBack {
		t.Error("expected transaction to be rolled back when row not found")
	}
}

func TestExecuteDelete_ConstraintViolation(t *testing.T) {
	// FK constraint error from the database
	dbErr := errors.New("ERROR: violates foreign key constraint \"orders_user_id_fkey\"")
	tx := &mockTx{results: []mockExecResult{{err: dbErr}}}
	db := &mockDB{tx: tx}

	resp := executeDeleteWith(db, pgBuilder, singleRowDeleteReq())

	if resp.Success {
		t.Error("expected Success=false for constraint violation")
	}
	if len(resp.Errors) == 0 {
		t.Fatal("expected at least one error")
	}
	if resp.Errors[0].Code != ErrConstraintViolation {
		t.Errorf("error code = %q, want %q", resp.Errors[0].Code, ErrConstraintViolation)
	}
	if !tx.rolledBack {
		t.Error("expected transaction to be rolled back on constraint error")
	}
}
