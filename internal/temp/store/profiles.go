package store

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"github.com/google/uuid"
)

// Profile — lưu trữ thông tin kết nối, thêm Driver để biết loại DB
type Profile struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Driver   string `json:"driver"` // "postgres" | "mysql" | ...
	Host     string `json:"host"`
	Port     int    `json:"port"`
	User     string `json:"user"`
	Password string `json:"password"`
	Database string `json:"database"`
	SSLMode  string `json:"sslMode"`
}

// ProfileStore lưu connection profiles ra file JSON
type ProfileStore struct {
	mu       sync.RWMutex
	filePath string
	profiles map[string]Profile
}

func NewProfileStore(appName string) (*ProfileStore, error) {
	dir, err := profileDir(appName)
	if err != nil {
		return nil, err
	}

	s := &ProfileStore{
		filePath: filepath.Join(dir, "profiles.json"),
		profiles: make(map[string]Profile),
	}

	if err := s.load(); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *ProfileStore) Save(p Profile) (Profile, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if p.ID == "" {
		p.ID = uuid.NewString()
	}
	s.profiles[p.ID] = p

	if err := s.persist(); err != nil {
		return Profile{}, err
	}
	return p, nil
}

func (s *ProfileStore) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, ok := s.profiles[id]; !ok {
		return fmt.Errorf("profile %q not found", id)
	}
	delete(s.profiles, id)
	return s.persist()
}

func (s *ProfileStore) GetAll() []Profile {
	s.mu.RLock()
	defer s.mu.RUnlock()

	list := make([]Profile, 0, len(s.profiles))
	for _, p := range s.profiles {
		masked := p
		if masked.Password != "" {
			masked.Password = "********"
		}
		list = append(list, masked)
	}
	return list
}

func (s *ProfileStore) GetByID(id string) (Profile, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	p, ok := s.profiles[id]
	if !ok {
		return Profile{}, fmt.Errorf("profile %q not found", id)
	}
	return p, nil
}

// ---- private helpers ----

func (s *ProfileStore) load() error {
	data, err := os.ReadFile(s.filePath)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("read profiles: %w", err)
	}

	var list []Profile
	if err := json.Unmarshal(data, &list); err != nil {
		return fmt.Errorf("parse profiles: %w", err)
	}

	for _, p := range list {
		s.profiles[p.ID] = p
	}
	return nil
}

func (s *ProfileStore) persist() error {
	list := make([]Profile, 0, len(s.profiles))
	for _, p := range s.profiles {
		list = append(list, p)
	}

	data, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal profiles: %w", err)
	}

	tmp := s.filePath + ".tmp"
	if err := os.WriteFile(tmp, data, 0600); err != nil {
		return fmt.Errorf("write profiles: %w", err)
	}
	return os.Rename(tmp, s.filePath)
}

func profileDir(appName string) (string, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("config dir: %w", err)
	}
	dir := filepath.Join(base, appName)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return "", fmt.Errorf("mkdir: %w", err)
	}
	return dir, nil
}
