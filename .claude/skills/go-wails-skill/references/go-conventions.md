# Go Conventions — Reference

## Naming

| Thứ | Convention | Ví dụ |
|-----|-----------|-------|
| Package | lowercase, no underscore | `service`, `repository` |
| Exported type | PascalCase | `UserService`, `DataResult` |
| Unexported | camelCase | `userService`, `fetchData` |
| Interface | -er suffix thường dùng | `Reader`, `DataFetcher` |
| Error var | `Err` prefix | `ErrNotFound`, `ErrTimeout` |
| Test file | `_test.go` suffix | `app_test.go` |
| Constant | PascalCase (exported) / camelCase (unexported) | `MaxRetries`, `defaultTimeout` |

## Error handling — ALWAYS explicit

```go
// CORRECT
result, err := doSomething()
if err != nil {
    return fmt.Errorf("doSomething: %w", err)
}

// WRONG — never ignore errors
result, _ := doSomething()
```

### Sentinel errors
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

### Custom error types
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

## Structs — JSON binding

```go
// Fields được export → frontend nhìn thấy
type UserData struct {
    ID        string    `json:"id"`
    Name      string    `json:"name"`
    CreatedAt time.Time `json:"createdAt"`
    // unexported fields → hidden từ frontend, OK
    internalCache map[string]string
}
```

## Goroutines & concurrency

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

### sync.Mutex cho shared state
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

## Defer — cleanup pattern

```go
func processFile(path string) error {
    f, err := os.Open(path)
    if err != nil {
        return fmt.Errorf("open file: %w", err)
    }
    defer f.Close()  // luôn close sau khi open thành công

    // ... process
    return nil
}
```

## Interface — accept interfaces, return structs

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

## Testing conventions

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

## File paths — cross-platform

```go
// CORRECT
path := filepath.Join("data", "users", "profile.json")

// WRONG — breaks on Windows
path := "data/users/profile.json"
```

## Package organization (Wails project)

```
myapp/
  main.go          # wails.Run, wire up App
  app.go           # App struct + startup/shutdown lifecycle
  models.go        # shared data structs (JSON-serializable)
  *_service.go     # domain logic (file_service.go, db_service.go)
  frontend/        # JS/TS frontend
  build/           # wails build output
```
