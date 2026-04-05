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

// Connection wrap *sql.DB kèm metadata
type Connection struct {
	ID      string
	Profile Profile
	DB      *sql.DB
}

func NewManager() *Manager {
	return &Manager{
		connections: make(map[string]*Connection),
	}
}

// Add mở connection mới và lưu vào map
func (m *Manager) Add(profile Profile) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Nếu đã tồn tại thì đóng cái cũ trước
	if old, ok := m.connections[profile.ID]; ok {
		_ = old.DB.Close()
		delete(m.connections, profile.ID)
	}

	db, err := openPostgres(profile)
	if err != nil {
		return fmt.Errorf("open connection: %w", err)
	}

	m.connections[profile.ID] = &Connection{
		ID:      profile.ID,
		Profile: profile,
		DB:      db,
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
