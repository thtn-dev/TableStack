package db

import (
	"context"
	"database/sql"
	"fmt"
	"sync"
)

type Manager struct {
	mu          sync.RWMutex
	connections map[string]*Connection
	cache       *SchemaCache
	onDDL       func(connID string) // optional callback, called after DDL execution
}

type Connection struct {
	ID      string
	Profile Profile
	DB      *sql.DB
	Driver  Driver
}

func NewManager() *Manager {
	return &Manager{
		connections: make(map[string]*Connection),
		cache:       NewSchemaCache(0), // uses default 5-minute TTL
	}
}

// SetDDLCallback registers an optional callback that is invoked whenever a
// DDL statement is executed successfully. The callback receives the connID and
// runs synchronously in the ExecuteQuery call — keep it non-blocking.
func (m *Manager) SetDDLCallback(fn func(connID string)) {
	m.onDDL = fn
}

func (m *Manager) Add(profile Profile) error {
	driver := profile.Driver
	if driver == "" {
		driver = "postgres"
	}

	drv, err := GetDriver(driver)
	if err != nil {
		return err
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	if old, ok := m.connections[profile.ID]; ok {
		_ = old.DB.Close()
		delete(m.connections, profile.ID)
	}

	db, err := drv.Open(profile)
	if err != nil {
		return fmt.Errorf("open connection: %w", err)
	}

	m.connections[profile.ID] = &Connection{
		ID:      profile.ID,
		Profile: profile,
		DB:      db,
		Driver:  drv,
	}
	return nil
}

func (m *Manager) Get(id string) (*Connection, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	conn, ok := m.connections[id]
	if !ok {
		return nil, fmt.Errorf("connection %q not found or not active", id)
	}
	return conn, nil
}

func (m *Manager) Remove(id string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if conn, ok := m.connections[id]; ok {
		_ = conn.DB.Close()
		delete(m.connections, id)
	}
	m.cache.Invalidate(id)
}

func (m *Manager) IsActive(id string) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()

	conn, ok := m.connections[id]
	if !ok {
		return false
	}
	return conn.DB.Ping() == nil
}

func (m *Manager) ActiveIDs() []string {
	m.mu.RLock()
	defer m.mu.RUnlock()

	ids := make([]string, 0, len(m.connections))
	for id := range m.connections {
		ids = append(ids, id)
	}
	return ids
}

func (m *Manager) CloseAll() {
	m.mu.Lock()
	defer m.mu.Unlock()

	for id, conn := range m.connections {
		_ = conn.DB.Close()
		delete(m.connections, id)
	}
	m.cache.InvalidateAll()
}

// GetSchema returns the full SchemaResult for connID. Results are cached with
// a TTL of 5 minutes; use RefreshSchema to bypass the cache.
func (m *Manager) GetSchema(connID string) (*SchemaResult, error) {
	if result, ok := m.cache.Get(connID); ok {
		return result, nil
	}

	conn, err := m.Get(connID)
	if err != nil {
		return nil, err
	}

	si, ok := conn.Driver.(SchemaIntrospector)
	if !ok {
		return nil, fmt.Errorf("driver %T does not support schema introspection", conn.Driver)
	}

	result, err := si.IntrospectSchema(context.Background(), conn.DB)
	if err != nil {
		return nil, fmt.Errorf("introspect schema: %w", err)
	}

	m.cache.Set(connID, result)
	return result, nil
}

// RefreshSchema invalidates the cache for connID and fetches a fresh
// SchemaResult from the database.
func (m *Manager) RefreshSchema(connID string) (*SchemaResult, error) {
	m.cache.Invalidate(connID)
	return m.GetSchema(connID)
}

// GetDialectInfo returns the static DialectInfo for the driver associated with
// connID. Returns an empty DialectInfo if the driver does not implement
// DialectProvider.
func (m *Manager) GetDialectInfo(connID string) (*DialectInfo, error) {
	conn, err := m.Get(connID)
	if err != nil {
		return nil, err
	}
	dp, ok := conn.Driver.(DialectProvider)
	if !ok {
		return &DialectInfo{ProviderType: conn.Profile.Driver}, nil
	}
	return dp.GetDialectInfo(), nil
}

func (m *Manager) ListDatabases(connID string) ([]DatabaseInfo, error) {
	conn, err := m.Get(connID)
	if err != nil {
		return nil, err
	}
	return conn.Driver.ListDatabases(conn.DB)
}

func (m *Manager) ListSchemas(connID string) ([]string, error) {
	conn, err := m.Get(connID)
	if err != nil {
		return nil, err
	}
	return conn.Driver.ListSchemas(conn.DB)
}

func (m *Manager) ListTables(connID, schema string) ([]TableInfo, error) {
	conn, err := m.Get(connID)
	if err != nil {
		return nil, err
	}
	return conn.Driver.ListTables(conn.DB, schema)
}

func (m *Manager) DescribeTable(connID, schema, table string) ([]ColumnInfo, error) {
	conn, err := m.Get(connID)
	if err != nil {
		return nil, err
	}
	return conn.Driver.DescribeTable(conn.DB, schema, table)
}

func (m *Manager) ListIndexes(connID, schema, table string) ([]IndexInfo, error) {
	conn, err := m.Get(connID)
	if err != nil {
		return nil, err
	}
	return conn.Driver.ListIndexes(conn.DB, schema, table)
}
