## Project Overview

**TableStack** is a desktop database GUI client built with [Wails v3](https://v3.wails.io/) — a framework that combines a Go backend with a React/TypeScript frontend rendered in the OS-native WebView.

Supported databases: **PostgreSQL** and **MySQL** (both production-ready via the pluggable driver registry).

## Commands

All commands assume you are at the project root unless noted.

### Development
```bash
wails3 dev         # Start app with hot reload (Go + frontend simultaneously)
```

### Build
```bash
wails3 build       # Compile production binary to build/bin/
```

### Frontend only (inside `frontend/`)
```bash
npm install        # Install dependencies
npm run dev        # Vite dev server (used internally by `wails3 dev`)
npm run build      # Build frontend assets to frontend/dist/
```

### Go tests
```bash
go test ./...                       # Run all Go tests
go test ./internal/db/...           # Run db package tests
go test ./internal/session/...      # Run session manager tests
go test ./internal/store/...        # Run store tests
```

## Architecture

### Go Backend (`app.go`, `internal/`)

`app.go` is the single entry point that Wails exposes to the frontend. Every public method on the `App` struct becomes callable from JavaScript. Key method groups:

- **Profile management** — `SaveProfile`, `DeleteProfile`, `ListProfiles`
- **Credential management** — `SaveConnection`, `GetConnectionPassword`, `ListConnections`, `DeleteConnection` (encrypted via OS keychain)
- **Connection lifecycle** — `Connect`, `Disconnect`, `TestConnection`, `IsConnected`, `ActiveConnections`, `RegisteredDrivers`
- **Active profile tracking** — `SetLastActiveProfile`, `GetLastActiveProfile`
- **Schema exploration** — `ListDatabases`, `ListSchemas`, `ListTables`, `DescribeTable`, `ListIndexes`
- **Query execution** — `ExecuteQuery`
- **Session persistence** — `LoadSession`, `SaveSession`, `SaveLastConnection`, `GetLastConnection`
- **File operations** — `OpenFile`, `SaveFile` (native OS dialogs)
- **Window management** — `ShowMainWindow`

The `App` struct holds:
```go
type App struct {
    ctx            context.Context
    manager        *db.Manager
    profiles       *store.ProfileStore
    credentials    *store.CredentialManager
    sessionManager *session.SessionManager
    app            *application.App   // Wails app ref for dialogs
    sessDir        string             // path to sessions directory
    mu             sync.RWMutex
    activeID       string
    showMain       func() error
}
```

### Internal Packages

```
internal/
  db/
    connection.go   # Profile struct, ConnectResult, TestProfile()
    driver.go       # Driver interface, SchemaExplorer interface, registry (Register/GetDriver/RegisteredDrivers)
    manager.go      # Manager struct: connection map, Add/Remove/Get/CloseAll, schema dispatch
    query.go        # ExecuteQuery() with SELECT/Exec fallback, convertValue()
    types.go        # DatabaseInfo, TableInfo, ColumnInfo, IndexInfo, QueryResult
    postgres/
      postgres.go   # PostgreSQL driver — registered via init(), implements Driver interface
    mysql/
      mysql.go      # MySQL driver — registered via init(), implements Driver interface
  session/
    types.go        # CursorPos, QueryTab, WorkspaceSession
    manager.go      # SessionManager: Save/Load/Delete with atomic writes, defaultSession()
  store/
    profiles.go     # ProfileStore: JSON persistence, Tag/TagPresets, GetAll() masks passwords
    credentials.go  # CredentialManager: AES-256-GCM encryption, master key in OS keychain (go-keyring)
```

### Driver Architecture

Drivers self-register in `init()` and are imported with `_` in `app.go`:
```go
import (
    _ "github.com/thtn-dev/table_stack/internal/db/mysql"
    _ "github.com/thtn-dev/table_stack/internal/db/postgres"
)
```

The `Driver` interface is:
```go
type Driver interface {
    Open(p Profile) (*sql.DB, error)
    ServerVersion(db *sql.DB) (string, error)
    SchemaExplorer
}

type SchemaExplorer interface {
    ListDatabases(db *sql.DB) ([]DatabaseInfo, error)
    ListSchemas(db *sql.DB) ([]string, error)
    ListTables(db *sql.DB, schema string) ([]TableInfo, error)
    DescribeTable(db *sql.DB, schema, table string) ([]ColumnInfo, error)
    ListIndexes(db *sql.DB, schema, table string) ([]IndexInfo, error)
}
```

Each `Connection` in the manager holds a reference to its `Driver`, so all schema methods are routed through the correct driver.

### Credential Security

Passwords are never stored in plaintext. The `CredentialManager`:
1. On first run, generates a 32-byte random master key and saves it to the OS keychain (`tablestack`/`master_key` via `go-keyring`).
2. Encrypts each password with AES-256-GCM (nonce prepended to ciphertext).
3. Stores the base64-encoded blob in `~/.config/dbclient/connections.json`.
4. `profiles.json` never contains passwords — only connection metadata.

### Session Persistence

Each connection profile gets its own workspace session file: `~/.config/dbclient/sessions/<connID>.session.json`.

A `WorkspaceSession` contains:
- `activeConnectionId`, `activeTabId`, `lastSavedAt`
- `tabs []QueryTab` — each with id, title, content, filePath, isDirty, cursorPos, order

Sessions are saved atomically (write to `.tmp` then rename). If the file is missing or corrupt, a default session with one empty tab is returned.

### Wails Bindings

Wails auto-generates TypeScript bindings under `frontend/bindings/` by reflecting the `App` struct and all exposed types. **Do not edit these files manually** — they are regenerated during build/binding tasks.

Generated paths:
- `frontend/bindings/github.com/thtn-dev/table_stack/app.ts` — all `App` methods
- `frontend/bindings/github.com/thtn-dev/table_stack/internal/db/models.ts` — `QueryResult`, `ColumnInfo`, etc.
- `frontend/bindings/github.com/thtn-dev/table_stack/internal/store/models.ts` — `Profile`, `Tag`, `ConnectionConfig`
- `frontend/bindings/github.com/thtn-dev/table_stack/internal/session/models.ts` — `QueryTab`, `WorkspaceSession`, `CursorPos`

### Multi-Window Architecture

The app runs two Wails windows:

| Window | Route | Purpose |
|--------|-------|---------|
| `StartupWindow` | `/#/startup` | Connection manager — create/edit/connect profiles |
| `MainWindow` | `/` | Query workspace — schema tree + tab editor + results |

`main.go` creates the startup window at launch. When a user connects, `ShowMainWindow()` is called from the frontend, which creates or focuses the main window. The startup window hides on navigation.

Routing uses React Router v7 with `HashRouter` (`App.tsx`).

### Frontend (`frontend/src/`)

#### Store Architecture (Two Zustand Stores)

**`useDBStore`** (`src/store/useDBStore.ts`) — connection and schema state:
- `profiles: AsyncState<Profile[]>` — loaded connection profiles
- `activeConnections: Set<string>` — currently connected profile IDs
- `connectingIds: Set<string>` — in-flight connect/disconnect operations
- `schemaTree: Record<string, SchemaNode>` — per-profile schema tree
- `selectedTable: TableRef | null`
- `columnCache: Record<TableCacheKey, AsyncState<ColumnInfo[]>>` — eagerly warmed on table select
- `queryResult: AsyncState<QueryResult>`

**`useEditorStore`** (`src/store/useEditorStore.ts`) — multi-tab editor state:
- `tabs: QueryTab[]` — ordered list of open tabs
- `activeTabId: string | null`
- `activeConnectionId: string | null`
- Actions: `addTab`, `closeTab`, `setActiveTab`, `reorderTabs`, `updateContent`, `updateCursor`, `openFileTab`, `saveActiveTab`, `markSaved`, `flushSession`, `loadSession`
- `useAutoSave(2000)` — hook that debounces session saves 2s after any content change

Both stores use `subscribeWithSelector(immer(...))` middleware.

#### Type System

Components **never** import from `../../bindings/...` directly. All types are re-exported through:
- `src/store/types.ts` — re-exports `Profile`, `Tag`, `TableInfo`, `ColumnInfo`, `QueryResult`, etc. plus UI types (`TableRef`, `AsyncState<T>`, `SchemaNode`)
- `src/store/editor-types.ts` — re-exports `QueryTab`, `WorkspaceSession`, `CursorPos`
- `src/store/index.ts` — barrel for all store exports

#### Components (`frontend/src/components/`)

```
layout/         AppLayout, TitleBar, StatusBar
schema-tree/    SchemaTree, useSchemaTree
query-editor/   QueryEditor (CodeMirror 6)
result-panel/   ResultPanel (TanStack Table + virtual scroll)
tab-bar/        TabBar, TabItem, TabContextMenu
connection/     ConnectionDialog, ConnectionFormFields, connectionFormSchema
settings/       SettingsDialog, tabs/ThemeTab, tabs/ChatTab
ui/             shadcn/ui + Radix UI primitives (no logic here)
```

#### Windows (`frontend/src/windows/`)

- `StartupWindow.tsx` — connection list sidebar + connection form; calls `ShowMainWindow()` on connect
- `MainWindow.tsx` — full workspace: `AppLayout` with `SchemaTree` sidebar, `TabBar`, `QueryEditor`, `ResultPanel`; handles session lifecycle and keyboard shortcuts

#### Keyboard Shortcuts (MainWindow)

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd+N` | New tab |
| `Ctrl/Cmd+O` | Open SQL file |
| `Ctrl/Cmd+S` | Save file (in-place) |
| `Ctrl/Cmd+Shift+S` | Save As |
| `Ctrl/Cmd+W` | Close active tab |
| `Ctrl/Cmd+Tab` | Next tab |
| `Ctrl/Cmd+Shift+Tab` | Previous tab |

### Data Flow

```
User action in UI
  → Zustand store action (useDBStore or useEditorStore)
    → Wails generated binding (frontend/bindings/.../app.ts)
      → Go App method (app.go)
        → internal/db or internal/session or internal/store
          → PostgreSQL / MySQL
```

Results propagate back and are cached in the Zustand stores.

## Key Technologies

| Layer | Stack |
|-------|-------|
| Desktop framework | Wails v3 (alpha.74) |
| Backend language | Go 1.25 |
| DB drivers | `lib/pq` (PostgreSQL), `go-sql-driver/mysql` (MySQL) |
| Credential security | `zalando/go-keyring` + AES-256-GCM |
| Frontend framework | React 19 + TypeScript 6 |
| Routing | React Router v7 (HashRouter) |
| Build tool | Vite 8 |
| Styling | TailwindCSS 4 |
| State | Zustand 5 (two stores) |
| SQL editor | CodeMirror 6 (`@uiw/react-codemirror`) |
| Data grid | TanStack React Table 8 + `@tanstack/react-virtual` |
| UI primitives | shadcn/ui + Radix UI |
| Icons | `@hugeicons/react` + `@hugeicons/core-free-icons` |
| Forms | React Hook Form + Zod |

## File Conventions

```
app.go                              # All Wails-exposed App methods
main.go                             # Wails app setup, window creation
internal/
  db/
    driver.go                       # Driver interface + registry
    connection.go                   # Profile type, TestProfile
    manager.go                      # Manager (connection map)
    query.go                        # ExecuteQuery
    types.go                        # Shared data types
    postgres/postgres.go            # PostgreSQL driver (registers via init)
    mysql/mysql.go                  # MySQL driver (registers via init)
  session/
    types.go                        # QueryTab, WorkspaceSession, CursorPos
    manager.go                      # SessionManager
  store/
    profiles.go                     # ProfileStore + Tag system
    credentials.go                  # CredentialManager (AES-256-GCM)
frontend/
  bindings/                         # Auto-generated — NEVER edit manually
  src/
    App.tsx                         # HashRouter with / and /#/startup routes
    windows/
      MainWindow.tsx                # Main workspace window
      StartupWindow.tsx             # Connection manager window
    components/
      layout/                       # AppLayout, TitleBar, StatusBar
      schema-tree/                  # Left-panel schema browser
      query-editor/                 # CodeMirror SQL editor
      result-panel/                 # Query results grid
      tab-bar/                      # Multi-tab bar
      connection/                   # Connection form dialog
      settings/                     # Settings dialog
      ui/                           # shadcn/ui primitives
    store/
      useDBStore.ts                 # Connection + schema state
      useEditorStore.ts             # Tab + session state + useAutoSave
      types.ts                      # Re-exported DB types + UI types
      editor-types.ts               # Re-exported session types
      index.ts                      # Barrel export
    hooks/
      useTheme.ts
      use-mobile.ts
```

## Rules (`.claude/rules/`)

- `.claude/rules/go_wails_desktop_development.md` — Go backend + Wails architecture conventions: `app.go` binding patterns, error handling, connection management, concurrency rules, persistence expectations.
- `.claude/rules/react_typescript_best_practices.md` — Frontend conventions: component structure, store patterns, Wails binding usage boundaries, async error handling, UI/accessibility conventions.
- `.claude/rules/context7.md` — Use Context7 MCP to fetch current documentation for any library or framework.

## Skills (`.claude/skills/`)

- `.claude/skills/go-wails-skill/SKILL.md` — Task workflow for Go + Wails work: assess, plan, execute, validate. Includes Wails-specific lifecycle/runtime patterns and implementation checklists.

## How to Apply in This Repo

- For Go/backend tasks: `.claude/rules/go_wails_desktop_development.md` + `go-wails-skill`
- For frontend tasks: `.claude/rules/react_typescript_best_practices.md`
- For cross-boundary tasks (frontend calling Go bindings): apply both rule files together
- For any library/framework questions: use Context7 MCP (`.claude/rules/context7.md`)
- Never modify generated files under `frontend/bindings/`

## Persistent Storage Locations

All files are stored under `os.UserConfigDir()` (e.g. `~/.config/dbclient/` on Linux, `~/Library/Application Support/dbclient/` on macOS):

| File | Contents |
|------|----------|
| `profiles.json` | Connection profiles (no passwords) |
| `connections.json` | Encrypted credentials (AES-256-GCM) |
| `sessions/<connID>.session.json` | Per-connection workspace state |
| `sessions/last_connection.txt` | Last used connection ID |

The master encryption key lives in the OS keychain under service `tablestack`, account `master_key`.

## Notes

- `frontend/bindings/` is fully auto-generated — changes there will be overwritten on next build.
- All Wails bindings must be called **only inside Zustand store actions** — never directly in React components.
- The `TestProfile()` function opens → queries version → closes immediately and does **not** store the connection.
- `ProfileStore.GetAll()` always returns passwords masked as `"********"`. Internal use (e.g. `GetByID`) returns the actual value.
- `SaveProfile` in `app.go` skips the credential update if the caller echoes back the display mask (`"********"`) or sends an empty password — this allows editing metadata fields without re-entering the password.
- When a profile with an active connection is saved with changed settings, `app.go` automatically reconnects so the live session uses the updated DSN.
