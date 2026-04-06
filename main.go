package main

import (
	"embed"
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed frontend/dist
var assets embed.FS

func main() {
	service := NewAppService()

	app := application.New(application.Options{
		Name: "table_stack",
		Services: []application.Service{
			application.NewService(service),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
	})

	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:            "Table stack",
		Width:            1024,
		Height:           768,
		StartState:       application.WindowStateMaximised,
		BackgroundColour: application.NewRGBA(27, 38, 54, 255),
		Frameless:        true,
	})

	err := app.Run()

	if err != nil {
		log.Fatalf("app run failed: %v", err)
	}
}
