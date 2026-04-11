package session

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/google/uuid"
)

// SessionManager đọc/ghi session state ra file JSON với atomic write.
// Mỗi connection profile có một file session riêng.
type SessionManager struct {
	mu         sync.RWMutex
	sessionDir string
}

// NewSessionManager khởi tạo SessionManager với sessionDir là thư mục lưu session.
// Tự tạo thư mục nếu chưa tồn tại.
func NewSessionManager(sessionDir string) (*SessionManager, error) {
	if err := os.MkdirAll(sessionDir, 0700); err != nil {
		return nil, fmt.Errorf("session: mkdir %s: %w", sessionDir, err)
	}
	return &SessionManager{sessionDir: sessionDir}, nil
}

// Save ghi session xuống disk cho connID. Dùng atomic write (tmp → rename)
// để tránh corrupt nếu app crash giữa chừng ghi.
func (sm *SessionManager) Save(connID string, sess WorkspaceSession) error {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	sess.LastSavedAt = time.Now().Unix()

	data, err := json.MarshalIndent(sess, "", "  ")
	if err != nil {
		return fmt.Errorf("session: marshal %s: %w", connID, err)
	}

	target := sm.filePath(connID)
	tmp := target + ".tmp"

	if err := os.WriteFile(tmp, data, 0600); err != nil {
		return fmt.Errorf("session: write tmp %s: %w", connID, err)
	}
	if err := os.Rename(tmp, target); err != nil {
		return fmt.Errorf("session: rename %s: %w", connID, err)
	}
	return nil
}

// Load đọc session của connID. Nếu file không tồn tại hoặc JSON invalid,
// trả về default session (1 tab trống) thay vì error.
func (sm *SessionManager) Load(connID string) (*WorkspaceSession, error) {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	data, err := os.ReadFile(sm.filePath(connID))
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return sm.defaultSession(connID), nil
		}
		return sm.defaultSession(connID), nil
	}

	var sess WorkspaceSession
	if err := json.Unmarshal(data, &sess); err != nil {
		// File bị corrupt — trả về default thay vì crash
		return sm.defaultSession(connID), nil
	}
	return &sess, nil
}

// Delete xóa file session của connID. Không lỗi nếu file không tồn tại.
func (sm *SessionManager) Delete(connID string) error {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	err := os.Remove(sm.filePath(connID))
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("session: delete %s: %w", connID, err)
	}
	return nil
}

// filePath trả về đường dẫn file session cho connID.
func (sm *SessionManager) filePath(connID string) string {
	return filepath.Join(sm.sessionDir, connID+".session.json")
}

// defaultSession tạo một session mặc định với 1 tab trống.
func (sm *SessionManager) defaultSession(connID string) *WorkspaceSession {
	tabID := uuid.NewString()
	now := time.Now().Unix()
	return &WorkspaceSession{
		ActiveConnectionID: connID,
		ActiveTabID:        tabID,
		Tabs: []QueryTab{
			{
				ID:           tabID,
				ConnectionID: connID,
				Title:        "Query 1",
				Content:      "",
				FilePath:     nil,
				IsDirty:      false,
				CursorPos:    CursorPos{Line: 0, Column: 0},
				CreatedAt:    now,
				Order:        0,
			},
		},
		LastSavedAt: 0,
	}
}
