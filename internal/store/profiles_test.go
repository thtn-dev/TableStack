package store

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"testing"
)

// newTestProfileStore creates an isolated ProfileStore backed by a temp directory.
// It bypasses NewProfileStore (which calls os.UserConfigDir) by directly
// initialising the struct — the same pattern used in credentials_test.go.
func newTestProfileStore(t *testing.T) *ProfileStore {
	t.Helper()
	return &ProfileStore{
		filePath: filepath.Join(t.TempDir(), "profiles.json"),
		profiles: make(map[string]Profile),
	}
}

func sampleProfile(name string) Profile {
	return Profile{
		Name:     name,
		Driver:   "postgres",
		Host:     "localhost",
		Port:     5432,
		User:     "admin",
		Password: "secret123",
		Database: "mydb",
		SSLMode:  "disable",
		Tag:      Tag{Name: "Blue", Color: "#3B82F6"},
	}
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

func TestProfileStore_Save_NewProfile_GeneratesID(t *testing.T) {
	s := newTestProfileStore(t)
	p := sampleProfile("gen-id-conn")
	// ID intentionally empty.

	saved, err := s.Save(p)
	if err != nil {
		t.Fatalf("Save: %v", err)
	}
	if saved.ID == "" {
		t.Fatal("expected non-empty ID to be generated")
	}
	if saved.Name != "gen-id-conn" {
		t.Errorf("Name: got %q, want %q", saved.Name, "gen-id-conn")
	}
}

func TestProfileStore_Save_ExplicitID_Preserved(t *testing.T) {
	s := newTestProfileStore(t)
	p := sampleProfile("explicit-id-conn")
	p.ID = "fixed-uuid-1234"

	saved, err := s.Save(p)
	if err != nil {
		t.Fatalf("Save: %v", err)
	}
	if saved.ID != "fixed-uuid-1234" {
		t.Errorf("ID: got %q, want %q", saved.ID, "fixed-uuid-1234")
	}
}

func TestProfileStore_Save_DefaultTagApplied(t *testing.T) {
	s := newTestProfileStore(t)
	p := sampleProfile("default-tag-conn")
	p.Tag = Tag{} // empty tag

	saved, err := s.Save(p)
	if err != nil {
		t.Fatalf("Save: %v", err)
	}
	if saved.Tag.Name != DefaultTag.Name {
		t.Errorf("Tag.Name: got %q, want %q", saved.Tag.Name, DefaultTag.Name)
	}
	if saved.Tag.Color != DefaultTag.Color {
		t.Errorf("Tag.Color: got %q, want %q", saved.Tag.Color, DefaultTag.Color)
	}
}

func TestProfileStore_Save_DefaultTagColorApplied(t *testing.T) {
	s := newTestProfileStore(t)
	p := sampleProfile("partial-tag-conn")
	p.Tag = Tag{Name: "Custom"} // name set, color empty

	saved, err := s.Save(p)
	if err != nil {
		t.Fatalf("Save: %v", err)
	}
	if saved.Tag.Name != "Custom" {
		t.Errorf("Tag.Name: got %q, want %q", saved.Tag.Name, "Custom")
	}
	if saved.Tag.Color != DefaultTag.Color {
		t.Errorf("Tag.Color: got %q, want %q (default color)", saved.Tag.Color, DefaultTag.Color)
	}
}

func TestProfileStore_Save_Upsert(t *testing.T) {
	s := newTestProfileStore(t)
	p := Profile{ID: "upsert-id", Name: "v1", Driver: "postgres"}
	s.Save(p)

	p.Name = "v2"
	saved, err := s.Save(p)
	if err != nil {
		t.Fatalf("Save upsert: %v", err)
	}
	if saved.Name != "v2" {
		t.Errorf("Name after upsert: got %q, want %q", saved.Name, "v2")
	}

	all := s.GetAll()
	if len(all) != 1 {
		t.Errorf("expected 1 profile after upsert, got %d", len(all))
	}

	got, err := s.GetByID("upsert-id")
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}
	if got.Name != "v2" {
		t.Errorf("GetByID Name: got %q, want %q", got.Name, "v2")
	}
}

