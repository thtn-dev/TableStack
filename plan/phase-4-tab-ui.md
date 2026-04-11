# Phase 4 — Frontend: Tab UI Components

## Status

✅ **Done**

## Checklist

- [x] Tạo `frontend/src/components/tab-bar/TabContextMenu.tsx` — right-click context menu
- [x] Tạo `frontend/src/components/tab-bar/TabItem.tsx` — single tab button
- [x] Tạo `frontend/src/components/tab-bar/TabBar.tsx` — tab strip with + button
- [x] Tạo `frontend/src/components/tab-bar/index.ts` — barrel export
- [x] Sửa `QueryEditor.tsx` — controlled component nhận props (`tabId`, `content`, `initialCursor`, `onContentChange`, `onCursorChange`)
- [x] `npx tsc --noEmit` pass (no TypeScript errors)

## Tab UI Design

```
┌──────────────────────────────────────────────────┐
│ [● Query 1 ×] [Query 2 ×] [users.sql ×] [+]      │
└──────────────────────────────────────────────────┘
```

- Active tab: `bg-background` + after pseudo-element covers bottom border
- Dirty tab: amber `●` prefix indicator
- Close button: visible on hover + always visible on active tab (opacity-60)
- Middle-click closes tab
- Overflow: `overflow-x-auto` with `scrollbar-width: none`

## Context Menu (right-click)

- Close / Close Others / Close All / Close to the Right
- Save / Save As…
- Copy Path (only when `filePath != null`)

Uses shadcn `ContextMenu` (not DropdownMenu) — more natural UX for right-click.

## QueryEditor Refactor

Before: self-managed local `sql_value` state, no props
After: fully controlled — `content` prop drives editor, mutations via `onContentChange`/`onCursorChange` callbacks

- `key={activeTab.id}`: remounts CodeMirror on tab switch → clean cursor state restore
- `initialCursor`: seeded into display state (`cursorLine`/`cursorCol`) on mount
- `selectedTable` auto-fill: calls `onContentChange(newSql)` instead of local setState

## Files Changed

- `frontend/src/components/tab-bar/TabContextMenu.tsx` — TẠO MỚI
- `frontend/src/components/tab-bar/TabItem.tsx` — TẠO MỚI
- `frontend/src/components/tab-bar/TabBar.tsx` — TẠO MỚI
- `frontend/src/components/tab-bar/index.ts` — TẠO MỚI
- `frontend/src/components/query-editor/QueryEditor.tsx` — REFACTOR

## Last Updated

2026-04-11
