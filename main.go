package main

import (
	"embed"
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

// Wails uses Go's `embed` package to embed the frontend files into the binary.
// Any files in the frontend/dist folder will be embedded into the binary and
// made available to the frontend.
// See https://pkg.go.dev/embed for more information.

//go:embed all:frontend/dist
var assets embed.FS

func createMainWindow(app *application.App, hidden bool) *application.WebviewWindow {
	mainWindow := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:         "Table stack",
		Frameless:     true,
		Hidden:        hidden,
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

	// Pre-create main window hidden to avoid Chrome_WidgetWin_0 unregister error
	// (creating a new window inside WindowClosing causes Error 1412 on Windows).
	mainWindow := createMainWindow(app, true)

	startupWindow := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:            "TableStack Startup",
		Width:            620,
		Height:           440,
		DisableResize:    true,
		AlwaysOnTop:      true,
		BackgroundColour: application.NewRGB(20, 28, 41),
		URL:              "/#/startup",
	})

	startupWindow.OnWindowEvent(events.Common.WindowClosing, func(_ *application.WindowEvent) {
		mainWindow.Maximise()
		mainWindow.Focus()
	})

	// Run the application. This blocks until the application has been exited.
	err := app.Run()

	// If an error occurred while running the application, log it and exit.
	if err != nil {
		log.Fatal(err)
	}
}
