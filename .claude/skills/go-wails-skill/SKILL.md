---
name: go-wails-skill
description: >
  Go + Wails Desktop App development assistant. Auto-invoke when working on
  .go files in a Wails project, wails.json exists, or user mentions Wails,
  frontend binding, app.go, or desktop app. Covers Go conventions,
  Wails bindings, frontend-backend communication, and build patterns.
---

# Go + Wails Desktop App Skill

Before starting any task, read the project structure:
- Check `wails.json` for project config
- Check `app.go` or main struct for existing bindings
- Check `frontend/` for framework (Svelte/React/Vue)
- Check `go.mod` for Go version and dependencies

See `references/go-conventions.md` for Go coding standards.
See `references/wails-patterns.md` for Wails-specific patterns.
See `references/gotchas.md` for common mistakes to avoid.

---

## Phase 1 — ASSESS

Before writing code, confirm:
1. Which Wails version? (`wails.json` → `wailsVersion` field)
2. Frontend framework? (check `frontend/package.json`)
3. What is the task: new binding, new feature, bug fix, or refactor?
4. Does this touch frontend ↔ backend boundary? If yes, plan the binding contract first.

---

## Phase 2 — PLAN

### For new bindings (Go → Frontend)
1. Define the method signature on the App struct first
2. Return `(ResultType, error)` — always two return values
3. Plan the TypeScript/JS type that Wails will auto-generate
4. Never return raw pointers or channels to frontend

### For frontend → Go calls
1. Frontend calls via `window.go.main.App.MethodName(args)`
2. Args must be JSON-serializable
3. Returns a Promise — always handle `.catch()`

### For new features
1. Define data structs in `models.go` or domain-specific file
2. Add methods to App struct in `app.go` (or split into `*_service.go`)
3. Wire up in `NewApp()` if initialization needed
4. Update frontend bindings by running `wails generate module`

---

## Phase 3 — EXECUTE

Follow all rules in `references/go-conventions.md`.

Key execution rules:
- All exported methods on App struct become frontend-callable bindings
- Use `a.ctx` (stored from `startup`) for context-aware operations
- Long operations must run in goroutine + use channels or callbacks
- File paths: always use `filepath.Join`, never string concat with `/`
- Never block the main goroutine

```go
// CORRECT — App struct pattern
type App struct {
    ctx context.Context
}

func NewApp() *App {
    return &App{}
}

func (a *App) startup(ctx context.Context) {
    a.ctx = ctx
}

// CORRECT — binding method signature
func (a *App) GetData(id string) (DataResult, error) {
    if id == "" {
        return DataResult{}, fmt.Errorf("id cannot be empty")
    }
    // ...
    return result, nil
}
```

---

## Phase 4 — WAILS-SPECIFIC RULES

### Context & Lifecycle
- `startup(ctx)` → store ctx, init services
- `beforeClose(ctx) bool` → return true to cancel close
- `shutdown(ctx)` → cleanup, close DB/files
- `domReady(ctx)` → safe to call runtime functions

### Runtime calls (Go → Frontend events)
```go
import "github.com/wailsapp/wails/v2/pkg/runtime"

// Emit event to frontend
runtime.EventsEmit(a.ctx, "data-updated", payload)

// Show dialog
runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
    Type:    runtime.InfoDialog,
    Title:   "Success",
    Message: "Operation completed",
})

// Open file dialog
filePath, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
    Title: "Select File",
    Filters: []runtime.FileFilter{
        {DisplayName: "Go Files", Pattern: "*.go"},
    },
})
```

### Window management
```go
runtime.WindowSetTitle(a.ctx, "New Title")
runtime.WindowSetSize(a.ctx, 1280, 720)
runtime.WindowCenter(a.ctx)
runtime.WindowMinimise(a.ctx)
```

### main.go wiring — must include all lifecycle hooks
```go
err := wails.Run(&options.App{
    Title:            "My App",
    Width:            1024,
    Height:           768,
    AssetServer:      &assetserver.Options{Assets: assets},
    BackgroundColour: &options.RGBA{R: 27, G: 38, B: 54, A: 1},
    OnStartup:        app.startup,
    OnDomReady:       app.domReady,
    OnBeforeClose:    app.beforeClose,
    OnShutdown:       app.shutdown,
    Bind:             []interface{}{app},
})
```

---

## Phase 5 — VALIDATE

After implementation, verify:

- [ ] `wails build` succeeds (no compile errors)
- [ ] `wails dev` hot-reload works
- [ ] All new binding methods have error return value
- [ ] No goroutine leaks (long ops use context cancellation)
- [ ] File handles / DB connections closed in `shutdown()`
- [ ] Frontend handles Promise rejection for every binding call
- [ ] Structs used as return types are JSON-serializable (no unexported fields needed by frontend)
- [ ] Run `wails generate module` if bindings changed

### Common build commands
```bash
wails dev                    # Dev mode with hot reload
wails build                  # Production build
wails build -clean           # Clean build
wails generate module        # Regenerate frontend bindings
wails doctor                 # Check environment setup
```
