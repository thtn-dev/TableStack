package mutation

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"github.com/thtn-dev/table_stack/internal/db"
)

// =============================================================================
// Thin DB/Tx interfaces — enables mocking without external test dependencies
// =============================================================================

// dbTxRunner abstracts the ability to begin a transaction.
type dbTxRunner interface {
	beginTx() (txRunner, error)
}

// txRunner abstracts operations performed inside a transaction.
type txRunner interface {
	execContext(query string, args ...any) (sql.Result, error)
	commit() error
	rollback() error
}

// --- real implementations wrapping *sql.DB / *sql.Tx -------------------------

type realDB struct{ db *sql.DB }

func (r *realDB) beginTx() (txRunner, error) {
	tx, err := r.db.BeginTx(context.Background(), nil)
	if err != nil {
		return nil, err
	}
	return &realTx{tx: tx}, nil
}

type realTx struct{ tx *sql.Tx }

func (r *realTx) execContext(query string, args ...any) (sql.Result, error) {
	return r.tx.ExecContext(context.Background(), query, args...)
}
func (r *realTx) commit() error   { return r.tx.Commit() }
func (r *realTx) rollback() error { return r.tx.Rollback() }

// =============================================================================
// MutationService
// =============================================================================

// MutationService executes row-level mutations (UPDATE, DELETE) within a
// database transaction, ensuring all-or-nothing semantics.
type MutationService struct {
	manager *db.Manager
}

// NewMutationService creates a MutationService backed by the given Manager.
func NewMutationService(m *db.Manager) *MutationService {
	return &MutationService{manager: m}
}

// ExecuteUpdate updates rows in the database. All rows are updated in a
// single transaction; if any row fails the entire transaction is rolled back.
func (s *MutationService) ExecuteUpdate(connID string, req UpdateBulkRequest) MutationResponse {
	conn, err := s.manager.Get(connID)
	if err != nil {
		return MutationResponse{
			Errors: []MutationError{{Code: "CONNECTION_ERROR", Message: err.Error()}},
		}
	}
	builder, err := builderForDialect(conn.Profile.Driver)
	if err != nil {
		return MutationResponse{
			Errors: []MutationError{{Code: "UNSUPPORTED_DIALECT", Message: err.Error()}},
		}
	}
	return executeUpdateWith(&realDB{db: conn.DB}, builder, req)
}

// ExecuteDelete deletes the specified rows in a single transaction.
func (s *MutationService) ExecuteDelete(connID string, req DeleteRowsRequest) MutationResponse {
	conn, err := s.manager.Get(connID)
	if err != nil {
		return MutationResponse{
			Errors: []MutationError{{Code: "CONNECTION_ERROR", Message: err.Error()}},
		}
	}
	builder, err := builderForDialect(conn.Profile.Driver)
	if err != nil {
		return MutationResponse{
			Errors: []MutationError{{Code: "UNSUPPORTED_DIALECT", Message: err.Error()}},
		}
	}
	return executeDeleteWith(&realDB{db: conn.DB}, builder, req)
}

// =============================================================================
// Package-level helpers — accept interfaces for testability
// =============================================================================

// executeUpdateWith is the testable core of ExecuteUpdate.
func executeUpdateWith(dbr dbTxRunner, builder SQLBuilder, req UpdateBulkRequest) MutationResponse {
	if len(req.Rows) == 0 {
		return MutationResponse{Success: true}
	}

	tx, err := dbr.beginTx()
	if err != nil {
		return MutationResponse{
			Errors: []MutationError{{Code: "TX_BEGIN", Message: err.Error()}},
		}
	}

	var totalAffected int64

	for i, row := range req.Rows {
		query, args, buildErr := builder.BuildUpdate(row)
		if buildErr != nil {
			_ = tx.rollback()
			return MutationResponse{
				Errors: []MutationError{{RowIndex: i, Code: "BUILD_ERROR", Message: buildErr.Error()}},
			}
		}

		result, execErr := tx.execContext(query, args...)
		if execErr != nil {
			_ = tx.rollback()
			return MutationResponse{
				Errors: []MutationError{{RowIndex: i, Code: classifyError(execErr), Message: execErr.Error()}},
			}
		}

		affected, _ := result.RowsAffected()
		if affected == 0 {
			_ = tx.rollback()
			return MutationResponse{
				Errors: []MutationError{{
					RowIndex: i,
					Code:     ErrConflict,
					Message:  "row was modified or deleted by another session",
				}},
			}
		}
		totalAffected += affected
	}

	if err := tx.commit(); err != nil {
		return MutationResponse{
			Errors: []MutationError{{Code: "TX_COMMIT", Message: err.Error()}},
		}
	}
	return MutationResponse{Success: true, AffectedRows: totalAffected}
}

// executeDeleteWith is the testable core of ExecuteDelete.
func executeDeleteWith(dbr dbTxRunner, builder SQLBuilder, req DeleteRowsRequest) MutationResponse {
	if len(req.PrimaryKeys) == 0 {
		return MutationResponse{Success: true}
	}

	tx, err := dbr.beginTx()
	if err != nil {
		return MutationResponse{
			Errors: []MutationError{{Code: "TX_BEGIN", Message: err.Error()}},
		}
	}

	query, args, buildErr := builder.BuildDelete(req)
	if buildErr != nil {
		_ = tx.rollback()
		return MutationResponse{
			Errors: []MutationError{{Code: "BUILD_ERROR", Message: buildErr.Error()}},
		}
	}

	result, execErr := tx.execContext(query, args...)
	if execErr != nil {
		_ = tx.rollback()
		return MutationResponse{
			Errors: []MutationError{{Code: classifyError(execErr), Message: execErr.Error()}},
		}
	}

	affected, _ := result.RowsAffected()
	expected := int64(len(req.PrimaryKeys))

	// Some rows were not found — roll back for all-or-nothing semantics
	if affected < expected {
		_ = tx.rollback()
		return MutationResponse{
			AffectedRows: affected,
			Errors: []MutationError{{
				Code:    ErrRowNotFound,
				Message: fmt.Sprintf("%d of %d rows not found", expected-affected, expected),
			}},
		}
	}

	if err := tx.commit(); err != nil {
		return MutationResponse{
			Errors: []MutationError{{Code: "TX_COMMIT", Message: err.Error()}},
		}
	}
	return MutationResponse{Success: true, AffectedRows: affected}
}

// classifyError maps database errors to mutation error code strings.
func classifyError(err error) string {
	msg := strings.ToLower(err.Error())
	if strings.Contains(msg, "foreign key") ||
		strings.Contains(msg, "violates") ||
		strings.Contains(msg, "23503") ||
		strings.Contains(msg, "23505") ||
		strings.Contains(msg, "1451") ||
		strings.Contains(msg, "1452") {
		return ErrConstraintViolation
	}
	return "DB_ERROR"
}