func TestProfileStore_Save_PersistsToDisk(t *testing.T) {
	s := newTestProfileStore(t)
	p := sampleProfile("persist-check")
	p.ID = "persist-id"

	if _, err := s.Save(p); err != nil {
		t.Fatalf("Save: %v", err)
	}

	data, err := os.ReadFile(s.filePath)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}

	var list []Profile
	if err := json.Unmarshal(data, &list); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("expected 1 profile on disk, got %d", len(list))
	}
	if list[0].ID != "persist-id" {
		t.Errorf("ID on disk: got %q, want %q", list[0].ID, "persist-id")
	}
}

func TestProfileStore_Save_AtomicWrite(t *testing.T) {
	s := newTestProfileStore(t)
	if _, err := s.Save(sampleProfile("atomic-conn")); err != nil {
		t.Fatalf("Save: %v", err)
	}

	_, err := os.Stat(s.filePath + ".tmp")
	if !os.IsNotExist(err) {
		t.Errorf("tmp file should not exist after successful save")
	}
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

func TestProfileStore_Delete_Existing(t *testing.T) {
	s := newTestProfileStore(t)
	p, _ := s.Save(sampleProfile("to-delete"))

	if err := s.Delete(p.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	if _, err := s.GetByID(p.ID); err == nil {
		t.Error("GetByID should return error after delete")
	}
	if len(s.GetAll()) != 0 {
		t.Errorf("expected 0 profiles after delete, got %d", len(s.GetAll()))
	}

	// Disk should also be updated.
	data, _ := os.ReadFile(s.filePath)
	var list []Profile
	json.Unmarshal(data, &list)
	for _, pr := range list {
		if pr.ID == p.ID {
			t.Errorf("deleted profile %q still on disk", p.ID)
		}
	}
}

func TestProfileStore_Delete_NotFound(t *testing.T) {
	s := newTestProfileStore(t)
	err := s.Delete("nonexistent-id")
	if err == nil {
		t.Fatal("expected error for missing profile")
	}
	if !strings.Contains(err.Error(), "not found") {
		t.Errorf("error %q does not contain \"not found\"", err.Error())
	}
}

// ---------------------------------------------------------------------------
// GetAll
// ---------------------------------------------------------------------------

func TestProfileStore_GetAll_MasksPasswords(t *testing.T) {
	s := newTestProfileStore(t)
	p := sampleProfile("mask-test") // Password = "secret123"
	s.Save(p)

	all := s.GetAll()
	if len(all) != 1 {
		t.Fatalf("expected 1 profile, got %d", len(all))
	}
	if all[0].Password != "********" {
		t.Errorf("Password: got %q, want %q", all[0].Password, "********")
	}
	if all[0].Name != "mask-test" {
		t.Errorf("Name should be preserved: got %q", all[0].Name)
	}
}

func TestProfileStore_GetAll_EmptyPasswordNotMasked(t *testing.T) {
	s := newTestProfileStore(t)
	p := sampleProfile("no-pw-conn")
	p.Password = ""
	s.Save(p)

	all := s.GetAll()
	if all[0].Password != "" {
		t.Errorf("empty password should stay empty, got %q", all[0].Password)
	}
}

func TestProfileStore_GetAll_ReturnsAllProfiles(t *testing.T) {
	s := newTestProfileStore(t)

	ids := []string{"aa", "bb", "cc"}
	for _, id := range ids {
		p := sampleProfile("conn-" + id)
		p.ID = id
		s.Save(p)
	}

	all := s.GetAll()
	if len(all) != 3 {
		t.Fatalf("expected 3 profiles, got %d", len(all))
	}

	got := make([]string, 0, len(all))
	for _, pr := range all {
		got = append(got, pr.ID)
	}
	sort.Strings(got)
	if got[0] != "aa" || got[1] != "bb" || got[2] != "cc" {
		t.Errorf("IDs: got %v, want [aa bb cc]", got)
	}
}

func TestProfileStore_GetAll_Empty(t *testing.T) {
	s := newTestProfileStore(t)
	all := s.GetAll()
	if len(all) != 0 {
		t.Errorf("expected 0 profiles, got %d", len(all))
	}
}

// ---------------------------------------------------------------------------
// GetByID
// ---------------------------------------------------------------------------

func TestProfileStore_GetByID_Found(t *testing.T) {
	s := newTestProfileStore(t)
	p := sampleProfile("by-id-conn")
	p.ID = "find-me"
	p.Password = "hunter2"
	s.Save(p)

	got, err := s.GetByID("find-me")
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}
	// Must return plaintext password, not masked.
	if got.Password != "hunter2" {
		t.Errorf("Password: got %q, want %q (unmasked)", got.Password, "hunter2")
	}
	if got.Name != "by-id-conn" {
		t.Errorf("Name: got %q", got.Name)
	}
}

func TestProfileStore_GetByID_NotFound(t *testing.T) {
	s := newTestProfileStore(t)
	_, err := s.GetByID("ghost-profile")
	if err == nil {
		t.Fatal("expected error for missing profile")
	}
	if !strings.Contains(err.Error(), "not found") {
		t.Errorf("error %q does not contain \"not found\"", err.Error())
	}
}

// ---------------------------------------------------------------------------
// load / persist edge cases
// ---------------------------------------------------------------------------

func TestProfileStore_Reload_LoadsFromDisk(t *testing.T) {
	s1 := newTestProfileStore(t)
	p, _ := s1.Save(sampleProfile("shared-conn"))

	// Second store points at the same file.
	s2 := &ProfileStore{
		filePath: s1.filePath,
		profiles: make(map[string]Profile),
	}
	if err := s2.load(); err != nil {
		t.Fatalf("s2.load: %v", err)
	}

	got, err := s2.GetByID(p.ID)
	if err != nil {
		t.Fatalf("GetByID on reloaded store: %v", err)
	}
	if got.Name != "shared-conn" {
		t.Errorf("Name: got %q, want %q", got.Name, "shared-conn")
	}
}

func TestProfileStore_Load_MissingFile(t *testing.T) {
	s := &ProfileStore{
		filePath: filepath.Join(t.TempDir(), "no-file.json"),
		profiles: make(map[string]Profile),
	}
	if err := s.load(); err != nil {
		t.Fatalf("load on missing file should return nil error, got: %v", err)
	}
	if len(s.GetAll()) != 0 {
		t.Errorf("expected empty profiles after loading nonexistent file")
	}
}

func TestProfileStore_Load_CorruptJSON(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "profiles.json")
	os.WriteFile(path, []byte("not valid json {{{"), 0600)

	s := &ProfileStore{filePath: path, profiles: make(map[string]Profile)}
	err := s.load()
	if err == nil {
		t.Fatal("expected error for corrupt JSON, got nil")
	}
	if !strings.Contains(err.Error(), "parse profiles") {
		t.Errorf("error %q does not contain \"parse profiles\"", err.Error())
	}
}

