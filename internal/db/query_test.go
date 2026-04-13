package db

import (
	"database/sql/driver"
	"fmt"
	"strings"
	"testing"
	"time"
)

// ---------------------------------------------------------------------------
// convertValue
// ---------------------------------------------------------------------------

func TestConvertValue_ByteSliceToString(t *testing.T) {
	got := convertValue([]byte("hello"))
	s, ok := got.(string)
	if !ok {
		t.Fatalf("expected string, got %T", got)
	}
	if s != "hello" {
		t.Errorf("got %q, want %q", s, "hello")
	}
}

func TestConvertValue_TimeToRFC3339(t *testing.T) {
	ts := time.Date(2024, 1, 15, 10, 30, 0, 0, time.UTC)
	got := convertValue(ts)
	s, ok := got.(string)
	if !ok {
		t.Fatalf("expected string, got %T", got)
	}
	want := "2024-01-15T10:30:00Z"
	if s != want {
		t.Errorf("got %q, want %q", s, want)
	}
}

func TestConvertValue_Nil(t *testing.T) {
	got := convertValue(nil)
	if got != nil {
		t.Errorf("expected nil, got %v", got)
	}
}

func TestConvertValue_Int(t *testing.T) {
	got := convertValue(int64(42))
	if got != int64(42) {
		t.Errorf("expected int64(42), got %v (%T)", got, got)
	}
}

func TestConvertValue_String(t *testing.T) {
	got := convertValue("plain string")
	if got != "plain string" {
		t.Errorf("expected %q, got %v", "plain string", got)
	}
}

func TestConvertValue_Bool(t *testing.T) {
	got := convertValue(true)
	if got != true {
		t.Errorf("expected true, got %v", got)
	}
}

func TestConvertValue_Float(t *testing.T) {
	got := convertValue(3.14)
	if got != 3.14 {
		t.Errorf("expected 3.14, got %v", got)
	}
}

// ---------------------------------------------------------------------------
// ExecuteQuery helpers
// ---------------------------------------------------------------------------

// addConnWithBehavior registers a mockDriver and adds a connection to m.
// The fake SQL driver is configured with b before adding.
func addConnWithBehavior(t *testing.T, m *Manager, connID string, b *fakeConnBehavior) {
	t.Helper()
	driverName := "query-driver-" + connID
	registerMockDriver(t, driverName, &mockDriver{})
	setBehavior(b)
	t.Cleanup(func() { setBehavior(nil) })
	if err := m.Add(sampleProfile(connID, driverName)); err != nil {
		t.Fatalf("Add(%q): %v", connID, err)
	}
}

// ---------------------------------------------------------------------------
// ExecuteQuery
// ---------------------------------------------------------------------------

func TestExecuteQuery_NoConnection(t *testing.T) {
	m := newTestManager(t)
	_, err := m.ExecuteQuery("ghost", "SELECT 1")
	if err == nil {
		t.Fatal("expected error for unknown connection")
	}
	if !strings.Contains(err.Error(), "not found") {
		t.Errorf("error %q does not contain \"not found\"", err.Error())
	}
}

func TestExecuteQuery_SelectReturnsRows(t *testing.T) {
	m := newTestManager(t)
	b := &fakeConnBehavior{
		columns:  []string{"id", "name"},
		dataRows: [][]driver.Value{{int64(1), "alice"}, {int64(2), "bob"}},
	}
	addConnWithBehavior(t, m, "sel-conn", b)

	result, err := m.ExecuteQuery("sel-conn", "SELECT id, name FROM users")
	if err != nil {
		t.Fatalf("ExecuteQuery: %v", err)
	}
	if result.Error != "" {
		t.Errorf("result.Error should be empty, got %q", result.Error)
	}
	if len(result.Columns) != 2 || result.Columns[0] != "id" || result.Columns[1] != "name" {
		t.Errorf("Columns: got %v, want [id name]", result.Columns)
	}
	if len(result.Rows) != 2 {
		t.Fatalf("expected 2 rows, got %d", len(result.Rows))
	}
	if result.Rows[0][0] != int64(1) {
		t.Errorf("Rows[0][0]: got %v, want int64(1)", result.Rows[0][0])
	}
	if result.Rows[0][1] != "alice" {
		t.Errorf("Rows[0][1]: got %v, want \"alice\"", result.Rows[0][1])
	}
	if result.Affected != 0 {
		t.Errorf("Affected should be 0 for SELECT, got %d", result.Affected)
	}
	if result.Duration < 0 {
		t.Errorf("Duration should be non-negative, got %f", result.Duration)
	}
}

