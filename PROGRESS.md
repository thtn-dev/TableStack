# TableStack Edit/Delete — Progress Tracker

## Phase 1 — Backend: Mutation Engine

| Task | Status | Notes | Date |
|------|--------|-------|------|
| 1.1 Request/Response structs | ✅ Done | `internal/mutation/types.go` — CellChange, UpdateRowRequest, UpdateBulkRequest, DeleteRowsRequest, MutationResponse, MutationError + error constants | 2026-04-11 |
| 1.2 SQLBuilder interface + Postgres/MySQL impl | ✅ Done | `internal/mutation/sql_builder.go` — PostgresSQLBuilder ($1,$2 + double-quotes), MySQLSQLBuilder (? + backtick). Identifier validation via `^[a-zA-Z0-9_]+$` regex. Optimistic lock via OldValue. | 2026-04-11 |
| 1.3 MutationService | ✅ Done | `internal/mutation/service.go` — executeUpdateWith / executeDeleteWith accept `dbTxRunner` interface for testability. Rollback on any error. | 2026-04-11 |
| 1.4 Wails Bindings | ✅ Done | `app.go` — `UpdateRows` and `DeleteRows` public methods. Binding stubs added to `frontend/bindings/.../app.ts` with FNV-32a computed IDs (119372497, 344276775). Run `wails3 dev` to regenerate authoritative IDs. | 2026-04-11 |
| 1.5 Unit Tests — SQLBuilder | ✅ Done | `internal/mutation/sql_builder_test.go` — 14 tests covering single/multi column, composite PK, optimistic lock, empty changes/PK, SQL injection (column + table name), MySQL placeholders | 2026-04-11 |
| 1.5 Unit Tests — Service | ✅ Done | `internal/mutation/service_test.go` — 7 tests: success/conflict/DB error/partial fail for update; success/row-not-found/constraint-violation for delete. All using custom mock (no external deps). | 2026-04-11 |

**Test results:** `go test ./internal/mutation/... -v` → 21 tests, all PASS ✅

## Phase 2 — Frontend: Edit Mode & Dirty Tracking

| Task | Status | Notes | Date |
|------|--------|-------|------|
| 2.1 Zustand Mutation Store | ✅ Done | `frontend/src/store/mutationStore.ts` — dirtyRows (Map), selectedRowKeys (Set), editingCell, isSaving, isDeleting. Actions: setCellValue, clearDirtyRow, clearAllDirty, setEditingCell, clearEditingCell, toggleRowSelection, selectAllRows, deselectAllRows, saveChanges, deleteSelected. | 2026-04-11 |
| 2.2 EditableCell Component | ✅ Done | `frontend/src/components/result-panel/EditableCell.tsx` — Read/edit mode, double-click to edit, Enter=commit, Escape=cancel, Tab=commit, boolean uses select, dirty highlight (yellow bg), PK columns read-only. | 2026-04-11 |
| 2.3 Row Selection | ✅ Done | `ResultPanel.tsx` — Checkbox column, select-all header, selection toolbar with "X rows selected" + "Delete Selected" + "Deselect All" | 2026-04-11 |
| 2.4 Action Bar | ✅ Done | `ResultPanel.tsx` — Floating bottom bar appears when `dirtyRows.size > 0`: "X rows modified", "Save Changes" (primary), "Discard" (secondary) | 2026-04-11 |

## Phase 3 — Integration

| Task | Status | Notes | Date |
|------|--------|-------|------|
| 3.1 Save Flow | ✅ Done | `useMutationStore.saveChanges(connID, schema, table)` — maps dirtyRows → UpdateBulkRequest → UpdateRows binding → handles success/CONFLICT/CONSTRAINT_VIOLATION with toast messages | 2026-04-11 |
| 3.2 Delete Flow | ✅ Done | `useMutationStore.deleteSelected(connID, schema, table)` — parses selectedRowKeys JSON → DeleteRowsRequest → DeleteRows binding → AlertDialog confirm → handles success/ROW_NOT_FOUND/CONSTRAINT_VIOLATION | 2026-04-11 |
| 3.3 TypeScript Types | ✅ Done | `frontend/src/types/mutation.ts` — CellChange, UpdateRowRequest, UpdateBulkRequest, DeleteRowsRequest, MutationResponse, MutationError, DirtyRow, EditingCell, MutationErrorCode, buildRowKey(), extractPrimaryKeys() | 2026-04-11 |

## Phase 4 — Bulk & UX

| Task | Status | Notes | Date |
|------|--------|-------|------|
| 4.1 Bulk Cell Edit | ⬜ Not started | | |
| 4.2 Keyboard Shortcuts | ✅ Done | `Ctrl+S` saves dirty rows (capture phase, overrides MainWindow file-save when grid has changes). `Ctrl+Z` undoes last cell edit via cellHistory. `Delete`/`Backspace` opens delete confirm when rows selected. `Escape` cancels editing or deselects. | 2026-04-11 |
| 4.3 Visual Indicators | ✅ Done | Dirty cell → yellow bg. Selected row → red/destructive bg. Row dirty → yellow-tinted row. Saving spinner. | 2026-04-11 |
| 4.4 Pagination + Dirty State | ✅ Done | QueryEditor warns via toast + clears dirty state before running a new query. VirtualTable auto-clears dirty/selection on mount (new result key). | 2026-04-11 |

## Phase 5 — Hardening

| Task | Status | Notes | Date |
|------|--------|-------|------|
| 5.1 Frontend Validation | ✅ Done | `isGenerated` prop → read-only cells with tooltip. Inline warning for invalid numeric input. NOT NULL hint when required field is cleared. `isPrimaryKey` guard was already in place. | 2026-04-11 |
| 5.2 GetTableEditMetadata | ✅ Done | `IsGenerated bool` added to `ColumnInfo` in `internal/db/types.go`. Postgres detects `nextval()` defaults + `is_generated='ALWAYS'`. MySQL detects `auto_increment`, `VIRTUAL GENERATED`, `STORED GENERATED`. Frontend `ColumnInfo` type augmented with `isGenerated?: boolean`. | 2026-04-11 |
| 5.3 Edge Cases | ✅ Done | No-PK banner shown in ResultPanel when `pkColumns.length === 0`. Batch >1000 rows: toast warning before save/delete. Unsupported types (json, jsonb, bytea, xml, arrays) → read-only display showing type name. Ctrl+Z undo history (`cellHistory` array in mutationStore). | 2026-04-11 |

<!-- Status options: ⬜ Not started | 🔄 In progress | ✅ Done | ❌ Blocked -->

---

## Architecture Notes

### Binding ID note
`UpdateRows` (ID 119372497) and `DeleteRows` (ID 344276775) in `app.ts` were computed
via `fnv32a("main.App.<MethodName>")`. Run `wails3 dev` or `wails3 generate bindings`
to regenerate with Wails-authoritative values. The mutation models binding
(`internal/mutation/models.ts`) will also be fully regenerated.

### Edit enablement logic
Edit/delete mode is only active when:
1. A table is selected (`useDBStore.selectedTable != null`)
2. An active connection exists (`useDBStore.activeProfileId != null`)
3. The table has at least one PK column in the column cache (`pkColumns.length > 0`)

If any condition fails, ResultPanel renders in read-only mode (no checkboxes, no double-click).
