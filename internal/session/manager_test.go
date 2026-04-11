package session

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

func newTestManager(t *testing.T) *SessionManager {
	t.Helper()
	sm, err := NewSessionManager(t.TempDir())
	if err != nil {
		t.Fatalf("NewSessionManager: %v", err)
	}
	return sm
}

func sampleSession(connID string) WorkspaceSession {
	return WorkspaceSession{
		ActiveConnectionID: connID,
		ActiveTabID:        "tab-1",
		Tabs: []QueryTab{
			{
				ID:           "tab-1",
				ConnectionID: connID,
				Title:        "Query 1",
				Content:      "SELECT 1",
				FilePath:     nil,
				IsDirty:      false,
				CursorPos:    CursorPos{Line: 0, Column: 8},
				CreatedAt:    1000,
				Order:        0,
			},
		},
	}
}

func TestSave_NewSession(t *testing.T) {
	sm := newTestManager(t)
	sess := sampleSession("conn-1")

	if err := sm.Save("conn-1", sess); err != nil {
		t.Fatalf("Save: %v", err)
	}

	path := sm.filePath("conn-1")
	if _, err := os.Stat(path); os.IsNotExist(err) {
		t.Fatalf("expected session file at %s, not found", path)
	}

	data, _ := os.ReadFile(path)
	var loaded WorkspaceSession
	if err := json.Unmarshal(data, &loaded); err != nil {
		t.Fatalf("json.Unmarshal: %v", err)
	}
	if loaded.ActiveTabID != "tab-1" {
		t.Errorf("got ActiveTabID=%q, want %q", loaded.ActiveTabID, "tab-1")
	}
	if len(loaded.Tabs) != 1 {
		t.Errorf("got %d tabs, want 1", len(loaded.Tabs))
	}
}

func TestSave_OverwriteExisting(t *testing.T) {
	sm := newTestManager(t)
	sess := sampleSession("conn-2")

	// First save
	if err := sm.Save("conn-2", sess); err != nil {
		t.Fatalf("Save 1: %v", err)
	}

	before := time.Now().Unix()
	// Small delay to ensure timestamp changes
	time.Sleep(2 * time.Millisecond)

	// Second save with modified content
	sess.Tabs[0].Content = "SELECT 2"
	if err := sm.Save("conn-2", sess); err != nil {
		t.Fatalf("Save 2: %v", err)
	}

	data, _ := os.ReadFile(sm.filePath("conn-2"))
	var loaded WorkspaceSession
	json.Unmarshal(data, &loaded)

	if loaded.Tabs[0].Content != "SELECT 2" {
		t.Errorf("content not updated: got %q", loaded.Tabs[0].Content)
	}
	if loaded.LastSavedAt < before {
		t.Errorf("LastSavedAt not updated: got %d, want >= %d", loaded.LastSavedAt, before)
	}
}

func TestSave_AtomicWrite(t *testing.T) {
	sm := newTestManager(t)
	sess := sampleSession("conn-3")

	if err := sm.Save("conn-3", sess); err != nil {
		t.Fatalf("Save: %v", err)
	}

	// .tmp file should not exist after successful save
	tmpPath := sm.filePath("conn-3") + ".tmp"
	if _, err := os.Stat(tmpPath); !os.IsNotExist(err) {
		t.Errorf("tmp file still exists after save: %s", tmpPath)
	}
}

func TestLoad_ExistingSession(t *testing.T) {
	sm := newTestManager(t)
	sess := sampleSession("conn-4")
	sess.Tabs[0].Content = "SELECT * FROM users"

	sm.Save("conn-4", sess)

	loaded, err := sm.Load("conn-4")
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if loaded.ActiveTabID != "tab-1" {
		t.Errorf("got ActiveTabID=%q, want %q", loaded.ActiveTabID, "tab-1")
	}
	if loaded.Tabs[0].Content != "SELECT * FROM users" {
		t.Errorf("got content=%q, want %q", loaded.Tabs[0].Content, "SELECT * FROM users")
	}
}

func TestLoad_FileNotExist(t *testing.T) {
	sm := newTestManager(t)

	loaded, err := sm.Load("nonexistent-conn")
	if err != nil {
		t.Fatalf("Load returned error for nonexistent file: %v", err)
	}
	if loaded == nil {
		t.Fatal("Load returned nil session")
	}
	if len(loaded.Tabs) != 1 {
		t.Errorf("default session should have 1 tab, got %d", len(loaded.Tabs))
	}
	if loaded.Tabs[0].Title != "Query 1" {
		t.Errorf("default tab title: got %q, want %q", loaded.Tabs[0].Title, "Query 1")
	}
}

func TestLoad_CorruptJSON(t *testing.T) {
	sm := newTestManager(t)

	// Write invalid JSON directly
	path := sm.filePath("corrupt-conn")
	os.WriteFile(path, []byte("not valid json {{{"), 0600)

	loaded, err := sm.Load("corrupt-conn")
	if err != nil {
		t.Fatalf("Load should not return error for corrupt JSON, got: %v", err)
	}
	if loaded == nil {
		t.Fatal("Load returned nil for corrupt JSON")
	}
	// Should return default session
	if len(loaded.Tabs) != 1 {
		t.Errorf("expected default session (1 tab), got %d tabs", len(loaded.Tabs))
	}
}

func TestDelete_ExistingFile(t *testing.T) {
	sm := newTestManager(t)
	sess := sampleSession("conn-del")
	sm.Save("conn-del", sess)

	path := sm.filePath("conn-del")
	if _, err := os.Stat(path); os.IsNotExist(err) {
		t.Fatal("session file should exist before delete")
	}

	if err := sm.Delete("conn-del"); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Errorf("session file should not exist after delete")
	}
}

func TestDelete_NonExistentFile(t *testing.T) {
	sm := newTestManager(t)

	// Should not return error
	if err := sm.Delete("does-not-exist"); err != nil {
		t.Errorf("Delete of nonexistent file should not error, got: %v", err)
	}
}

func TestConcurrency(t *testing.T) {
	sm := newTestManager(t)

	const goroutines = 20
	var wg sync.WaitGroup
	wg.Add(goroutines)

	for i := 0; i < goroutines; i++ {
		go func(i int) {
			defer wg.Done()
			sess := sampleSession("shared-conn")
			sess.Tabs[0].Content = filepath.Join("query", string(rune('A'+i)))

			if err := sm.Save("shared-conn", sess); err != nil {
				t.Errorf("Save: %v", err)
			}
			if _, err := sm.Load("shared-conn"); err != nil {
				t.Errorf("Load: %v", err)
			}
		}(i)
	}
	wg.Wait()
}

func TestDefaultSession(t *testing.T) {
	sm := newTestManager(t)
	def := sm.defaultSession("test-conn")

	if def == nil {
		t.Fatal("defaultSession returned nil")
	}
	if len(def.Tabs) != 1 {
		t.Fatalf("expected 1 tab, got %d", len(def.Tabs))
	}
	tab := def.Tabs[0]
	if tab.Title != "Query 1" {
		t.Errorf("default tab title: got %q, want %q", tab.Title, "Query 1")
	}
	if tab.ID == "" {
		t.Error("tab ID should not be empty")
	}
	if def.ActiveTabID != tab.ID {
		t.Errorf("ActiveTabID=%q should equal tab.ID=%q", def.ActiveTabID, tab.ID)
	}
	if def.ActiveConnectionID != "test-conn" {
		t.Errorf("ActiveConnectionID=%q, want %q", def.ActiveConnectionID, "test-conn")
	}
}