func TestExecuteQuery_SelectWithByteSliceConverted(t *testing.T) {
	m := newTestManager(t)
	b := &fakeConnBehavior{
		columns:  []string{"data"},
		dataRows: [][]driver.Value{{[]byte("binary-data")}},
	}
	addConnWithBehavior(t, m, "bytes-conn", b)

	result, err := m.ExecuteQuery("bytes-conn", "SELECT data FROM t")
	if err != nil {
		t.Fatalf("ExecuteQuery: %v", err)
	}
	if len(result.Rows) != 1 {
		t.Fatalf("expected 1 row, got %d", len(result.Rows))
	}
	got, ok := result.Rows[0][0].(string)
	if !ok {
		t.Fatalf("expected string after []byte conversion, got %T", result.Rows[0][0])
	}
	if got != "binary-data" {
		t.Errorf("got %q, want %q", got, "binary-data")
	}
}

func TestExecuteQuery_SelectWithTimeConverted(t *testing.T) {
	m := newTestManager(t)
	ts := time.Date(2024, 6, 1, 0, 0, 0, 0, time.UTC)
	b := &fakeConnBehavior{
		columns:  []string{"created_at"},
		dataRows: [][]driver.Value{{ts}},
	}
	addConnWithBehavior(t, m, "time-conn", b)

	result, err := m.ExecuteQuery("time-conn", "SELECT created_at FROM t")
	if err != nil {
		t.Fatalf("ExecuteQuery: %v", err)
	}
	if len(result.Rows) != 1 {
		t.Fatalf("expected 1 row, got %d", len(result.Rows))
	}
	got, ok := result.Rows[0][0].(string)
	if !ok {
		t.Fatalf("expected string after time.Time conversion, got %T", result.Rows[0][0])
	}
	want := "2024-06-01T00:00:00Z"
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestExecuteQuery_SelectNoRows(t *testing.T) {
	m := newTestManager(t)
	b := &fakeConnBehavior{
		columns:  []string{"id"},
		dataRows: nil,
	}
	addConnWithBehavior(t, m, "norows-conn", b)

	result, err := m.ExecuteQuery("norows-conn", "SELECT id FROM empty_table")
	if err != nil {
		t.Fatalf("ExecuteQuery: %v", err)
	}
	if result.Error != "" {
		t.Errorf("result.Error should be empty, got %q", result.Error)
	}
	if len(result.Columns) != 1 || result.Columns[0] != "id" {
		t.Errorf("Columns: got %v", result.Columns)
	}
	if len(result.Rows) != 0 {
		t.Errorf("expected 0 rows, got %d", len(result.Rows))
	}
}

func TestExecuteQuery_QueryErrorFallsBackToExec(t *testing.T) {
	m := newTestManager(t)
	b := &fakeConnBehavior{
		queryErr:     fmt.Errorf("not a SELECT"),
		execAffected: 3,
	}
	addConnWithBehavior(t, m, "exec-conn", b)

	result, err := m.ExecuteQuery("exec-conn", "INSERT INTO t VALUES (1)")
	if err != nil {
		t.Fatalf("ExecuteQuery should return nil Go error, got: %v", err)
	}
	if result.Error != "" {
		t.Errorf("result.Error should be empty on successful Exec fallback, got %q", result.Error)
	}
	if result.Affected != 3 {
		t.Errorf("Affected: got %d, want 3", result.Affected)
	}
	if result.Columns != nil {
		t.Errorf("Columns should be nil for non-SELECT, got %v", result.Columns)
	}
}

func TestExecuteQuery_BothQueryAndExecFail(t *testing.T) {
	m := newTestManager(t)
	b := &fakeConnBehavior{
		queryErr: fmt.Errorf("syntax error"),
		execErr:  fmt.Errorf("exec also failed"),
	}
	addConnWithBehavior(t, m, "both-fail-conn", b)

	result, err := m.ExecuteQuery("both-fail-conn", "BAD SQL")
	// The function encodes the SQL error in QueryResult.Error and returns nil Go error.
	if err != nil {
		t.Fatalf("ExecuteQuery should return nil Go error, got: %v", err)
	}
	if result.Error != "syntax error" {
		t.Errorf("result.Error: got %q, want %q", result.Error, "syntax error")
	}
	if result.Duration < 0 {
		t.Errorf("Duration should be non-negative, got %f", result.Duration)
	}
}

func TestExecuteQuery_DurationIsNonNegative(t *testing.T) {
	m := newTestManager(t)
	b := &fakeConnBehavior{
		columns:  []string{"v"},
		dataRows: [][]driver.Value{{int64(1)}},
	}
	addConnWithBehavior(t, m, "dur-conn", b)

	result, err := m.ExecuteQuery("dur-conn", "SELECT v FROM t")
	if err != nil {
		t.Fatalf("ExecuteQuery: %v", err)
	}
	if result.Duration < 0 {
		t.Errorf("Duration should be non-negative, got %f", result.Duration)
	}
}
