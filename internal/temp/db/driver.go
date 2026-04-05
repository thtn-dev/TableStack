package db

import (
	"database/sql"
	"fmt"
	"sync"
)

// Driver là interface mà mỗi database provider phải implement.
// Khi thêm provider mới (MySQL, SQLite, ...), chỉ cần implement interface này
// rồi gọi Register() trong init().
type Driver interface {
	// Open tạo *sql.DB từ Profile, đã Ping thành công.
	Open(p Profile) (*sql.DB, error)

	// ServerVersion trả về version string (vd: "PostgreSQL 16.2").
	ServerVersion(db *sql.DB) (string, error)

	// SchemaExplorer — tất cả operations liên quan schema introspection.
	SchemaExplorer
}

// SchemaExplorer chứa các method khám phá schema.
// Tách riêng để có thể compose hoặc mock dễ hơn khi test.
type SchemaExplorer interface {
	ListDatabases(db *sql.DB) ([]DatabaseInfo, error)
	ListSchemas(db *sql.DB) ([]string, error)
	ListTables(db *sql.DB, schema string) ([]TableInfo, error)
	DescribeTable(db *sql.DB, schema, table string) ([]ColumnInfo, error)
	ListIndexes(db *sql.DB, schema, table string) ([]IndexInfo, error)
}

// ---- Registry ----

var (
	registryMu sync.RWMutex
	registry   = make(map[string]Driver)
)

// Register đăng ký 1 driver theo tên. Gọi trong init() của mỗi provider package.
//
//	func init() { db.Register("postgres", &PostgresDriver{}) }
func Register(name string, d Driver) {
	registryMu.Lock()
	defer registryMu.Unlock()

	if _, dup := registry[name]; dup {
		panic(fmt.Sprintf("db: driver %q already registered", name))
	}
	registry[name] = d
}

// GetDriver trả về driver đã đăng ký theo tên.
func GetDriver(name string) (Driver, error) {
	registryMu.RLock()
	defer registryMu.RUnlock()

	d, ok := registry[name]
	if !ok {
		return nil, fmt.Errorf("db: unknown driver %q (forgot to import?)", name)
	}
	return d, nil
}

// RegisteredDrivers trả về danh sách tên driver đã đăng ký — hữu ích cho UI.
func RegisteredDrivers() []string {
	registryMu.RLock()
	defer registryMu.RUnlock()

	names := make([]string, 0, len(registry))
	for name := range registry {
		names = append(names, name)
	}
	return names
}
