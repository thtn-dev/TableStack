# Phase 1 — Backend: SessionManager

## Status

✅ **Done**

## Checklist

- [x] Tạo `internal/session/types.go` — CursorPos, QueryTab, WorkspaceSession structs với json tags
- [x] Tạo `internal/session/manager.go` — SessionManager với NewSessionManager, Save, Load, Delete, defaultSession
- [x] Atomic write: ghi `.tmp` trước rồi `os.Rename` sang file chính
- [x] Thread-safe: `sync.RWMutex` (Write lock cho Save/Delete, RLock cho Load)
- [x] Load corrupt JSON → trả default session thay vì crash
- [x] Load file không tồn tại → trả default session
- [x] defaultSession: 1 tab "Query 1", tab.ID = activeTabID
- [x] Tạo `internal/session/manager_test.go` — 10 test cases
- [x] Tất cả tests PASS (`go test ./internal/session/... -v`)

## Test Results

```
=== RUN   TestSave_NewSession        PASS
=== RUN   TestSave_OverwriteExisting PASS
=== RUN   TestSave_AtomicWrite       PASS
=== RUN   TestLoad_ExistingSession   PASS
=== RUN   TestLoad_FileNotExist      PASS
=== RUN   TestLoad_CorruptJSON       PASS
=== RUN   TestDelete_ExistingFile    PASS
=== RUN   TestDelete_NonExistentFile PASS
=== RUN   TestConcurrency            PASS
=== RUN   TestDefaultSession         PASS
PASS ok  github.com/thtn-dev/table_stack/internal/session  0.727s
```

Note: `-race` flag không khả dụng trên Windows do CGo issue, nhưng TestConcurrency đã test với 20 goroutines đồng thời.

## Implementation Notes

- Session dir: `os.UserConfigDir()/dbclient/sessions/` (nhất quán với ProfileStore)
- File path per connection: `{sessionDir}/{connID}.session.json`
- Dùng `github.com/google/uuid` (đã có trong go.mod) để tạo tab ID trong defaultSession
- Pattern atomic write copy từ `internal/store/profiles.go:persist()`

## Decisions

- **Load error handling**: Không return error cho file không tồn tại hoặc JSON invalid — luôn fallback về defaultSession. Lý do: frontend không cần handle error case, tránh crash khi lần đầu dùng
- **Lock granularity**: RLock cho Load (đọc file từ disk, không giữ in-memory state), Lock cho Save/Delete

## Files Changed

- `internal/session/types.go` — TẠO MỚI
- `internal/session/manager.go` — TẠO MỚI
- `internal/session/manager_test.go` — TẠO MỚI

## Last Updated

2026-04-11
