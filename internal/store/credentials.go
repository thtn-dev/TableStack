package store

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"sync"

	"github.com/google/uuid"
	"github.com/zalando/go-keyring"
)

const (
	keychainService = "tablestack"
	keychainAccount = "master_key"
)

// ConnectionConfig holds a connection's metadata. EncryptedPassword is a
// base64-encoded blob of (nonce || AES-256-GCM ciphertext+tag).
type ConnectionConfig struct {
	ID                string `json:"id"`
	Name              string `json:"name"`
	Driver            string `json:"driver"`
	Host              string `json:"host"`
	Port              int    `json:"port"`
	User              string `json:"user"`
	DBName            string `json:"dbname"`
	EncryptedPassword string `json:"encrypted_password"`
}

// CredentialManager manages connection configs with AES-256-GCM encrypted passwords.
// The master key lives in the OS keychain; configs are persisted in a local JSON file.
type CredentialManager struct {
	mu         sync.RWMutex
	configPath string
	masterKey  []byte
}

// NewCredentialManager initialises a CredentialManager backed by configPath.
// It retrieves the master key from the OS keychain, generating and storing a
// new 32-byte random key on first run.
func NewCredentialManager(configPath string) (*CredentialManager, error) {
	key, err := loadOrCreateMasterKey()
	if err != nil {
		return nil, fmt.Errorf("master key: %w", err)
	}
	return &CredentialManager{
		configPath: configPath,
		masterKey:  key,
	}, nil
}

// SaveConnection encrypts plainPassword with AES-256-GCM and persists cfg.
// If cfg.ID is empty a new UUID is assigned. An existing record with the same
// ID is replaced in place.
func (cm *CredentialManager) SaveConnection(cfg ConnectionConfig, plainPassword string) error {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	encrypted, err := encryptGCM(cm.masterKey, []byte(plainPassword))
	if err != nil {
		return fmt.Errorf("encrypt password: %w", err)
	}
	cfg.EncryptedPassword = base64.StdEncoding.EncodeToString(encrypted)

	if cfg.ID == "" {
		cfg.ID = uuid.NewString()
	}

	conns, err := cm.readFile()
	if err != nil {
		return err
	}

	updated := false
	for i, c := range conns {
		if c.ID == cfg.ID {
			conns[i] = cfg
			updated = true
			break
		}
	}
	if !updated {
		conns = append(conns, cfg)
	}

	return cm.writeFile(conns)
}

// GetPassword decrypts and returns the plaintext password for connectionID.
func (cm *CredentialManager) GetPassword(connectionID string) (string, error) {
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	conns, err := cm.readFile()
	if err != nil {
		return "", err
	}

	for _, c := range conns {
		if c.ID != connectionID {
			continue
		}
		if c.EncryptedPassword == "" {
			return "", nil
		}
		cipherBytes, err := base64.StdEncoding.DecodeString(c.EncryptedPassword)
		if err != nil {
			return "", fmt.Errorf("decode encrypted_password: %w", err)
		}
		plain, err := decryptGCM(cm.masterKey, cipherBytes)
		if err != nil {
			return "", fmt.Errorf("decrypt password: %w", err)
		}
		return string(plain), nil
	}

	return "", fmt.Errorf("connection %q not found", connectionID)
}

// ListConnections returns all stored connections with EncryptedPassword cleared.
func (cm *CredentialManager) ListConnections() ([]ConnectionConfig, error) {
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	conns, err := cm.readFile()
	if err != nil {
		return nil, err
	}

	out := make([]ConnectionConfig, len(conns))
	for i, c := range conns {
		c.EncryptedPassword = ""
		out[i] = c
	}
	return out, nil
}

// DeleteConnection removes the connection with the given ID.
func (cm *CredentialManager) DeleteConnection(connectionID string) error {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	conns, err := cm.readFile()
	if err != nil {
		return err
	}

	filtered := make([]ConnectionConfig, 0, len(conns))
	found := false
	for _, c := range conns {
		if c.ID == connectionID {
			found = true
			continue
		}
		filtered = append(filtered, c)
	}
	if !found {
		return fmt.Errorf("connection %q not found", connectionID)
	}

	return cm.writeFile(filtered)
}

// ---- crypto helpers -------------------------------------------------------

// encryptGCM encrypts plaintext with AES-256-GCM.
// Returns nonce || ciphertext+tag (nonce is prepended, not separated).
func encryptGCM(key, plaintext []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("aes cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("gcm: %w", err)
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, fmt.Errorf("nonce: %w", err)
	}
	// Seal appends ciphertext+tag to nonce, producing nonce||ciphertext+tag.
	return gcm.Seal(nonce, nonce, plaintext, nil), nil
}

// decryptGCM decrypts a blob produced by encryptGCM.
func decryptGCM(key, data []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("aes cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("gcm: %w", err)
	}
	nonceSize := gcm.NonceSize()
	if len(data) < nonceSize {
		return nil, fmt.Errorf("ciphertext too short")
	}
	nonce, ciphertext := data[:nonceSize], data[nonceSize:]
	plain, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, fmt.Errorf("gcm open: %w", err)
	}
	return plain, nil
}

// ---- keychain helpers -----------------------------------------------------

func loadOrCreateMasterKey() ([]byte, error) {
	hexKey, err := keyring.Get(keychainService, keychainAccount)
	if err == keyring.ErrNotFound {
		return generateAndStoreMasterKey()
	}
	if err != nil {
		return nil, fmt.Errorf("keychain get: %w", err)
	}
	key, err := hex.DecodeString(hexKey)
	if err != nil {
		return nil, fmt.Errorf("decode master key: %w", err)
	}
	if len(key) != 32 {
		return nil, fmt.Errorf("master key length invalid: got %d, want 32", len(key))
	}
	return key, nil
}

func generateAndStoreMasterKey() ([]byte, error) {
	key := make([]byte, 32)
	if _, err := io.ReadFull(rand.Reader, key); err != nil {
		return nil, fmt.Errorf("generate key: %w", err)
	}
	if err := keyring.Set(keychainService, keychainAccount, hex.EncodeToString(key)); err != nil {
		return nil, fmt.Errorf("keychain set: %w", err)
	}
	return key, nil
}

// ---- file helpers ---------------------------------------------------------

func (cm *CredentialManager) readFile() ([]ConnectionConfig, error) {
	data, err := os.ReadFile(cm.configPath)
	if os.IsNotExist(err) {
		return []ConnectionConfig{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read connections: %w", err)
	}
	var conns []ConnectionConfig
	if err := json.Unmarshal(data, &conns); err != nil {
		return nil, fmt.Errorf("parse connections: %w", err)
	}
	return conns, nil
}

func (cm *CredentialManager) writeFile(conns []ConnectionConfig) error {
	data, err := json.MarshalIndent(conns, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal connections: %w", err)
	}
	tmp := cm.configPath + ".tmp"
	if err := os.WriteFile(tmp, data, 0600); err != nil {
		return fmt.Errorf("write connections: %w", err)
	}
	if err := os.Rename(tmp, cm.configPath); err != nil {
		return fmt.Errorf("rename connections: %w", err)
	}
	return nil
}
