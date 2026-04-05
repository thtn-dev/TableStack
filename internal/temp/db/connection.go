package db

import "fmt"

// Profile lưu thông tin kết nối — thêm trường Driver để chọn provider.
type Profile struct {
	ID       string `json:"id"`
	Name     string `json:"name"`   // tên hiển thị, vd: "Production DB"
	Driver   string `json:"driver"` // "postgres" | "mysql" | "sqlite" | ...
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
	Version string `json:"version"`
}

// TestProfile thử kết nối mà không lưu vào manager.
// Tự động resolve driver từ Profile.Driver.
func TestProfile(p Profile) ConnectResult {
	drv, err := GetDriver(p.Driver)
	if err != nil {
		return ConnectResult{Success: false, Message: err.Error()}
	}

	db, err := drv.Open(p)
	if err != nil {
		return ConnectResult{Success: false, Message: err.Error()}
	}
	defer db.Close()

	version, err := drv.ServerVersion(db)
	if err != nil {
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
