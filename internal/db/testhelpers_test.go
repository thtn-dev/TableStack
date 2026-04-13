package db

import (
	"database/sql"
	"database/sql/driver"
	"fmt"
	"io"
	"sync"
	"testing"
)

// ---------------------------------------------------------------------------
// Fake database/sql driver
// ---------------------------------------------------------------------------

const fakeDriverName = "testdb"

var registerFakeDriverOnce sync.Once

func ensureFakeDriverRegistered() {
	registerFakeDriverOnce.Do(func() {
		sql.Register(fakeDriverName, &fakeDriver{})
	})
}

// fakeConnBehavior controls what the fake SQL driver returns.
// Tests set currentBehavior before exercising production code that touches the DB.
var (
	behaviorMu      sync.Mutex
	currentBehavior *fakeConnBehavior
)

type fakeConnBehavior struct {
	// SELECT path
	columns  []string
	dataRows [][]driver.Value
	queryErr error

	// Exec path
	execAffected int64
	execErr      error
}

func setBehavior(b *fakeConnBehavior) {
	behaviorMu.Lock()
	currentBehavior = b
	behaviorMu.Unlock()
}

func getBehavior() *fakeConnBehavior {
	behaviorMu.Lock()
	defer behaviorMu.Unlock()
	if currentBehavior == nil {
		return &fakeConnBehavior{}
	}
	return currentBehavior
}

// fakeDriver implements database/sql/driver.Driver.
type fakeDriver struct{}

func (d *fakeDriver) Open(_ string) (driver.Conn, error) {
	return &fakeConn{b: getBehavior()}, nil
}

// fakeConn implements driver.Conn.
type fakeConn struct {
	b *fakeConnBehavior
}

func (c *fakeConn) Prepare(query string) (driver.Stmt, error) {
	return &fakeStmt{conn: c}, nil
}

func (c *fakeConn) Close() error { return nil }

func (c *fakeConn) Begin() (driver.Tx, error) {
	return nil, fmt.Errorf("transactions not supported by fake driver")
}

// fakeStmt implements driver.Stmt.
type fakeStmt struct {
	conn *fakeConn
}

func (s *fakeStmt) Close() error   { return nil }
func (s *fakeStmt) NumInput() int  { return -1 } // variadic

func (s *fakeStmt) Exec(args []driver.Value) (driver.Result, error) {
	b := s.conn.b
	if b.execErr != nil {
		return nil, b.execErr
	}
	return &fakeResult{affected: b.execAffected}, nil
}

func (s *fakeStmt) Query(args []driver.Value) (driver.Rows, error) {
	b := s.conn.b
	if b.queryErr != nil {
		return nil, b.queryErr
	}
	return &fakeRows{cols: b.columns, data: b.dataRows, idx: 0}, nil
}

// fakeRows implements driver.Rows.
type fakeRows struct {
	cols []string
	data [][]driver.Value
	idx  int
}

func (r *fakeRows) Columns() []string { return r.cols }
func (r *fakeRows) Close() error      { return nil }

func (r *fakeRows) Next(dest []driver.Value) error {
	if r.idx >= len(r.data) {
		return io.EOF
	}
	row := r.data[r.idx]
	r.idx++
	for i, v := range row {
		if i < len(dest) {
			dest[i] = v
		}
	}
	return nil
}

// fakeResult implements driver.Result.
type fakeResult struct {
	affected int64
}

func (r *fakeResult) LastInsertId() (int64, error) { return 0, nil }
func (r *fakeResult) RowsAffected() (int64, error) { return r.affected, nil }

// ---------------------------------------------------------------------------
// Mock db.Driver (our interface, not database/sql/driver)
// ---------------------------------------------------------------------------

type mockDriver struct {
	openErr           error
	serverVersion     string
	serverVersionErr  error
	listDBsResult     []DatabaseInfo
	listDBsErr        error
	listSchemasResult []string
	listSchemasErr    error
	listTablesResult  []TableInfo
	listTablesErr     error
	describeResult    []ColumnInfo
	describeErr       error
	listIndexesResult []IndexInfo
	listIndexesErr    error
}

func (m *mockDriver) Open(p Profile) (*sql.DB, error) {
	if m.openErr != nil {
		return nil, m.openErr
	}
	ensureFakeDriverRegistered()
	db, err := sql.Open(fakeDriverName, "")
	if err != nil {
		return nil, err
	}
	return db, nil
}

func (m *mockDriver) ServerVersion(db *sql.DB) (string, error) {
	return m.serverVersion, m.serverVersionErr
}

func (m *mockDriver) ListDatabases(db *sql.DB) ([]DatabaseInfo, error) {
	return m.listDBsResult, m.listDBsErr
}

func (m *mockDriver) ListSchemas(db *sql.DB) ([]string, error) {
	return m.listSchemasResult, m.listSchemasErr
}

func (m *mockDriver) ListTables(db *sql.DB, schema string) ([]TableInfo, error) {
	return m.listTablesResult, m.listTablesErr
}

func (m *mockDriver) DescribeTable(db *sql.DB, schema, table string) ([]ColumnInfo, error) {
	return m.describeResult, m.describeErr
}

func (m *mockDriver) ListIndexes(db *sql.DB, schema, table string) ([]IndexInfo, error) {
	return m.listIndexesResult, m.listIndexesErr
}

// ---------------------------------------------------------------------------
// Registry cleanup helper
// ---------------------------------------------------------------------------

// registerMockDriver registers d under name and removes it when the test ends.
func registerMockDriver(t *testing.T, name string, d Driver) {
	t.Helper()
	Register(name, d)
	t.Cleanup(func() {
		registryMu.Lock()
		delete(registry, name)
		registryMu.Unlock()
	})
}

// ---------------------------------------------------------------------------
// Common test fixtures
// ---------------------------------------------------------------------------

func newTestManager(t *testing.T) *Manager {
	t.Helper()
	return NewManager()
}

func sampleProfile(id, driverName string) Profile {
	return Profile{
		ID:     id,
		Driver: driverName,
		Host:   "localhost",
		Port:   5432,
		User:   "admin",
	}
}
