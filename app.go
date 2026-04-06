package main

import (
	"context"
	"log"

	"table_stack/internal/db"
	"table_stack/internal/store"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// AppService is the primary service exposed to the frontend bindings.
type AppService struct {
	ctx      context.Context
	manager  *db.Manager
	profiles *store.ProfileStore
}

func NewAppService() *AppService {
	return &AppService{}
}

func (a *AppService) ServiceStartup(ctx context.Context, _ application.ServiceOptions) error {
	a.ctx = ctx
	a.manager = db.NewManager()

	var err error
	a.profiles, err = store.NewProfileStore("dbclient") // tên app
	if err != nil {
		log.Printf("init profile store: %v", err)
		return nil
	}

	return nil
}

func (a *AppService) ServiceShutdown() error {
	a.manager.CloseAll()
	return nil
}

// =============================================================================
// Connection Profile Management
// =============================================================================

// SaveProfile thêm mới hoặc cập nhật profile
// Truyền profile.ID rỗng để tạo mới, có ID để update
func (a *AppService) SaveProfile(p store.Profile) (store.Profile, error) {
	return a.profiles.Save(p)
}

// DeleteProfile xoá profile và disconnect nếu đang active
func (a *AppService) DeleteProfile(id string) error {
	a.manager.Remove(id) // disconnect nếu có
	return a.profiles.Delete(id)
}

// ListProfiles trả về tất cả profiles (password đã mask)
func (a *AppService) ListProfiles() []store.Profile {
	return a.profiles.GetAll()
}

// =============================================================================
// Connection Actions
// =============================================================================

// TestConnection thử kết nối mà không lưu vào active connections
func (a *AppService) TestConnection(p store.Profile) db.ConnectResult {
	return db.TestProfile(storeToDBProfile(p))
}

// Connect kết nối theo profileID đã lưu
func (a *AppService) Connect(profileID string) error {
	p, err := a.profiles.GetByID(profileID)
	if err != nil {
		return err
	}
	return a.manager.Add(storeToDBProfile(p))
}

// Disconnect đóng connection
func (a *AppService) Disconnect(profileID string) {
	a.manager.Remove(profileID)
}

// IsConnected kiểm tra connection còn sống không
func (a *AppService) IsConnected(profileID string) bool {
	return a.manager.IsActive(profileID)
}

// ActiveConnections trả về list profileID đang connected
func (a *AppService) ActiveConnections() []string {
	return a.manager.ActiveIDs()
}

// =============================================================================
// Schema Explorer
// =============================================================================

// ListDatabases trả về tất cả databases (cần connect trước)
func (a *AppService) ListDatabases(profileID string) ([]db.DatabaseInfo, error) {
	return a.manager.ListDatabases(profileID)
}

// ListSchemas trả về tất cả schemas trong database hiện tại
func (a *AppService) ListSchemas(profileID string) ([]string, error) {
	return a.manager.ListSchemas(profileID)
}

// ListTables trả về tables + views trong 1 schema
func (a *AppService) ListTables(profileID, schema string) ([]db.TableInfo, error) {
	return a.manager.ListTables(profileID, schema)
}

// DescribeTable trả về columns của 1 table
func (a *AppService) DescribeTable(profileID, schema, table string) ([]db.ColumnInfo, error) {
	return a.manager.DescribeTable(profileID, schema, table)
}

// ListIndexes trả về indexes của 1 table
func (a *AppService) ListIndexes(profileID, schema, table string) ([]db.IndexInfo, error) {
	return a.manager.ListIndexes(profileID, schema, table)
}

// ExecuteQuery thực thi raw SQL
func (a *AppService) ExecuteQuery(profileID, sqlStr string) (*db.QueryResult, error) {
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
