package main

import (
	"context"

	"table_stack/internal/db"
	"table_stack/internal/store"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App là struct chính expose ra Wails
type App struct {
	ctx      context.Context
	manager  *db.Manager
	profiles *store.ProfileStore
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.manager = db.NewManager()

	var err error
	a.profiles, err = store.NewProfileStore("dbclient") // tên app
	if err != nil {
		// Không thể panic trong startup — log ra stderr
		runtime.LogErrorf(ctx, "init profile store: %v\n", err)
	}
}

func (a *App) shutdown(ctx context.Context) {
	a.manager.CloseAll()
}

// =============================================================================
// Connection Profile Management
// =============================================================================

// SaveProfile thêm mới hoặc cập nhật profile
// Truyền profile.ID rỗng để tạo mới, có ID để update
func (a *App) SaveProfile(p store.Profile) (store.Profile, error) {
	return a.profiles.Save(p)
}

// DeleteProfile xoá profile và disconnect nếu đang active
func (a *App) DeleteProfile(id string) error {
	a.manager.Remove(id) // disconnect nếu có
	return a.profiles.Delete(id)
}

// ListProfiles trả về tất cả profiles (password đã mask)
func (a *App) ListProfiles() []store.Profile {
	return a.profiles.GetAll()
}

// =============================================================================
// Connection Actions
// =============================================================================

// TestConnection thử kết nối mà không lưu vào active connections
func (a *App) TestConnection(p store.Profile) db.ConnectResult {
	return db.TestProfile(storeToDBProfile(p))
}

// Connect kết nối theo profileID đã lưu
func (a *App) Connect(profileID string) error {
	p, err := a.profiles.GetByID(profileID)
	if err != nil {
		return err
	}
	return a.manager.Add(storeToDBProfile(p))
}

// Disconnect đóng connection
func (a *App) Disconnect(profileID string) {
	a.manager.Remove(profileID)
}

// IsConnected kiểm tra connection còn sống không
func (a *App) IsConnected(profileID string) bool {
	return a.manager.IsActive(profileID)
}

// ActiveConnections trả về list profileID đang connected
func (a *App) ActiveConnections() []string {
	return a.manager.ActiveIDs()
}

// =============================================================================
// Schema Explorer
// =============================================================================

// ListDatabases trả về tất cả databases (cần connect trước)
func (a *App) ListDatabases(profileID string) ([]db.DatabaseInfo, error) {
	return a.manager.ListDatabases(profileID)
}

// ListSchemas trả về tất cả schemas trong database hiện tại
func (a *App) ListSchemas(profileID string) ([]string, error) {
	return a.manager.ListSchemas(profileID)
}

// ListTables trả về tables + views trong 1 schema
func (a *App) ListTables(profileID, schema string) ([]db.TableInfo, error) {
	return a.manager.ListTables(profileID, schema)
}

// DescribeTable trả về columns của 1 table
func (a *App) DescribeTable(profileID, schema, table string) ([]db.ColumnInfo, error) {
	return a.manager.DescribeTable(profileID, schema, table)
}

// ListIndexes trả về indexes của 1 table
func (a *App) ListIndexes(profileID, schema, table string) ([]db.IndexInfo, error) {
	return a.manager.ListIndexes(profileID, schema, table)
}

// ExecuteQuery thực thi raw SQL
func (a *App) ExecuteQuery(profileID, sqlStr string) (*db.QueryResult, error) {
	return a.manager.ExecuteQuery(profileID, sqlStr)
}

// =============================================================================
// Helpers
// =============================================================================

// storeToDBProfile convert store.Profile → db.Profile
// (tách 2 package để tránh circular import)
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
