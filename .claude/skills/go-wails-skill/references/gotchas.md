# Gotchas — Common Mistakes in Go + Wails

## 1. Blocking the main thread

```go
// WRONG — blocks UI
func (a *App) DoHeavyWork() string {
    time.Sleep(10 * time.Second)
    return "done"
}

// CORRECT — emit event khi xong
func (a *App) StartHeavyWork() {
    go func() {
        time.Sleep(10 * time.Second)
        runtime.EventsEmit(a.ctx, "work-done", "done")
    }()
}
```

## 2. Using ctx before startup

```go
// WRONG — ctx là nil nếu gọi trước startup
func NewApp() *App {
    a := &App{}
    runtime.EventsEmit(a.ctx, "ready") // PANIC: nil ctx
    return a
}

// CORRECT — chỉ dùng ctx sau khi startup chạy
func (a *App) startup(ctx context.Context) {
    a.ctx = ctx
    runtime.EventsEmit(a.ctx, "ready") // OK
}
```

## 3. Unexported struct fields → frontend nhận nil/zero

```go
// WRONG — frontend nhận {} rỗng
type Result struct {
    id   string  // unexported → không serialize
    name string
}

// CORRECT
type Result struct {
    ID   string `json:"id"`
    Name string `json:"name"`
}
```

## 4. Returning pointers to frontend

```go
// WRONG — serialization không đoán được
func (a *App) GetUser() *User { ... }

// CORRECT — trả value type
func (a *App) GetUser() (User, error) { ... }
```

## 5. Không handle error từ frontend

```typescript
// WRONG — unhandled promise rejection
ReadFile(path)

// CORRECT
try {
    const content = await ReadFile(path)
} catch (err) {
    showError(err as string)
}
```

## 6. Race condition trên shared state

```go
// WRONG
type App struct {
    data map[string]string // shared, no mutex
}
func (a *App) Set(k, v string) { a.data[k] = v }
func (a *App) Get(k string) string { return a.data[k] }

// CORRECT
type App struct {
    mu   sync.RWMutex
    data map[string]string
}
func (a *App) Set(k, v string) {
    a.mu.Lock()
    defer a.mu.Unlock()
    a.data[k] = v
}
func (a *App) Get(k string) string {
    a.mu.RLock()
    defer a.mu.RUnlock()
    return a.data[k]
}
```

## 7. File paths trên Windows

```go
// WRONG — breaks on Windows
path := "data/" + filename

// CORRECT
path := filepath.Join("data", filename)
```

## 8. Quên cleanup trong shutdown

```go
// WRONG — goroutine leak, file handle leak
func (a *App) startup(ctx context.Context) {
    a.ctx = ctx
    a.db, _ = sql.Open("sqlite3", "app.db")
    go a.backgroundWorker()
}

// CORRECT
func (a *App) startup(ctx context.Context) {
    a.ctx = ctx
    a.db, _ = sql.Open("sqlite3", "app.db")
    a.workerCancel = make(chan struct{})
    go a.backgroundWorker(a.workerCancel)
}

func (a *App) shutdown(ctx context.Context) {
    close(a.workerCancel)
    if a.db != nil {
        a.db.Close()
    }
}
```

## 9. EventsOn leak trong frontend

```typescript
// WRONG — event listener không được cleanup
useEffect(() => {
    EventsOn('data', handler)
    // không return cleanup!
}, [])

// CORRECT
useEffect(() => {
    EventsOn('data', handler)
    return () => EventsOff('data')
}, [])
```

## 10. Binding method không phải trên *App

```go
// WRONG — không expose sang frontend
func GetVersion() string { return "1.0.0" }

// CORRECT — phải là method trên App struct
func (a *App) GetVersion() string { return "1.0.0" }
```

## 11. Goroutine panic không recover

```go
// CORRECT — luôn recover trong long-running goroutines
go func() {
    defer func() {
        if r := recover(); r != nil {
            log.Printf("worker panic: %v", r)
            runtime.EventsEmit(a.ctx, "worker-error", fmt.Sprintf("%v", r))
        }
    }()
    a.doWork()
}()
```

## 12. Wails dev server conflict

```bash
# Nếu port 34115 bị conflict
wails dev -port 34116

# Hoặc set trong wails.json
# "frontend:dev:serverUrl": "http://localhost:5174"
```
