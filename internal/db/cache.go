package db

import (
	"sync"
	"time"
)

const defaultSchemaTTL = 5 * time.Minute

type cacheEntry struct {
	result    *SchemaResult
	expiresAt time.Time
}

// SchemaCache is a TTL-based in-memory cache for SchemaResult values.
// All methods are safe for concurrent use.
type SchemaCache struct {
	mu      sync.RWMutex
	entries map[string]cacheEntry
	ttl     time.Duration
}

// NewSchemaCache creates a cache with the given TTL.
// If ttl <= 0, defaultSchemaTTL (5 minutes) is used.
func NewSchemaCache(ttl time.Duration) *SchemaCache {
	if ttl <= 0 {
		ttl = defaultSchemaTTL
	}
	return &SchemaCache{
		entries: make(map[string]cacheEntry),
		ttl:     ttl,
	}
}

// Get returns the cached SchemaResult for connID and true when a valid
// (non-expired) entry exists. Returns nil, false otherwise.
func (c *SchemaCache) Get(connID string) (*SchemaResult, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	e, ok := c.entries[connID]
	if !ok || time.Now().After(e.expiresAt) {
		return nil, false
	}
	return e.result, true
}

// Set stores result under connID with a fresh TTL.
func (c *SchemaCache) Set(connID string, result *SchemaResult) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.entries[connID] = cacheEntry{
		result:    result,
		expiresAt: time.Now().Add(c.ttl),
	}
}

// Invalidate removes the cached entry for connID.
func (c *SchemaCache) Invalidate(connID string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.entries, connID)
}

// InvalidateAll clears all entries from the cache.
func (c *SchemaCache) InvalidateAll() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.entries = make(map[string]cacheEntry)
}
