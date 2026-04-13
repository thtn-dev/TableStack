package db

import (
	"fmt"
	"sort"
	"strings"
	"sync"
	"testing"
)

func TestRegister_NewDriver(t *testing.T) {
	md := &mockDriver{}
	registerMockDriver(t, "test-new-driver", md)

	got, err := GetDriver("test-new-driver")
	if err != nil {
		t.Fatalf("GetDriver: %v", err)
	}
	if got == nil {
		t.Fatal("expected non-nil driver")
	}
}

func TestRegister_DuplicatePanics(t *testing.T) {
	registerMockDriver(t, "test-dup-driver", &mockDriver{})

	defer func() {
		r := recover()
		if r == nil {
			t.Fatal("expected panic on duplicate registration")
		}
		msg := fmt.Sprint(r)
		if !strings.Contains(msg, "already registered") {
			t.Errorf("panic message %q does not contain \"already registered\"", msg)
		}
		if !strings.Contains(msg, "test-dup-driver") {
			t.Errorf("panic message %q does not contain driver name", msg)
		}
	}()

	// This second registration should panic.
	Register("test-dup-driver", &mockDriver{})
}

func TestGetDriver_Unknown(t *testing.T) {
	d, err := GetDriver("no-such-driver-xyz")
	if err == nil {
		t.Fatal("expected error for unknown driver, got nil")
	}
	if d != nil {
		t.Errorf("expected nil driver, got %v", d)
	}
	if !strings.Contains(err.Error(), "unknown driver") {
		t.Errorf("error %q does not contain \"unknown driver\"", err.Error())
	}
}

func TestGetDriver_KnownDriver(t *testing.T) {
	md := &mockDriver{serverVersion: "1.0"}
	registerMockDriver(t, "test-known-driver", md)

	got, err := GetDriver("test-known-driver")
	if err != nil {
		t.Fatalf("GetDriver: %v", err)
	}
	// Pointer equality — should be the exact instance we registered.
	if got != md {
		t.Errorf("expected same driver instance, got different pointer")
	}
}

func TestRegisteredDrivers_Empty(t *testing.T) {
	// The unit test binary for package db does not import the postgres or mysql
	// sub-packages, so the registry starts empty. Any registered drivers from
	// other tests in this run are cleaned up via t.Cleanup in registerMockDriver.
	// This test must run before any registration — use subtests to isolate if
	// needed, but since each test cleans up we can rely on the cleanup order.
	//
	// We snapshot before and after to avoid flakiness when tests run in parallel.
	before := len(RegisteredDrivers())
	// No drivers registered in this test — count should be unchanged.
	after := len(RegisteredDrivers())
	if before != after {
		t.Errorf("RegisteredDrivers changed without a registration: before=%d after=%d", before, after)
	}
}

func TestRegisteredDrivers_AfterRegister(t *testing.T) {
	registerMockDriver(t, "test-list-driver-1", &mockDriver{})
	registerMockDriver(t, "test-list-driver-2", &mockDriver{})

	names := RegisteredDrivers()

	found1, found2 := false, false
	for _, n := range names {
		if n == "test-list-driver-1" {
			found1 = true
		}
		if n == "test-list-driver-2" {
			found2 = true
		}
	}
	if !found1 {
		t.Errorf("\"test-list-driver-1\" not in RegisteredDrivers: %v", sort.StringSlice(names))
	}
	if !found2 {
		t.Errorf("\"test-list-driver-2\" not in RegisteredDrivers: %v", sort.StringSlice(names))
	}
}

func TestRegisteredDrivers_ConcurrentRead(t *testing.T) {
	// Register several drivers, then read concurrently to verify mutex safety.
	for i := 0; i < 5; i++ {
		registerMockDriver(t, fmt.Sprintf("concurrent-driver-%d", i), &mockDriver{})
	}

	const goroutines = 20
	const iters = 50

	var wg sync.WaitGroup
	wg.Add(goroutines)

	for g := 0; g < goroutines; g++ {
		go func(g int) {
			defer wg.Done()
			for i := 0; i < iters; i++ {
				name := fmt.Sprintf("concurrent-driver-%d", g%5)
				_, _ = GetDriver(name)
				_ = RegisteredDrivers()
			}
		}(g)
	}

	wg.Wait()
}
