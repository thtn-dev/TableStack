# Go Conventions — Reference

## Naming

| Item          | Convention                                     | Example                        |
| ------------- | ---------------------------------------------- | ------------------------------ |
| Package       | lowercase, no underscores                      | `service`, `repository`        |
| Exported type | PascalCase                                     | `UserService`, `DataResult`    |
| Unexported    | camelCase                                      | `userService`, `fetchData`     |
| Interface     | `-er` suffix is commonly used                  | `Reader`, `DataFetcher`        |
| Error var     | `Err` prefix                                   | `ErrNotFound`, `ErrTimeout`    |
| Test file     | `_test.go` suffix                              | `app_test.go`                  |
| Constant      | PascalCase (exported) / camelCase (unexported) | `MaxRetries`, `defaultTimeout` |

---

## Error Handling — ALWAYS Explicit

```go
// CORRECT
result, err := doSomething()
if err != nil {
    return fmt.Errorf("doSomething: %w", err)
}

// WRONG — never ignore errors
result, _ := doSomething()
```

### Sentinel Errors

```go
var (
    ErrNotFound   = errors.New("not found")
    ErrPermission = errors.New("permission denied")
)

// Check with errors.Is
if errors.Is(err, ErrNotFound) {
    // handle
}
```

### Custom Error Types

```go
type ValidationError struct {
    Field   string
    Message string
}

func (e *ValidationError) Error() string {
    return fmt.Sprintf("validation error on %s: %s", e.Field, e.Message)
}

// Check with errors.As
var ve *ValidationError
if errors.As(err, &ve) {
    // access ve.Field, ve.Message
}
```

---

## Structs — JSON Binding

```go
// Exported fields → visible to frontend
type UserData struct {
    ID        string    `json:"id"`
    Name      string    `json:"name"`
    CreatedAt time.Time `json:"createdAt"`
    // unexported fields → hidden from frontend, OK
    internalCache map[string]string
}
```

---

## Goroutines & Concurrency

```go
// ALWAYS use context for cancellation
func (a *App) LongOperation(ctx context.Context) error {
    done := make(chan error, 1)
    go func() {
        done <- a.doHeavyWork(ctx)
    }()
    select {
    case err := <-done:
        return err
    case <-ctx.Done():
        return ctx.Err()
    }
}
```

### sync.Mutex for Shared State

```go
type App struct {
    ctx   context.Context
    mu    sync.Mutex
    cache map[string]string
}

func (a *App) SetCache(key, val string) {
    a.mu.Lock()
    defer a.mu.Unlock()
    a.cache[key] = val
}
```

---

## Defer — Cleanup Pattern

```go
func processFile(path string) error {
    f, err := os.Open(path)
    if err != nil {
        return fmt.Errorf("open file: %w", err)
    }
    defer f.Close()  // always close after a successful open

    // ... process
    return nil
}
```

---

## Interfaces — Accept Interfaces, Return Structs

```go
// CORRECT — dependency injection via interface
type Storage interface {
    Get(key string) (string, error)
    Set(key string, val string) error
}

type App struct {
    storage Storage  // interface
}

func NewApp(storage Storage) *App {
    return &App{storage: storage}
}
```

---

## Testing Conventions

```go
// Table-driven tests
func TestGetData(t *testing.T) {
    tests := []struct {
        name    string
        input   string
        want    DataResult
        wantErr bool
    }{
        {"valid id", "abc123", DataResult{ID: "abc123"}, false},
        {"empty id", "", DataResult{}, true},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            got, err := getData(tt.input)
            if (err != nil) != tt.wantErr {
                t.Errorf("got err %v, wantErr %v", err, tt.wantErr)
            }
            if got != tt.want {
                t.Errorf("got %v, want %v", got, tt.want)
            }
        })
    }
}
```

---

## File Paths — Cross-Platform

```go
// CORRECT
path := filepath.Join("data", "users", "profile.json")

// WRONG — breaks on Windows
path := "data/users/profile.json"
```

---

## Package Organization (Wails Project)

```
myapp/
    main.go          # application.New(...), wire up App service + window
    app.go           # App struct + ServiceStartup/ServiceShutdown lifecycle
  models.go        # shared data structs (JSON-serializable)
  *_service.go     # domain logic (file_service.go, db_service.go)
  frontend/        # JS/TS frontend
    build/           # wails3 build assets/config
```
