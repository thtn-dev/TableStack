---
name: go-wails-skill
description: >
  Go + Wails Desktop App development assistant. Auto-invoke when working on
    .go files in a Wails project, build/config.yml exists, or user mentions Wails,
  frontend binding, app.go, or desktop app. Covers Go conventions,
  Wails bindings, frontend-backend communication, and build patterns.
---

# Go + Wails Desktop App Skill

Before starting any task, read the project structure:
- Check `build/config.yml` (or project config) for Wails v3 settings
- Check `app.go` or main struct for existing bindings
- Check `frontend/` for framework (Svelte/React/Vue)
- Check `go.mod` for Go version and dependencies

See `references/go-conventions.md` for Go coding standards.
See `references/wails-patterns.md` for Wails-specific patterns.
See `references/gotchas.md` for common mistakes to avoid.

---

## Phase 1 — ASSESS

Before writing code, confirm:
1. Which Wails version? (`go.mod` dependency and build config)
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
1. Frontend calls generated binding functions from `frontend/bindings/github.com/<module>/<service>.ts`
2. Args must be JSON-serializable
3. Returns a Promise — always handle `.catch()`

### For new features
1. Define data structs in `models.go` or domain-specific file
2. Add methods to App struct in `app.go` (or split into `*_service.go`)
3. Wire up in `NewApp()` if initialization needed
4. Update frontend bindings by running `wails3 generate bindings -clean=true -ts`

---

## Phase 3 — EXECUTE

Follow all rules in `references/go-conventions.md`.

Key execution rules:
- All exported methods on App struct become frontend-callable bindings
- Use `a.ctx` (stored from `ServiceStartup`) for context-aware operations
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

func (a *App) ServiceStartup(ctx context.Context, _ application.ServiceOptions) error {
    a.ctx = ctx
    return nil
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
- `ServiceStartup(ctx, options)` → store ctx, init services
- `ServiceShutdown()` → cleanup, close DB/files
- Use service-level hooks for lifecycle logic in Wails v3

### Runtime calls (Go → Frontend events)
```go
import "github.com/wailsapp/wails/v3/pkg/application"

// Emit event to frontend
application.Get().Event.Emit("data-updated", payload)

// Show dialog
application.Get().Dialog.Info().
    SetTitle("Success").
    SetMessage("Operation completed").
    Show()

// Open file dialog
filePath, err := application.Get().Dialog.OpenFile().
    SetTitle("Select File").
    AddFilter("Go Files", "*.go").
    PromptForSingleSelection()
```

### Window management
```go
mainWindow.SetTitle("New Title")
mainWindow.SetSize(1280, 720)
mainWindow.Center()
mainWindow.Minimise()
```

### main.go wiring — must include all lifecycle hooks
```go
app := application.New(application.Options{
    Name: "My App",
    Services: []application.Service{
        application.NewService(appService),
    },
    Assets: application.AssetOptions{
        Handler: application.AssetFileServerFS(assets),
    },
})

app.Window.NewWithOptions(application.WebviewWindowOptions{Title: "My App"})
err := app.Run()
```

---

## Phase 5 — VALIDATE

After implementation, verify:

- [ ] `wails3 build` succeeds (no compile errors)
- [ ] `wails3 dev` hot-reload works
- [ ] All new binding methods have error return value
- [ ] No goroutine leaks (long ops use context cancellation)
- [ ] File handles / DB connections closed in `ServiceShutdown()`
- [ ] Frontend handles Promise rejection for every binding call
- [ ] Structs used as return types are JSON-serializable (no unexported fields needed by frontend)
- [ ] Run `wails3 generate bindings -clean=true -ts` if bindings changed

### Common build commands
```bash
wails3 dev                             # Dev mode with hot reload
wails3 build                           # Production build
wails3 build -clean                    # Clean build
wails3 generate bindings -clean=true -ts  # Regenerate frontend bindings
wails3 doctor                          # Check environment setup
```
