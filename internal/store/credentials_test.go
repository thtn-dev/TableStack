package store

import (
	"encoding/base64"
	"os"
	"path/filepath"
	"testing"
)

// stubKey is a fixed 32-byte AES-256 key used for crypto unit tests.
var stubKey = make([]byte, 32)

func TestEncryptDecryptRoundtrip(t *testing.T) {
	plaintext := []byte("super-secret-password")

	blob, err := encryptGCM(stubKey, plaintext)
	if err != nil {
		t.Fatalf("encryptGCM: %v", err)
	}

	got, err := decryptGCM(stubKey, blob)
	if err != nil {
		t.Fatalf("decryptGCM: %v", err)
	}
	if string(got) != string(plaintext) {
		t.Fatalf("want %q, got %q", plaintext, got)
	}
}

func TestEncryptProducesUniqueNonces(t *testing.T) {
	plaintext := []byte("password")

	blob1, err := encryptGCM(stubKey, plaintext)
	if err != nil {
		t.Fatalf("first encrypt: %v", err)
	}
	blob2, err := encryptGCM(stubKey, plaintext)
	if err != nil {
		t.Fatalf("second encrypt: %v", err)
	}

	enc1 := base64.StdEncoding.EncodeToString(blob1)
	enc2 := base64.StdEncoding.EncodeToString(blob2)
	if enc1 == enc2 {
		t.Fatal("expected different ciphertexts for different nonces")
	}
}

func TestDecryptTamperedCiphertext(t *testing.T) {
	blob, _ := encryptGCM(stubKey, []byte("password"))
	blob[len(blob)-1] ^= 0xFF // flip last byte of GCM tag
	if _, err := decryptGCM(stubKey, blob); err == nil {
		t.Fatal("expected error on tampered ciphertext")
	}
}

// newTestManager returns a CredentialManager that uses a temp file and the
// stubKey — it bypasses the real OS keychain.
func newTestManager(t *testing.T) *CredentialManager {
	t.Helper()
	dir := t.TempDir()
	return &CredentialManager{
		configPath: filepath.Join(dir, "connections.json"),
		masterKey:  stubKey,
	}
}

func TestSaveAndGetPassword(t *testing.T) {
	cm := newTestManager(t)

	cfg := ConnectionConfig{
		Name:   "local-pg",
		Driver: "postgres",
		Host:   "localhost",
		Port:   5432,
		User:   "admin",
		DBName: "mydb",
	}

	if err := cm.SaveConnection(cfg, "hunter2"); err != nil {
		t.Fatalf("SaveConnection: %v", err)
	}

	conns, err := cm.ListConnections()
	if err != nil {
		t.Fatalf("ListConnections: %v", err)
	}
	if len(conns) != 1 {
		t.Fatalf("want 1 connection, got %d", len(conns))
	}
	if conns[0].EncryptedPassword != "" {
		t.Fatal("ListConnections must not expose EncryptedPassword")
	}

	pw, err := cm.GetPassword(conns[0].ID)
	if err != nil {
		t.Fatalf("GetPassword: %v", err)
	}
	if pw != "hunter2" {
		t.Fatalf("want %q, got %q", "hunter2", pw)
	}
}

func TestSaveConnectionUpdatesExisting(t *testing.T) {
	cm := newTestManager(t)

	cfg := ConnectionConfig{ID: "fixed-id", Name: "pg", Driver: "postgres"}
	_ = cm.SaveConnection(cfg, "old-pass")
	_ = cm.SaveConnection(cfg, "new-pass")

	conns, _ := cm.ListConnections()
	if len(conns) != 1 {
		t.Fatalf("want 1 connection after update, got %d", len(conns))
	}

	pw, _ := cm.GetPassword("fixed-id")
	if pw != "new-pass" {
		t.Fatalf("want %q, got %q", "new-pass", pw)
	}
}

func TestDeleteConnection(t *testing.T) {
	cm := newTestManager(t)

	cfg := ConnectionConfig{Name: "pg", Driver: "postgres"}
	_ = cm.SaveConnection(cfg, "pass")

	conns, _ := cm.ListConnections()
	id := conns[0].ID

	if err := cm.DeleteConnection(id); err != nil {
		t.Fatalf("DeleteConnection: %v", err)
	}

	remaining, _ := cm.ListConnections()
	if len(remaining) != 0 {
		t.Fatalf("want 0 connections after delete, got %d", len(remaining))
	}
}

func TestDeleteConnectionNotFound(t *testing.T) {
	cm := newTestManager(t)
	if err := cm.DeleteConnection("nonexistent"); err == nil {
		t.Fatal("expected error for missing connection")
	}
}

func TestGetPasswordNotFound(t *testing.T) {
	cm := newTestManager(t)
	if _, err := cm.GetPassword("ghost"); err == nil {
		t.Fatal("expected error for missing connection")
	}
}

func TestListConnectionsEmptyFile(t *testing.T) {
	cm := newTestManager(t)
	conns, err := cm.ListConnections()
	if err != nil {
		t.Fatalf("ListConnections on empty: %v", err)
	}
	if len(conns) != 0 {
		t.Fatalf("want 0, got %d", len(conns))
	}
}

func TestReadFileNotExist(t *testing.T) {
	cm := &CredentialManager{
		configPath: filepath.Join(t.TempDir(), "no-such-file.json"),
		masterKey:  stubKey,
	}
	conns, err := cm.readFile()
	if err != nil {
		t.Fatalf("readFile on missing file should return empty slice, got: %v", err)
	}
	if len(conns) != 0 {
		t.Fatalf("want empty slice, got %d items", len(conns))
	}
}

func TestAtomicWriteOnDiskError(t *testing.T) {
	// Point configPath at a directory (not a file) to trigger a write error.
	dir := t.TempDir()
	roDir := filepath.Join(dir, "readonly")
	_ = os.Mkdir(roDir, 0500) // no write permission

	cm := &CredentialManager{
		configPath: filepath.Join(roDir, "connections.json"),
		masterKey:  stubKey,
	}
	err := cm.SaveConnection(ConnectionConfig{Name: "test"}, "pw")
	if err == nil {
		t.Skip("could not simulate write error (possibly running as root)")
	}
}
