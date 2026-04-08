package db

import "fmt"

type Profile struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Driver   string `json:"driver"`
	Host     string `json:"host"`
	Port     int    `json:"port"`
	User     string `json:"user"`
	Password string `json:"password"`
	Database string `json:"database"`
	SSLMode  string `json:"sslMode"`
}

type ConnectResult struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	Version string `json:"version"`
}

func TestProfile(p Profile) ConnectResult {
	driver := p.Driver
	if driver == "" {
		driver = "postgres"
	}

	drv, err := GetDriver(driver)
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
