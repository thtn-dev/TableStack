# Phase 5 — Frontend: Connection Switch & App Lifecycle

## Status

✅ **Done**

## Checklist

- [x] Import `TabBar` vào `MainWindow.tsx`, hiển thị trên editor area
- [x] Wire `QueryEditor` props từ `selectActiveTab` trong store
- [x] `useAutoSave(2000)` hook call trong `MainWindow`
- [x] `useEffect` mount: `GetLastConnection()` → `LoadSession()` → `loadSession()`
- [x] `useEffect` on `activeProfileId` change: `flushSession()` → `LoadSession(newID)` → `loadSession()` → `SaveLastConnection(newID)`
- [x] `beforeunload` event → `flushSession()`
- [x] Global keyboard shortcuts:
  - `Ctrl+N` → `addTab()`
  - `Ctrl+O` → `openFileTab()`
  - `Ctrl+S` → `saveActiveTab(false)`
  - `Ctrl+Shift+S` → `saveActiveTab(true)`
  - `Ctrl+W` → `closeTab(activeTabId)`
  - `Ctrl+Tab` → next tab
  - `Ctrl+Shift+Tab` → prev tab
- [x] Empty-tabs fallback UI: "No tabs open — press Ctrl+N to create one"
- [x] `npx tsc --noEmit` pass

## Implementation Notes

- `prevProfileIdRef`: track previous `activeProfileId` để tránh re-trigger session load khi profile ID không thực sự thay đổi (e.g. re-render)
- Session load flow: `init()` chạy một lần khi mount (không phụ thuộc vào deps để tránh loop); `switchSession()` chạy khi activeProfileId thay đổi
- Keyboard shortcut handler: dùng `switch(true)` với condition expressions để xử lý Ctrl+Shift combinations sạch
- `Ctrl+Shift+S` dùng `e.key === "S"` (uppercase) vì khi Shift được giữ, key value là chữ hoa

## Connection Switch Flow

```
activeProfileId thay đổi
  → flushSession() (save old session)
  → LoadSession(newID) → loadSession(session)
  → SaveLastConnection(newID)
```

## App Close Flow

```
beforeunload
  → flushSession() (best-effort, void — no await on unload)
```

Note: `beforeunload` không thể await Promise. `flushSession` là fire-and-forget ở đây. Wails desktop apps không bị browser restriction giống web, nhưng ta vẫn dùng auto-save debounce (2s) nên data loss window tối đa là 2s.

## TitleBar ConnectionDropdown

- Thay `FAKE_CONNECTIONS` bằng real data từ `useDBStore`
- Chỉ hiển thị connected profiles (`activeConnections.has(p.id)`)
- Indicator color: `profile.tag?.color` → fallback theo driver (postgres=blue, mysql=orange)
- Khi không có connection: hiển thị "No active connection" placeholder
- `handleSelect`: gọi `setActiveProfile(id)` + `loadSchemaTree(id)` — session flush/load tự động qua `activeProfileId` effect trong MainWindow
- Dropdown item: hiển thị `host:port/database` ở dòng phụ

## Files Changed

- `frontend/src/windows/MainWindow.tsx` — REFACTOR LỚN
- `frontend/src/components/layout/TitleBar.tsx` — WIRE ConnectionDropdown thật

## Last Updated

2026-04-11
