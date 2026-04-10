package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"github.com/thtn-dev/table_stack/internal/db"
	_ "github.com/thtn-dev/table_stack/internal/db/mysql"
	_ "github.com/thtn-dev/table_stack/internal/db/postgres"
	"github.com/thtn-dev/table_stack/internal/store"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// App exposes backend methods to the frontend via Wails bindings.
type App struct {
	ctx         context.Context
	manager     *db.Manager
	profiles    *store.ProfileStore
	credentials *store.CredentialManager
	mu          sync.RWMutex
	activeID    string
	showMain    func() error
}

func (a *App) ServiceStartup(ctx context.Context, _ application.ServiceOptions) error {
	a.ctx = ctx
	a.manager = db.NewManager()

	profiles, err := store.NewProfileStore("dbclient")
	if err != nil {
		return fmt.Errorf("init profile store: %w", err)
	}
	a.profiles = profiles

	// NewProfileStore already created the directory; just compute the path.
	configDir, err := userConfigDir("dbclient")
	if err != nil {
		return fmt.Errorf("config dir: %w", err)
	}
	creds, err := store.NewCredentialManager(filepath.Join(configDir, "connections.json"))
	if err != nil {
		return fmt.Errorf("init credential manager: %w", err)
	}
	a.credentials = creds

	return nil
}

func (a *App) ServiceShutdown() error {
	if a.manager != nil {
		a.manager.CloseAll()
	}
	return nil
}

// SaveProfile persists profile metadata and encrypts the password via the
// OS-keychain-backed CredentialManager. The plaintext password is never
// written to profiles.json.
func (a *App) SaveProfile(p store.Profile) (store.Profile, error) {
	plainPw := p.Password
	p.Password = "" // do not persist plaintext

	saved, err := a.profiles.Save(p)
	if err != nil {
		return store.Profile{}, err
	}

	// Skip credential update when the caller echoes back the display mask or
	// sends an empty password (e.g. editing other fields only).
	if plainPw != "" && plainPw != "********" {
		if err := a.credentials.SaveConnection(profileToConnConfig(saved), plainPw); err != nil {
			return store.Profile{}, fmt.Errorf("save credentials: %w", err)
		}
	}

	return saved, nil
}

// DeleteProfile removes the profile and its stored credential.
func (a *App) DeleteProfile(id string) error {
	a.manager.Remove(id)
	_ = a.credentials.DeleteConnection(id) // best-effort; ignore "not found"
	return a.profiles.Delete(id)
}

// ListProfiles returns all profiles with passwords masked.
func (a *App) ListProfiles() []store.Profile {
	return a.profiles.GetAll()
}

// TestConnection tests connectivity. If the caller omits or masks the password,
// the stored credential is fetched automatically.
func (a *App) TestConnection(p store.Profile) db.ConnectResult {
	if p.Password == "" || p.Password == "********" {
		if pw, err := a.credentials.GetPassword(p.ID); err == nil {
			p.Password = pw
		}
	}
	return db.TestProfile(storeToDBProfile(p))
}

// Connect opens a live connection for profileID, retrieving the decrypted
// password from the CredentialManager.
func (a *App) Connect(profileID string) error {
	p, err := a.profiles.GetByID(profileID)
	if err != nil {
		return err
	}

	if pw, err := a.credentials.GetPassword(profileID); err == nil {
		p.Password = pw
	}

	if err := a.manager.Add(storeToDBProfile(p)); err != nil {
		return err
	}
	a.setActiveProfileID(profileID)
	return nil
}

func (a *App) Disconnect(profileID string) {
	a.manager.Remove(profileID)
	if a.GetLastActiveProfile() != profileID {
		return
	}

	active := a.manager.ActiveIDs()
	if len(active) == 0 {
		a.setActiveProfileID("")
		return
	}
	a.setActiveProfileID(active[0])
}

// SetLastActiveProfile stores the profile that should be focused by the main window.
func (a *App) SetLastActiveProfile(profileID string) {
	a.setActiveProfileID(profileID)
}

// GetLastActiveProfile returns the profile ID selected last across windows.
func (a *App) GetLastActiveProfile() string {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.activeID
}

func (a *App) setActiveProfileID(profileID string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.activeID = profileID
}

func (a *App) IsConnected(profileID string) bool {
	return a.manager.IsActive(profileID)
}

func (a *App) ActiveConnections() []string {
	return a.manager.ActiveIDs()
}

func (a *App) RegisteredDrivers() []string {
	return db.RegisteredDrivers()
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

// ShowMainWindow asks the host process to create/focus the main window.
func (a *App) ShowMainWindow() error {
	if a.showMain == nil {
		return fmt.Errorf("main window launcher is not configured")
	}
	return a.showMain()
}

// ---- CredentialManager bindings -------------------------------------------

// SaveConnection stores a ConnectionConfig with an AES-256-GCM encrypted
// password in the local JSON file. Use this when managing connections
// independently of the Profile system.
func (a *App) SaveConnection(cfg store.ConnectionConfig, plainPassword string) error {
	return a.credentials.SaveConnection(cfg, plainPassword)
}

// GetConnectionPassword decrypts and returns the stored password for
// connectionID. The plaintext is only transmitted over the local IPC bridge.
func (a *App) GetConnectionPassword(connectionID string) (string, error) {
	return a.credentials.GetPassword(connectionID)
}

// ListConnections returns all stored ConnectionConfigs with passwords omitted.
func (a *App) ListConnections() ([]store.ConnectionConfig, error) {
	return a.credentials.ListConnections()
}

// DeleteConnection removes the ConnectionConfig for connectionID.
func (a *App) DeleteConnection(connectionID string) error {
	return a.credentials.DeleteConnection(connectionID)
}

// ---- private helpers ------------------------------------------------------

func storeToDBProfile(p store.Profile) db.Profile {
	return db.Profile{
		ID:       p.ID,
		Name:     p.Name,
		Driver:   p.Driver,
		Host:     p.Host,
		Port:     p.Port,
		User:     p.User,
		Password: p.Password,
		Database: p.Database,
		SSLMode:  p.SSLMode,
	}
}

// profileToConnConfig maps a store.Profile to a store.ConnectionConfig for
// use with CredentialManager. Only metadata fields are copied; EncryptedPassword
// is left empty (the caller supplies the plaintext password separately).
func profileToConnConfig(p store.Profile) store.ConnectionConfig {
	return store.ConnectionConfig{
		ID:     p.ID,
		Name:   p.Name,
		Driver: p.Driver,
		Host:   p.Host,
		Port:   p.Port,
		User:   p.User,
		DBName: p.Database,
	}
}

// userConfigDir returns (and creates) the OS user-config sub-directory for
// appName. Mirrors the unexported profileDir in internal/store.
func userConfigDir(appName string) (string, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("user config dir: %w", err)
	}
	dir := filepath.Join(base, appName)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return "", fmt.Errorf("mkdir %s: %w", dir, err)
	}
	return dir, nil
}
