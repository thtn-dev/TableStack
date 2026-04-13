package db

import (
	"fmt"
	"sort"
	"strings"
	"sync"
	"testing"
)

func TestNewManager_Empty(t *testing.T) {
	m := newTestManager(t)
	ids := m.ActiveIDs()
	if len(ids) != 0 {
		t.Errorf("expected 0 active connections, got %d", len(ids))
	}
}

func TestManager_Add_Success(t *testing.T) {
	md := &mockDriver{}
	registerMockDriver(t, "add-success-driver", md)

	m := newTestManager(t)
	p := sampleProfile("conn-1", "add-success-driver")

	if err := m.Add(p); err != nil {
		t.Fatalf("Add: %v", err)
	}

	conn, err := m.Get("conn-1")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if conn.ID != "conn-1" {
		t.Errorf("ID: got %q, want %q", conn.ID, "conn-1")
	}
	if conn.Profile != p {
		t.Errorf("Profile mismatch")
	}
	if conn.DB == nil {
		t.Error("DB should not be nil")
	}
	if conn.Driver != md {
		t.Error("Driver should be the registered mockDriver instance")
	}
}

func TestManager_Add_UnknownDriver(t *testing.T) {
	m := newTestManager(t)
	p := sampleProfile("conn-x", "totally-unknown-driver")

	err := m.Add(p)
	if err == nil {
		t.Fatal("expected error for unknown driver")
	}
	if !strings.Contains(err.Error(), "unknown driver") {
		t.Errorf("error %q does not contain \"unknown driver\"", err.Error())
	}

	_, getErr := m.Get("conn-x")
	if getErr == nil {
		t.Error("connection should not have been stored")
	}
}

func TestManager_Add_OpenError(t *testing.T) {
	md := &mockDriver{openErr: fmt.Errorf("connection refused")}
	registerMockDriver(t, "open-error-driver", md)

	m := newTestManager(t)
	err := m.Add(sampleProfile("conn-fail", "open-error-driver"))
	if err == nil {
		t.Fatal("expected error when Open fails")
	}
	if !strings.Contains(err.Error(), "open connection") {
		t.Errorf("error %q does not contain \"open connection\"", err.Error())
	}

	_, getErr := m.Get("conn-fail")
	if getErr == nil {
		t.Error("connection should not have been stored after open failure")
	}
}

func TestManager_Add_DefaultDriverIsPostgres(t *testing.T) {
	// Register a mock under "postgres" to intercept the default routing.
	md := &mockDriver{}
	registerMockDriver(t, "postgres", md)

	m := newTestManager(t)
	// Profile.Driver is empty — should default to "postgres".
	p := Profile{ID: "conn-default", Host: "localhost", Port: 5432}

	if err := m.Add(p); err != nil {
		t.Fatalf("Add with default driver: %v", err)
	}

	conn, err := m.Get("conn-default")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if conn.Driver != md {
		t.Error("expected the 'postgres' mockDriver to be used for empty Driver field")
	}
}

func TestManager_Add_ReplacesExisting(t *testing.T) {
	md := &mockDriver{}
	registerMockDriver(t, "replace-driver", md)

	m := newTestManager(t)
	m.Add(sampleProfile("same-id", "replace-driver"))
	conn1, _ := m.Get("same-id")
	db1 := conn1.DB

	// Add again with the same ID — should replace.
	m.Add(sampleProfile("same-id", "replace-driver"))
	conn2, _ := m.Get("same-id")

	if conn2.DB == db1 {
		t.Error("expected a new *sql.DB after re-adding same connection ID")
	}
	if len(m.ActiveIDs()) != 1 {
		t.Errorf("expected 1 active ID after replace, got %d", len(m.ActiveIDs()))
	}
}

func TestManager_Get_NotFound(t *testing.T) {
	m := newTestManager(t)
	_, err := m.Get("ghost")
	if err == nil {
		t.Fatal("expected error for unknown connection ID")
	}
	if !strings.Contains(err.Error(), "not found or not active") {
		t.Errorf("error %q does not contain \"not found or not active\"", err.Error())
	}
}

func TestManager_Remove_ExistingConnection(t *testing.T) {
	md := &mockDriver{}
	registerMockDriver(t, "remove-driver", md)

	m := newTestManager(t)
	m.Add(sampleProfile("rem-1", "remove-driver"))
	m.Remove("rem-1")

	_, err := m.Get("rem-1")
	if err == nil {
		t.Error("Get should return error after Remove")
	}
	for _, id := range m.ActiveIDs() {
		if id == "rem-1" {
			t.Error("removed ID still appears in ActiveIDs")
		}
	}
}

func TestManager_Remove_NonExistentID(t *testing.T) {
	m := newTestManager(t)
	// Should be a no-op — no panic.
	m.Remove("does-not-exist")
}

func TestManager_IsActive_True(t *testing.T) {
	md := &mockDriver{}
	registerMockDriver(t, "active-driver", md)

	m := newTestManager(t)
	m.Add(sampleProfile("active-1", "active-driver"))

	if !m.IsActive("active-1") {
		t.Error("expected IsActive to return true for a connected profile")
	}
}

