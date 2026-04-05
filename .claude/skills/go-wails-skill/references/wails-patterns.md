# Wails Patterns — Reference

## Frontend binding call pattern

### Go side
```go
// Method trên App struct → tự động expose sang frontend
func (a *App) ReadFile(path string) (string, error) {
    data, err := os.ReadFile(path)
    if err != nil {
        return "", fmt.Errorf("read file: %w", err)
    }
    return string(data), nil
}
```

### Frontend side (TypeScript với Svelte/React/Vue)
```typescript
import { ReadFile } from '../wailsjs/go/main/App'

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

## Events — Go → Frontend push

### Go phía emit
```go
import "github.com/wailsapp/wails/v2/pkg/runtime"

// Emit từ goroutine bất kỳ sau khi startup
func (a *App) startBackgroundJob() {
    go func() {
        for result := range a.resultChan {
            runtime.EventsEmit(a.ctx, "job-result", result)
        }
    }()
}
```

### Frontend phía listen
```typescript
import { EventsOn, EventsOff } from '../wailsjs/runtime'

// Svelte
onMount(() => {
    const unlisten = EventsOn('job-result', (data) => {
        console.log('Got result:', data)
    })
    return () => EventsOff('job-result')
})

// React
useEffect(() => {
    EventsOn('job-result', (data) => {
        setResult(data)
    })
    return () => EventsOff('job-result')
}, [])
```

## Dialogs

```go
// Open file
path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
    Title:                "Chọn file",
    DefaultDirectory:     os.Getenv("HOME"),
    DefaultFilename:      "",
    Filters: []runtime.FileFilter{
        {DisplayName: "JSON Files (*.json)", Pattern: "*.json"},
        {DisplayName: "All Files (*.*)", Pattern: "*.*"},
    },
    ShowHiddenFiles:      false,
    CanCreateDirectories: false,
})

// Open directory
dir, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
    Title: "Chọn thư mục",
})

// Save file
savePath, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
    Title:           "Lưu file",
    DefaultFilename: "output.json",
    Filters: []runtime.FileFilter{
        {DisplayName: "JSON Files (*.json)", Pattern: "*.json"},
    },
})

// Message dialog
selection, err := runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
    Type:          runtime.QuestionDialog,
    Title:         "Xác nhận",
    Message:       "Bạn có chắc muốn xoá?",
    Buttons:       []string{"Có", "Không"},
    DefaultButton: "Không",
    CancelButton:  "Không",
})
```

## System Tray (Wails v2)

```go
// main.go
systemTray := menu.NewMenu()
systemTrayMenu := systemTray.AddSubmenu("MyApp")
systemTrayMenu.AddText("Show", keys.CmdOrCtrl("s"), func(_ *menu.CallbackData) {
    runtime.WindowShow(app.ctx)
})
systemTrayMenu.AddSeparator()
systemTrayMenu.AddText("Quit", keys.CmdOrCtrl("q"), func(_ *menu.CallbackData) {
    runtime.Quit(app.ctx)
})

err := wails.Run(&options.App{
    // ...
    SystemTray: &options.SystemTray{
        Icon:             trayIcon,
        Menu:             systemTray,
        HideWindowOnClose: true,
    },
})
```

## Clipboard

```go
// Write
runtime.ClipboardSetText(a.ctx, "text to copy")

// Read
text, err := runtime.ClipboardGetText(a.ctx)
```

## Window operations

```go
runtime.WindowShow(a.ctx)
runtime.WindowHide(a.ctx)
runtime.WindowSetSize(a.ctx, 1280, 720)
runtime.WindowSetMinSize(a.ctx, 800, 600)
runtime.WindowCenter(a.ctx)
runtime.WindowFullscreen(a.ctx)
runtime.WindowUnfullscreen(a.ctx)
runtime.WindowSetTitle(a.ctx, "New Title")

// Toggle dark mode (Wails v2.8+)
runtime.WindowSetDarkTheme(a.ctx)
runtime.WindowSetLightTheme(a.ctx)
runtime.WindowSetSystemDefaultTheme(a.ctx)
```

## Screen info

```go
screens, err := runtime.ScreenGetAll(a.ctx)
for _, screen := range screens {
    fmt.Printf("Screen: %s %dx%d\n", screen.ID, screen.Size.Width, screen.Size.Height)
}
```

## wails.json key fields

```json
{
  "name": "MyApp",
  "outputfilename": "MyApp",
  "frontend:install": "npm install",
  "frontend:build": "npm run build",
  "frontend:dev:watcher": "npm run dev",
  "frontend:dev:serverUrl": "auto",
  "wailsVersion": "v2.x.x",
  "version": "2"
}
```

## Embed assets (main.go)

```go
import "embed"

//go:embed all:frontend/dist
var assets embed.FS

// Trong wails.Run options:
AssetServer: &assetserver.Options{
    Assets: assets,
},
```

## Build flags

```bash
# Debug build
wails build -debug

# Production — minimal binary size
wails build -trimpath -ldflags "-s -w"

# Windows — no console window
wails build -windowsconsole=false

# Mac universal binary (Intel + Apple Silicon)
wails build -platform darwin/universal

# Cross-compile Linux từ Mac/Windows
wails build -platform linux/amd64
```
