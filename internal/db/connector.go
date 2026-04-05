package db

import (
	"database/sql"
	"fmt"
	"time"

	_ "github.com/lib/pq"
)

// Profile lưu thông tin kết nối
type Profile struct {
	ID       string `json:"id"`
	Name     string `json:"name"` // tên hiển thị, vd: "Production DB"
	Host     string `json:"host"`
	Port     int    `json:"port"`
	User     string `json:"user"`
	Password string `json:"password"` // TODO: encrypt sau
	Database string `json:"database"`
	SSLMode  string `json:"sslMode"` // disable | require | verify-full
}

// ConnectResult trả về khi test/open connection
type ConnectResult struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	Version string `json:"version"` // PostgreSQL version string
}

// openPostgres mở connection thực sự, trả về *sql.DB đã Ping
func openPostgres(p Profile) (*sql.DB, error) {
	sslMode := p.SSLMode
	if sslMode == "" {
		sslMode = "disable"
	}

	dsn := fmt.Sprintf(
		"host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
		p.Host, p.Port, p.User, p.Password, p.Database, sslMode,
	)

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, fmt.Errorf("sql.Open: %w", err)
	}

	// Cấu hình connection pool
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(3)
	db.SetConnMaxLifetime(30 * time.Minute)
	db.SetConnMaxIdleTime(5 * time.Minute)

	// Verify connection ngay lập tức
	if err := db.Ping(); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("ping failed: %w", err)
	}

	return db, nil
}

// TestProfile thử kết nối mà không lưu vào manager
func TestProfile(p Profile) ConnectResult {
	db, err := openPostgres(p)
	if err != nil {
		return ConnectResult{
			Success: false,
			Message: err.Error(),
		}
	}
	defer db.Close()

	// Lấy version để confirm
	var version string
	if err := db.QueryRow("SELECT version()").Scan(&version); err != nil {
		return ConnectResult{
			Success: false,
			Message: fmt.Sprintf("query version failed: %s", err),
		}
	}

	return ConnectResult{
		Success: true,
		Message: "Connection successful",
		Version: version,
	}
}