func TestManager_IsActive_False_Missing(t *testing.T) {
	m := newTestManager(t)
	if m.IsActive("no-such") {
		t.Error("expected IsActive to return false for unknown ID")
	}
}

func TestManager_ActiveIDs_ReturnsAll(t *testing.T) {
	md := &mockDriver{}
	registerMockDriver(t, "ids-driver", md)

	m := newTestManager(t)
	m.Add(sampleProfile("a", "ids-driver"))
	m.Add(sampleProfile("b", "ids-driver"))
	m.Add(sampleProfile("c", "ids-driver"))

	ids := m.ActiveIDs()
	sort.Strings(ids)

	if len(ids) != 3 {
		t.Fatalf("expected 3 IDs, got %d: %v", len(ids), ids)
	}
	if ids[0] != "a" || ids[1] != "b" || ids[2] != "c" {
		t.Errorf("IDs: got %v, want [a b c]", ids)
	}
}

func TestManager_CloseAll(t *testing.T) {
	md := &mockDriver{}
	registerMockDriver(t, "closeall-driver", md)

	m := newTestManager(t)
	m.Add(sampleProfile("ca-1", "closeall-driver"))
	m.Add(sampleProfile("ca-2", "closeall-driver"))
	m.Add(sampleProfile("ca-3", "closeall-driver"))

	m.CloseAll()

	if len(m.ActiveIDs()) != 0 {
		t.Errorf("expected 0 active IDs after CloseAll, got %d", len(m.ActiveIDs()))
	}
	if _, err := m.Get("ca-1"); err == nil {
		t.Error("Get should return error after CloseAll")
	}
}

func TestManager_ListDatabases_Delegates(t *testing.T) {
	expected := []DatabaseInfo{{Name: "mydb"}, {Name: "testdb"}}
	md := &mockDriver{listDBsResult: expected}
	registerMockDriver(t, "listdbs-driver", md)

	m := newTestManager(t)
	m.Add(sampleProfile("ld-conn", "listdbs-driver"))

	dbs, err := m.ListDatabases("ld-conn")
	if err != nil {
		t.Fatalf("ListDatabases: %v", err)
	}
	if len(dbs) != len(expected) {
		t.Fatalf("expected %d databases, got %d", len(expected), len(dbs))
	}
	for i, db := range dbs {
		if db.Name != expected[i].Name {
			t.Errorf("db[%d].Name: got %q, want %q", i, db.Name, expected[i].Name)
		}
	}
}

func TestManager_ListDatabases_NoConnection(t *testing.T) {
	m := newTestManager(t)
	_, err := m.ListDatabases("nonexistent")
	if err == nil {
		t.Fatal("expected error for unknown connection")
	}
	if !strings.Contains(err.Error(), "not found") {
		t.Errorf("error %q does not contain \"not found\"", err.Error())
	}
}

func TestManager_SchemaExplorer_ErrorPropagation(t *testing.T) {
	schemaErr := fmt.Errorf("schema query failed")

	cases := []struct {
		name string
		md   *mockDriver
		call func(m *Manager, connID string) error
	}{
		{
			name: "ListSchemas",
			md:   &mockDriver{listSchemasErr: schemaErr},
			call: func(m *Manager, id string) error { _, err := m.ListSchemas(id); return err },
		},
		{
			name: "ListTables",
			md:   &mockDriver{listTablesErr: schemaErr},
			call: func(m *Manager, id string) error { _, err := m.ListTables(id, "public"); return err },
		},
		{
			name: "DescribeTable",
			md:   &mockDriver{describeErr: schemaErr},
			call: func(m *Manager, id string) error { _, err := m.DescribeTable(id, "public", "users"); return err },
		},
		{
			name: "ListIndexes",
			md:   &mockDriver{listIndexesErr: schemaErr},
			call: func(m *Manager, id string) error { _, err := m.ListIndexes(id, "public", "users"); return err },
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			driverName := "err-prop-" + tc.name
			registerMockDriver(t, driverName, tc.md)

			m := newTestManager(t)
			connID := "conn-" + tc.name
			m.Add(sampleProfile(connID, driverName))

			err := tc.call(m, connID)
			if err == nil {
				t.Fatalf("%s: expected error to be propagated", tc.name)
			}
			if !strings.Contains(err.Error(), "schema query failed") {
				t.Errorf("%s: error %q should contain \"schema query failed\"", tc.name, err.Error())
			}
		})
	}
}

func TestManager_Concurrency(t *testing.T) {
	md := &mockDriver{}
	registerMockDriver(t, "concurrent-manager-driver", md)

	m := newTestManager(t)

	const goroutines = 20
	var wg sync.WaitGroup
	wg.Add(goroutines)

	for g := 0; g < goroutines; g++ {
		go func(g int) {
			defer wg.Done()
			id := fmt.Sprintf("concurrent-conn-%d", g%5)
			p := sampleProfile(id, "concurrent-manager-driver")

			switch g % 4 {
			case 0:
				_ = m.Add(p)
			case 1:
				_, _ = m.Get(id)
			case 2:
				_ = m.ActiveIDs()
			case 3:
				m.Remove(id)
			}
		}(g)
	}

	wg.Wait()
	// No assertions beyond "no panic" — correctness is verified by -race.
}
