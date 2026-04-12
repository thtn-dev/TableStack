package db

import (
	"sync"
	"testing"
	"time"
)

func TestSchemaCache_SetAndGet(t *testing.T) {
	c := NewSchemaCache(time.Minute)
	result := &SchemaResult{Schemas: []DatabaseSchema{{Name: "public"}}}

	c.Set("conn1", result)

	got, ok := c.Get("conn1")
	if !ok {
		t.Fatal("expected cache hit, got miss")
	}
	if got != result {
		t.Error("returned value does not match stored value")
	}
}

func TestSchemaCache_MissOnUnknownKey(t *testing.T) {
	c := NewSchemaCache(time.Minute)

	_, ok := c.Get("nonexistent")
	if ok {
		t.Error("expected cache miss for unknown key, got hit")
	}
}

func TestSchemaCache_TTLExpiry(t *testing.T) {
	c := NewSchemaCache(10 * time.Millisecond)
	result := &SchemaResult{}
	c.Set("conn1", result)

	// Should be present immediately
	if _, ok := c.Get("conn1"); !ok {
		t.Fatal("expected hit before TTL expires")
	}

	time.Sleep(20 * time.Millisecond)

	// Should be expired now
	if _, ok := c.Get("conn1"); ok {
		t.Error("expected cache miss after TTL expired, got hit")
	}
}

func TestSchemaCache_Invalidate(t *testing.T) {
	c := NewSchemaCache(time.Minute)
	c.Set("conn1", &SchemaResult{})
	c.Set("conn2", &SchemaResult{})

	c.Invalidate("conn1")

	if _, ok := c.Get("conn1"); ok {
		t.Error("expected miss after Invalidate, got hit")
	}
	if _, ok := c.Get("conn2"); !ok {
		t.Error("unrelated key should still be present after Invalidate")
	}
}

func TestSchemaCache_InvalidateAll(t *testing.T) {
	c := NewSchemaCache(time.Minute)
	c.Set("a", &SchemaResult{})
	c.Set("b", &SchemaResult{})
	c.Set("c", &SchemaResult{})

	c.InvalidateAll()

	for _, id := range []string{"a", "b", "c"} {
		if _, ok := c.Get(id); ok {
			t.Errorf("expected miss for %q after InvalidateAll, got hit", id)
		}
	}
}

func TestSchemaCache_DefaultTTL(t *testing.T) {
	// ttl <= 0 should use defaultSchemaTTL (5 minutes)
	c := NewSchemaCache(0)
	if c.ttl != defaultSchemaTTL {
		t.Errorf("expected default TTL %v, got %v", defaultSchemaTTL, c.ttl)
	}
}

func TestSchemaCache_ConcurrentAccess(t *testing.T) {
	c := NewSchemaCache(time.Minute)
	const workers = 50
	const iterations = 100

	var wg sync.WaitGroup
	wg.Add(workers)
	for i := 0; i < workers; i++ {
		go func(id int) {
			defer wg.Done()
			key := "conn"
			for j := 0; j < iterations; j++ {
				c.Set(key, &SchemaResult{})
				c.Get(key)
				if j%10 == 0 {
					c.Invalidate(key)
				}
			}
		}(i)
	}
	wg.Wait()
	// No panic or data race — test passes if it completes
}
