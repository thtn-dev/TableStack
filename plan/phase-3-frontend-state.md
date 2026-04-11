# Phase 3 — Frontend: State Management

## Status

✅ **Done**

## Checklist

- [x] Tạo `frontend/src/store/editor-types.ts` — CursorPos, QueryTab, WorkspaceSession type aliases từ bindings
- [x] Tạo `frontend/src/store/useEditorStore.ts` — Zustand store với subscribeWithSelector + immer
- [x] `loadSession(session)` — load tab state từ WorkspaceSession
- [x] `addTab(partial?)` — thêm tab mới với title "Query N" tự động
- [x] `closeTab(tabId)` — xóa tab, recompute order, chọn tab kế tiếp
- [x] `setActiveTab(tabId)` — đổi active tab
- [x] `reorderTabs(fromIndex, toIndex)` — drag-drop reorder với order sync
- [x] `updateContent(tabId, content)` — mark isDirty = true
- [x] `updateCursor(tabId, cursor)` — update cursor position
- [x] `markSaved(tabId, filePath, title)` — sau khi save file thành công
- [x] `openFileTab()` — gọi OpenFile() binding, addTab với kết quả
- [x] `saveActiveTab(forceDialog?)` — gọi SaveFile() binding, markSaved()
- [x] `flushSession()` — immediate SaveSession() không qua debounce
- [x] `useAutoSave(delayMs=2000)` hook — subscribe store, debounce 2s, auto-save
- [x] Export selectors: `selectActiveTab`, `selectHasDirtyTabs`
- [x] Thêm exports vào `frontend/src/store/index.ts`
- [x] `npx tsc --noEmit` pass (no TypeScript errors)

## Implementation Notes

- `makeTab()`: spread `partial` over defaults để caller có thể override bất kỳ field nào; `order` luôn = `tabs.length` (pin sau cùng)
- `nextQueryTitle()`: scan regex `/^Query (\d+)$/` để tìm số nhỏ nhất chưa dùng — tránh gap holes (xóa "Query 2" → tiếp theo vẫn là "Query 2")
- `useAutoSave`: dùng `subscribeWithSelector` subscription trong `useEffect` — unsubscribe + clear timer khi unmount. Equality fn so sánh `tabs` by reference (Immer đảm bảo new ref khi mutate)
- `openFileTab`: connectionId bị thiếu trong kết quả từ Go (Go chỉ populate filePath/content/title) → patch lại bằng `activeConnectionId` từ store
- `saveActiveTab(forceDialog=true)`: force `filePath: null` để trigger Save As dialog dù tab đã có file

## Decisions

- **Không dùng `enableMapSet()`**: EditorStore chỉ dùng plain arrays, không cần Set/Map (khác DBStore)
- **`useAutoSave` là hook riêng**: Không nhúng debounce logic vào store để store thuần là state machine, hook riêng dễ test và dễ unmount
- **`SaveSession` nhận `WorkspaceSession` object**: Build object inline trong `flushSession` và `useAutoSave` thay vì store thêm `lastSavedAt` field (tránh trigger subscription loop)

## Files Changed

- `frontend/src/store/editor-types.ts` — TẠO MỚI
- `frontend/src/store/useEditorStore.ts` — TẠO MỚI
- `frontend/src/store/index.ts` — THÊM exports

## Last Updated

2026-04-11
