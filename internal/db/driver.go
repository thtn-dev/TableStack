package db

import (
	"database/sql"
	"fmt"
	"sync"
)

type Driver interface {
	Open(p Profile) (*sql.DB, error)
	ServerVersion(db *sql.DB) (string, error)
	SchemaExplorer
}

type SchemaExplorer interface {
	ListDatabases(db *sql.DB) ([]DatabaseInfo, error)
	ListSchemas(db *sql.DB) ([]string, error)
	ListTables(db *sql.DB, schema string) ([]TableInfo, error)
	DescribeTable(db *sql.DB, schema, table string) ([]ColumnInfo, error)
	ListIndexes(db *sql.DB, schema, table string) ([]IndexInfo, error)
}

var (
	registryMu sync.RWMutex
	registry   = make(map[string]Driver)
)

func Register(name string, d Driver) {
	registryMu.Lock()
	defer registryMu.Unlock()
	if _, dup := registry[name]; dup {
		panic(fmt.Sprintf("db: driver %q already registered", name))
	}
	registry[name] = d
}

func GetDriver(name string) (Driver, error) {
	registryMu.RLock()
	defer registryMu.RUnlock()
	d, ok := registry[name]
	if !ok {
		return nil, fmt.Errorf("db: unknown driver %q", name)
	}
	return d, nil
}

func RegisteredDrivers() []string {
	registryMu.RLock()
	defer registryMu.RUnlock()
	names := make([]string, 0, len(registry))
	for name := range registry {
		names = append(names, name)
	}
	return names
}
