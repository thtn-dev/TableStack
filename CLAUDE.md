# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**TableStack** is a desktop PostgreSQL GUI client built with [Wails v2](https://wails.io/) — a framework that combines a Go backend with a React/TypeScript frontend rendered in the OS-native WebView.

## Commands

All commands assume you are at the project root unless noted.

### Development
```bash
wails dev          # Start app with hot reload (Go + frontend simultaneously)
```

### Build
```bash
wails build        # Compile production binary to build/bin/
```

### Frontend only (inside `frontend/`)
```bash
npm install        # Install dependencies
npm run dev        # Vite dev server (used internally by `wails dev`)
npm run build      # Build frontend assets to frontend/dist/
```

### Go tests
```bash
go test ./...                    # Run all Go tests
go test ./internal/db/...        # Run db package tests
```

## Architecture

### Go Backend (`app.go`, `internal/`)

`app.go` is the single entry point that Wails exposes to the frontend. Every public method on the `App` struct becomes callable from JavaScript. Key method groups:
- **Profile management** — `SaveProfile`, `DeleteProfile`, `ListProfiles` (persisted in OS config dir via `internal/store/profiles.go`)
- **Connection lifecycle** — `Connect`, `Disconnect`, `TestConnection`, `IsConnected`, `ActiveConnections`
- **Schema exploration** — `ListDatabases`, `ListSchemas`, `ListTables`, `DescribeTable`, `ListIndexes`
- **Query execution** — `ExecuteQuery`

Internal packages under `internal/`:
- `db/connector.go` — DSN building and connection pooling
- `db/manager.go` — Connection lifecycle (open/close, maps profileID → `*sql.DB`)
- `db/schema.go` — `information_schema` queries for metadata
- `db/query.go` — Raw SQL execution, returns `QueryResult{Columns, Rows, AffectedRows, Duration, Error}`
- `store/profiles.go` — JSON persistence in the OS user-config directory

### Wails Bindings

Wails auto-generates TypeScript bindings at `frontend/wailsjs/go/main/App.ts` by reflecting the `App` struct. **Do not edit these files manually** — they are regenerated on `wails dev`/`wails build`. Import them in frontend code as:
```ts
import { ExecuteQuery, Connect, ListTables } from "@wailsjs/go/main/App";
```
The `@wailsjs` path alias is configured in `frontend/vite.config.ts`.

### Frontend (`frontend/src/`)

State is managed with **Zustand** (single store in `src/store/`). Components are under `src/components/`:
- `layout/` — `AppLayout`, `TitleBar`, `StatusBar`
- `schema-tree/` — Left-panel schema browser (profiles → databases → schemas → tables)
- `query-editor/` — CodeMirror 6 SQL editor
- `result-panel/` — TanStack Table data grid showing query results
- `connection/` — Connection dialog (React Hook Form)
- `ui/` — shadcn/ui + Radix UI primitives (do not add logic here)

### Data Flow

```
User action in UI
  → Zustand store action
    → Wails JS binding (wailsjs/go/main/App)
      → Go App method (app.go)
        → internal/db package
          → PostgreSQL
```

Results propagate back through the same chain and are cached in the Zustand store.

## Key Technologies

| Layer | Stack |
|-------|-------|
| Desktop framework | Wails v2 |
| Backend language | Go 1.23 |
| DB driver | `lib/pq` (PostgreSQL only) |
| Frontend framework | React 19 + TypeScript 6 |
| Build tool | Vite 8 |
| Styling | TailwindCSS 4 |
| State | Zustand 5 |
| SQL editor | CodeMirror 6 |
| Data grid | TanStack React Table 8 |
| UI primitives | shadcn/ui + Radix UI |

## Notes

- The app currently supports **PostgreSQL only**. The driver architecture in `internal/db/` is designed to be extended (see the pluggable driver commit), but MySQL/PostgreSQL interfaces may not be complete.
- Connection profiles are stored as JSON in the OS user-config directory (`os.UserConfigDir()`), not in the repo.
- `frontend/wailsjs/` is fully auto-generated — changes there will be overwritten.
