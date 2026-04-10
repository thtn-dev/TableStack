package main

import (
	"embed"
	"log"
	"sync"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

// Wails uses Go's `embed` package to embed the frontend files into the binary.
// Any files in the frontend/dist folder will be embedded into the binary and
// made available to the frontend.
// See https://pkg.go.dev/embed for more information.

//go:embed all:frontend/dist
var assets embed.FS

func calculateStartupWindowSize(app *application.App) (int, int) {
	const (
		aspectWidth  = 4
		aspectHeight = 3
		minWidth     = 640
		minHeight    = 480
		fallbackW    = 800
		fallbackH    = 600
		maxPercent   = 70
	)

	screen := app.Screen.GetPrimary()
	if screen == nil {
		return fallbackW, fallbackH
	}

	availableW := screen.WorkArea.Width
	availableH := screen.WorkArea.Height
	if availableW <= 0 || availableH <= 0 {
		availableW = screen.Size.Width
		availableH = screen.Size.Height
	}
	if availableW <= 0 || availableH <= 0 {
		return fallbackW, fallbackH
	}

	maxW := (availableW * maxPercent) / 100
	maxH := (availableH * maxPercent) / 100
	if maxW <= 0 || maxH <= 0 {
		return fallbackW, fallbackH
	}

	width := maxW
	height := (width * aspectHeight) / aspectWidth
	if height > maxH {
		height = maxH
		width = (height * aspectWidth) / aspectHeight
	}

	if width < minWidth {
		width = minWidth
		height = (width * aspectHeight) / aspectWidth
	}
	if height < minHeight {
		height = minHeight
		width = (height * aspectWidth) / aspectHeight
	}

	if width > availableW {
		width = availableW
		height = (width * aspectHeight) / aspectWidth
	}
	if height > availableH {
		height = availableH
		width = (height * aspectWidth) / aspectHeight
	}

	return width, height
}

func createMainWindow(app *application.App, onClose func()) *application.WebviewWindow {
	mainWindow := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:         "Table stack",
		Frameless:     true,
		MinWidth:      1024,
		MinHeight:     768,
		DisableResize: false,
		Mac: application.MacWindow{
			InvisibleTitleBarHeight: 50,
			Backdrop:                application.MacBackdropTranslucent,
			TitleBar:                application.MacTitleBarHiddenInset,
		},
		Windows: application.WindowsWindow{
			DisableFramelessWindowDecorations: false,
		},
		BackgroundColour: application.NewRGB(27, 38, 54),
		URL:              "/",
	})

	mainWindow.OnWindowEvent(events.Common.WindowClosing, func(_ *application.WindowEvent) {
		onClose()
		app.Quit()
	})

	return mainWindow
}

// main function serves as the application's entry point. It initializes the application, creates a window,
// then runs it and logs any error that might occur.
func main() {
	appService := &App{}

	// Create a new Wails application by providing the necessary options.
	// Variables 'Name' and 'Description' are for application metadata.
	// 'Assets' configures the asset server with the 'FS' variable pointing to the frontend files.
	// 'Services' is a list of Go services. Exported methods are exposed to the frontend.
	// 'Mac' options tailor the application when running an macOS.
	app := application.New(application.Options{
		Name:        "TableStack",
		Description: "Desktop SQL explorer built with Wails",
		Services: []application.Service{
			application.NewService(appService),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: false,
		},
	})

	var mainWindow *application.WebviewWindow
	var mainMu sync.Mutex
	var isQuitting bool

	appService.showMain = func() error {
		mainMu.Lock()
		defer mainMu.Unlock()

		if mainWindow == nil {
			mainWindow = createMainWindow(app, func() {
				// onClose is called from within mainWindow's WindowClosing handler.
				// Acquire mainMu so the isQuitting flag is visible to the
				// startupWindow handler which also runs under mainMu.
				mainMu.Lock()
				isQuitting = true
				mainMu.Unlock()
			})
		}

		mainWindow.Maximise()
		mainWindow.Focus()
		return nil
	}

	startupWidth, startupHeight := calculateStartupWindowSize(app)

	startupWindow := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:            "TableStack Startup",
		Width:            startupWidth,
		Height:           startupHeight,
		Frameless:        true,
		DisableResize:    true,
		AlwaysOnTop:      true,
		BackgroundColour: application.NewRGB(20, 28, 41),
		Mac: application.MacWindow{
			Backdrop: application.MacBackdropTranslucent,
			TitleBar: application.MacTitleBarHiddenInset,
		},
		URL: "/#/startup",
	})

	startupWindow.OnWindowEvent(events.Common.WindowClosing, func(_ *application.WindowEvent) {
		mainMu.Lock()
		defer mainMu.Unlock()

		if isQuitting {
			return
		}
		if mainWindow == nil {
			app.Quit()
			return
		}
		mainWindow.Focus()
	})

	// Run the application. This blocks until the application has been exited.
	err := app.Run()

	// If an error occurred while running the application, log it and exit.
	if err != nil {
		log.Fatal(err)
	}
}