func TestProfileStore_Persist_WriteError(t *testing.T) {
	dir := t.TempDir()
	roDir := filepath.Join(dir, "readonly")
	_ = os.Mkdir(roDir, 0500) // no write permission

	s := &ProfileStore{
		filePath: filepath.Join(roDir, "profiles.json"),
		profiles: make(map[string]Profile),
	}

	_, err := s.Save(sampleProfile("fail-write"))
	if err == nil {
		t.Skip("could not simulate write error (possibly running as root)")
	}
}

// ---------------------------------------------------------------------------
// Concurrency
// ---------------------------------------------------------------------------

func TestProfileStore_Concurrency(t *testing.T) {
	s := newTestProfileStore(t)

	// Pre-populate known IDs.
	knownIDs := []string{"k0", "k1", "k2", "k3", "k4"}
	for _, id := range knownIDs {
		p := sampleProfile("initial-" + id)
		p.ID = id
		s.Save(p)
	}

	const goroutines = 20
	var wg sync.WaitGroup
	wg.Add(goroutines)

	for g := 0; g < goroutines; g++ {
		go func(g int) {
			defer wg.Done()
			id := knownIDs[g%len(knownIDs)]

			if g < goroutines/2 {
				// Writers: save new profiles.
				p := sampleProfile("writer-" + id)
				_, _ = s.Save(p)
				_ = s.GetAll()
			} else {
				// Readers + deleters.
				_, _ = s.GetByID(id)
				// Delete may fail if already deleted by another goroutine — that's fine.
				_ = s.Delete(id)
			}
		}(g)
	}

	wg.Wait()
}

