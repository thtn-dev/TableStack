# Gotchas — Common Mistakes in Go + Wails

## 1. Blocking the main thread

```go
// WRONG — blocks UI
func (a *App) DoHeavyWork() string {
    time.Sleep(10 * time.Second)
    return "done"
}

// CORRECT — emit event when finished
func (a *App) StartHeavyWork() {
    go func() {
        time.Sleep(10 * time.Second)
        runtime.EventsEmit(a.ctx, "work-done", "done")
    }()
}
```

---

## 2. Using ctx before startup

```go
// WRONG — ctx is nil if called before service startup
func NewApp() *App {
    a := &App{}
    application.Get().Event.Emit("ready") // PANIC: nil ctx
    return a
}

// CORRECT — only use ctx after ServiceStartup runs
func (a *App) ServiceStartup(ctx context.Context, _ application.ServiceOptions) error {
    a.ctx = ctx
    application.Get().Event.Emit("ready") // OK
    return nil
}
```

---

## 3. Unexported struct fields → frontend receives nil/zero values

```go
// WRONG — frontend receives empty {}
type Result struct {
    id   string  // unexported → not serialized
    name string
}

// CORRECT
type Result struct {
    ID   string `json:"id"`
    Name string `json:"name"`
}
```

---

## 4. Returning pointers to frontend

```go
// WRONG — serialization may fail or behave unexpectedly
func (a *App) GetUser() *User { ... }

// CORRECT — return value type
func (a *App) GetUser() (User, error) { ... }
```

---

## 5. Not handling errors in frontend calls

```ts
// WRONG — unhandled promise rejection
ReadFile(path)

// CORRECT
try {
    const content = await ReadFile(path)
} catch (err) {
    showError(err as string)
}
```

---

## 6. Race conditions on shared state

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

---

## 7. File paths on Windows

```go
// WRONG — breaks on Windows
path := "data/" + filename

// CORRECT
path := filepath.Join("data", filename)
```

---

## 8. Forgetting cleanup in shutdown

```go
// WRONG — goroutine leak, file handle leak
func (a *App) ServiceStartup(ctx context.Context, _ application.ServiceOptions) error {
    a.ctx = ctx
    a.db, _ = sql.Open("sqlite3", "app.db")
    go a.backgroundWorker()
    return nil
}

// CORRECT
func (a *App) ServiceStartup(ctx context.Context, _ application.ServiceOptions) error {
    a.ctx = ctx
    a.db, _ = sql.Open("sqlite3", "app.db")
    a.workerCancel = make(chan struct{})
    go a.backgroundWorker(a.workerCancel)
    return nil
}

func (a *App) ServiceShutdown() error {
    close(a.workerCancel)
    if a.db != nil {
        a.db.Close()
    }
    return nil
}
```

---

## 9. EventsOn leak in frontend

```ts
// WRONG — event listener is not cleaned up
useEffect(() => {
    On('data', handler)
    // no cleanup return!
}, [])

// CORRECT
useEffect(() => {
    const unlisten = On('data', handler)
    return unlisten
}, [])
```

---

## 10. Binding method is not on *App

```go
// WRONG — not exposed to frontend
func GetVersion() string { return "1.0.0" }

// CORRECT — must be a method on the App struct
func (a *App) GetVersion() string { return "1.0.0" }
```

---

## 11. Goroutine panic not recovered

```go
// CORRECT — always recover in long-running goroutines
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

---

## 12. Wails dev server conflict

```bash
# If port 34115 is in conflict
wails3 dev -port 34116

# Or set it in build/config.yml
# dev_mode:
#   executes:
#     - cmd: wails3 task common:dev:frontend
```
