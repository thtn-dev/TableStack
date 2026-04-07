package main

import (
	"context"
	"fmt"

	"github.com/thtn-dev/table_stack/internal/db"
	"github.com/thtn-dev/table_stack/internal/store"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// App exposes backend methods to the frontend via Wails bindings.
type App struct {
	ctx      context.Context
	manager  *db.Manager
	profiles *store.ProfileStore
}

func (a *App) ServiceStartup(ctx context.Context, _ application.ServiceOptions) error {
	a.ctx = ctx
	a.manager = db.NewManager()

	profiles, err := store.NewProfileStore("dbclient")
	if err != nil {
		return fmt.Errorf("init profile store: %w", err)
	}
	a.profiles = profiles

	return nil
}

func (a *App) ServiceShutdown() error {
	if a.manager != nil {
		a.manager.CloseAll()
	}
	return nil
}

func (a *App) SaveProfile(p store.Profile) (store.Profile, error) {
	return a.profiles.Save(p)
}

func (a *App) DeleteProfile(id string) error {
	a.manager.Remove(id)
	return a.profiles.Delete(id)
}

func (a *App) ListProfiles() []store.Profile {
	return a.profiles.GetAll()
}

func (a *App) TestConnection(p store.Profile) db.ConnectResult {
	return db.TestProfile(storeToDBProfile(p))
}

func (a *App) Connect(profileID string) error {
	p, err := a.profiles.GetByID(profileID)
	if err != nil {
		return err
	}
	return a.manager.Add(storeToDBProfile(p))
}

func (a *App) Disconnect(profileID string) {
	a.manager.Remove(profileID)
}

func (a *App) IsConnected(profileID string) bool {
	return a.manager.IsActive(profileID)
}

func (a *App) ActiveConnections() []string {
	return a.manager.ActiveIDs()
}

func (a *App) ListDatabases(profileID string) ([]db.DatabaseInfo, error) {
	return a.manager.ListDatabases(profileID)
}

func (a *App) ListSchemas(profileID string) ([]string, error) {
	return a.manager.ListSchemas(profileID)
}

func (a *App) ListTables(profileID, schema string) ([]db.TableInfo, error) {
	return a.manager.ListTables(profileID, schema)
}

func (a *App) DescribeTable(profileID, schema, table string) ([]db.ColumnInfo, error) {
	return a.manager.DescribeTable(profileID, schema, table)
}

func (a *App) ListIndexes(profileID, schema, table string) ([]db.IndexInfo, error) {
	return a.manager.ListIndexes(profileID, schema, table)
}

func (a *App) ExecuteQuery(profileID, sqlStr string) (*db.QueryResult, error) {
	return a.manager.ExecuteQuery(profileID, sqlStr)
}

func storeToDBProfile(p store.Profile) db.Profile {
	return db.Profile{
		ID:       p.ID,
		Name:     p.Name,
		Host:     p.Host,
		Port:     p.Port,
		User:     p.User,
		Password: p.Password,
		Database: p.Database,
		SSLMode:  p.SSLMode,
	}
}

