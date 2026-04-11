# Phase 2 — Backend: Wails Bindings

## Status

✅ **Done**

## Checklist

- [x] Thêm `sessionManager *session.SessionManager` field vào App struct (`app.go`)
- [x] Thêm `app *application.App` field vào App struct (để dùng Wails dialogs)
- [x] Thêm `sessDir string` field vào App struct (path sessions directory)
- [x] Cập nhật `ServiceStartup`: init sessionManager tại `{configDir}/sessions/`
- [x] Implement `LoadSession(connID string) (*session.WorkspaceSession, error)`
- [x] Implement `SaveSession(connID string, sess session.WorkspaceSession) error`
- [x] Implement `OpenFile() (*session.QueryTab, error)` — Wails file open dialog
- [x] Implement `SaveFile(tab session.QueryTab) (*session.QueryTab, error)` — Wails save dialog
- [x] Implement `SaveLastConnection(connID string) error` — writes `last_connection.txt`
- [x] Implement `GetLastConnection() (string, error)` — reads `last_connection.txt`
- [x] Thêm `appService.app = app` vào `main.go` sau `app := application.New(...)`
- [x] `go build .` thành công (no errors)
- [x] `go test ./internal/...` tất cả pass
- [x] `wails3 generate bindings` — 28 methods, 12 models, 1 service

## Bindings Generated

```
Processed: 415 Packages, 1 Service, 28 Methods, 0 Enums, 12 Models, 0 Events in 2.6s
Output: frontend/bindings/github.com/thtn-dev/table_stack/
```

6 methods mới trong `app.js`:
- `GetLastConnection()`
- `LoadSession(connID)`
- `OpenFile()`
- `SaveFile(tab)`
- `SaveLastConnection(connID)`
- `SaveSession(connID, sess)`

Models sinh ra trong `frontend/bindings/.../internal/session/models.js`:
- `CursorPos`, `QueryTab`, `WorkspaceSession`

## Implementation Notes

- `a.app` field được set từ `main.go` sau khi `application.New(...)` — không thể lấy từ `ServiceOptions`
- Pattern: `appService.app = app` đặt sau `app := application.New(...)` và trước `appService.showMain = ...`
- Wails v3 alpha.74 dialog API: `app.Dialog.OpenFile().AddFilter(...).PromptForSingleSelection()` và `app.Dialog.SaveFile().SetFilename(...).AddFilter(...).PromptForSingleSelection()`
- `SaveFileDialogStruct` không có `SetTitle()` — chỉ dùng `SetFilename()`
- `last_connection.txt` đặt tại `{sessDir}/last_connection.txt` (cùng thư mục sessions)

## Decisions

- **`a.app` vs closure**: Dùng field thay vì closure vì `OpenFile`/`SaveFile` cần gọi dialog từ bất kỳ method nào trên App, không chỉ từ `showMain`
- **`SaveFile` Save-in-place**: Nếu `tab.FilePath != nil`, ghi thẳng không mở dialog — tiết kiệm UX friction cho Ctrl+S
- **Error nil on cancel**: Cả `OpenFile` và `SaveFile` trả `nil, nil` khi user cancel dialog — frontend kiểm tra `result === null`

## Files Changed

- `app.go` — THÊM fields + 6 methods + `sessDir` init trong ServiceStartup
- `main.go` — THÊM `appService.app = app`
- `frontend/bindings/` — TÁI SINH (auto-generated)

## Last Updated

2026-04-11
