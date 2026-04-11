// Package session quản lý workspace session cho từng connection profile.
// Mỗi connection có một file session JSON riêng lưu danh sách tabs, content SQL,
// vị trí cursor và tab đang active.
package session

// CursorPos lưu vị trí con trỏ trong editor.
type CursorPos struct {
	Line   int `json:"line"`
	Column int `json:"column"`
}

// QueryTab đại diện cho một tab query trong editor.
type QueryTab struct {
	ID           string    `json:"id"`
	ConnectionID string    `json:"connectionId"`
	Title        string    `json:"title"`
	Content      string    `json:"content"`
	FilePath     *string   `json:"filePath"`
	IsDirty      bool      `json:"isDirty"`
	CursorPos    CursorPos `json:"cursorPos"`
	CreatedAt    int64     `json:"createdAt"`
	Order        int       `json:"order"`
}

// WorkspaceSession là snapshot toàn bộ workspace của một connection.
type WorkspaceSession struct {
	ActiveConnectionID string     `json:"activeConnectionId"`
	ActiveTabID        string     `json:"activeTabId"`
	Tabs               []QueryTab `json:"tabs"`
	LastSavedAt        int64      `json:"lastSavedAt"`
}
