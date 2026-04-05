package db

import (
	"database/sql"
	"fmt"
	"sync"
)

// Manager quản lý tất cả active connections
type Manager struct {
	mu          sync.RWMutex
	connections map[string]*Connection
}

// Connection wrap *sql.DB kèm metadata và driver tương ứng
type Connection struct {
	ID      string
	Profile Profile
	DB      *sql.DB
	Driver  Driver // driver đã resolve — dùng để gọi schema methods
}

func NewManager() *Manager {
	return &Manager{
		connections: make(map[string]*Connection),
	}
}

// Add mở connection mới thông qua driver tương ứng và lưu vào map
func (m *Manager) Add(profile Profile) error {
	drv, err := GetDriver(profile.Driver)
	if err != nil {
		return err
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	// Đóng connection cũ nếu đã tồn tại
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

// Get trả về connection theo ID
func (m *Manager) Get(id string) (*Connection, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	conn, ok := m.connections[id]
	if !ok {
		return nil, fmt.Errorf("connection %q not found or not active", id)
	}
	return conn, nil
}

// Remove đóng và xoá connection
func (m *Manager) Remove(id string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if conn, ok := m.connections[id]; ok {
		_ = conn.DB.Close()
		delete(m.connections, id)
	}
}

// IsActive kiểm tra connection còn sống không
func (m *Manager) IsActive(id string) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()

	conn, ok := m.connections[id]
	if !ok {
		return false
	}
	return conn.DB.Ping() == nil
}

// ActiveIDs trả về danh sách ID đang connected
func (m *Manager) ActiveIDs() []string {
	m.mu.RLock()
	defer m.mu.RUnlock()

	ids := make([]string, 0, len(m.connections))
	for id := range m.connections {
		ids = append(ids, id)
	}
	return ids
}

// CloseAll đóng tất cả connections — gọi khi app shutdown
func (m *Manager) CloseAll() {
	m.mu.Lock()
	defer m.mu.Unlock()

	for id, conn := range m.connections {
		_ = conn.DB.Close()
		delete(m.connections, id)
	}
}

// ---- Schema façade — delegate sang driver ----

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
