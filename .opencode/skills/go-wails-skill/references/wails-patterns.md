# Wails Patterns — Reference

## Frontend Binding Call Pattern

### Go side

```go
// Method on the App struct → automatically exposed to the frontend
func (a *App) ReadFile(path string) (string, error) {
    data, err := os.ReadFile(path)
    if err != nil {
        return "", fmt.Errorf("read file: %w", err)
    }
    return string(data), nil
}
```

### Frontend side (TypeScript with Svelte/React/Vue)

```ts
import { ReadFile } from '../../bindings/github.com/thtn-dev/table_stack/app'

// Returns Promise<string>
async function loadFile(path: string) {
    try {
        const content = await ReadFile(path)
        return content
    } catch (err) {
        console.error('Failed to read file:', err)
        throw err
    }
}
```

---

## Events — Go → Frontend Push

### Go side (emit)

```go
import "github.com/wailsapp/wails/v3/pkg/application"

// Emit from any goroutine after startup
func (a *App) startBackgroundJob() {
    go func() {
        for result := range a.resultChan {
            application.Get().Event.Emit("job-result", result)
        }
    }()
}
```

### Frontend side (listen)

```ts
import { On } from '@wailsio/runtime/events'

// Svelte
onMount(() => {
    const unlisten = On('job-result', (event) => {
        console.log('Got result:', event.data)
    })
    return unlisten
})

// React
useEffect(() => {
    const unlisten = On('job-result', (event) => {
        setResult(event.data)
    })
    return unlisten
}, [])
```

---

## Dialogs

```go
// Open file
path, err := application.Get().Dialog.OpenFile().
    SetTitle("Select file").
    SetDirectory(os.Getenv("HOME")).
    AddFilter("JSON Files (*.json)", "*.json").
    AddFilter("All Files (*.*)", "*.*").
    PromptForSingleSelection()

// Open directory
dir, err := application.Get().Dialog.OpenFile().
    SetTitle("Select directory").
    CanChooseFiles(false).
    CanChooseDirectories(true).
    PromptForSingleSelection()

// Save file
savePath, err := application.Get().Dialog.SaveFile().
    SetFilename("output.json").
    AddFilter("JSON Files (*.json)", "*.json").
    PromptForSingleSelection()

// Message dialog
application.Get().Dialog.Question().
    SetTitle("Confirmation").
    SetMessage("Are you sure you want to delete?").
    Show()
```

---

## System Tray (Wails v3)

```go
// main.go
systemTray := menu.NewMenu()
systemTrayMenu := systemTray.AddSubmenu("MyApp")
systemTrayMenu.AddText("Show", keys.CmdOrCtrl("s"), func(_ *menu.CallbackData) {
    mainWindow.Show()
})
systemTrayMenu.AddSeparator()
systemTrayMenu.AddText("Quit", keys.CmdOrCtrl("q"), func(_ *menu.CallbackData) {
    application.Get().Quit()
})

app := application.New(application.Options{/* ... */})
app.SystemTray.SetMenu(systemTray)
app.SystemTray.SetIcon(trayIcon)
err := app.Run()
```

---

## Clipboard

```go
// Write
application.Get().Clipboard.SetText("text to copy")

// Read
text, ok := application.Get().Clipboard.Text()
```

---

## Window Operations

```go
mainWindow.Show()
mainWindow.Hide()
mainWindow.SetSize(1280, 720)
mainWindow.SetMinSize(800, 600)
mainWindow.Center()
mainWindow.Fullscreen()
mainWindow.UnFullscreen()
mainWindow.SetTitle("New Title")
```

---

## Screen Info

```go
screens := application.Get().Screen.GetAll()
for _, screen := range screens {
    fmt.Printf("Screen: %s %dx%d\n", screen.ID, screen.Size.Width, screen.Size.Height)
}
```

---

## build/config.yml Key Fields (Wails v3)

```yaml
version: '3'
info:
    productName: "MyApp"
    productIdentifier: "com.example.myapp"
    version: "0.1.0"
dev_mode:
    root_path: .
    executes:
        - cmd: wails3 build DEV=true
          type: blocking
```

---

## Embed Assets (main.go)

```go
import "embed"

//go:embed all:frontend/dist
var assets embed.FS

// In application.New(...) options:
Assets: application.AssetOptions{
    Handler: application.AssetFileServerFS(assets),
},
```

---

## Build Flags

```bash
# Debug build
wails3 build -debug

# Production — minimal binary size
wails3 build -trimpath -ldflags "-s -w"

# Windows — no console window
wails3 build -windowsconsole=false

# Mac universal binary (Intel + Apple Silicon)
wails3 build -platform darwin/universal

# Cross-compile Linux from Mac/Windows
wails3 build -platform linux/amd64
```

---
