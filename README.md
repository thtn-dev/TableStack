# TableStack

TableStack is a desktop SQL explorer built with Wails v3.

It combines:
- Go backend for connection management and query execution
- React + TypeScript frontend for schema browsing and SQL workflow
- Native desktop packaging via Wails (Windows/macOS/Linux)

## Current Status

- Wails: v3 alpha
- Go: 1.25
- Frontend: React 19 + TypeScript + Vite + Zustand + TailwindCSS 4
- Supported database drivers in codebase: Postgres and MySQL

## Core Features

- Connection profile management (create, update, delete)
- Credential encryption with AES-256-GCM
- Master key stored in OS keychain
- Multi-connection state tracking
- Schema explorer:
   - Databases
   - Schemas
   - Tables/views
   - Columns
   - Indexes
- SQL query execution with tabular result rendering
- Startup window flow to connect quickly before opening the main workspace

## Project Structure

Top-level overview:

```text
app.go                    Wails service methods exposed to frontend
main.go                   App bootstrap and window lifecycle
internal/
   db/
      driver.go             Driver registry and shared interfaces
      manager.go            Active connection manager
      query.go              Query execution and result shaping
      types.go              Shared DB-facing DTOs
      postgres/             Postgres driver implementation
      mysql/                MySQL driver implementation
   store/
      profiles.go           Profile persistence
      credentials.go        Encrypted credential persistence
frontend/
   src/
      store/                Zustand state + Wails action layer
      windows/              StartupWindow and MainWindow routes
      components/           UI features (schema tree, editor, result panel)
   bindings/               Auto-generated Wails bindings (do not edit)
build/config.yml          Wails build/dev configuration
Taskfile.yml              Task entry points (dev/build/package)
```

## Data Flow

```text
UI interaction
   -> Zustand action (frontend/src/store/useDBStore.ts)
   -> Wails generated binding call
   -> App method (app.go)
   -> internal/db + internal/store
   -> Database / local config store
```

## Getting Started

### 1) Prerequisites

- Go 1.25+
- Node.js 20+
- Wails v3 CLI installed and available as `wails3`

Install Wails CLI if needed:

```bash
go install github.com/wailsapp/wails/v3/cmd/wails3@latest
```

### 2) Install frontend dependencies

```bash
cd frontend
npm install
cd ..
```

### 3) Run in development mode

```bash
wails3 dev -config ./build/config.yml -port 9245
```

Equivalent Taskfile command:

```bash
task dev
```

## Build

```bash
wails3 build -config ./build/config.yml
```

Or using Taskfile:

```bash
task build
```

## Test

Run all Go tests:

```bash
go test ./...
```

Run store package tests only:

```bash
go test ./internal/store/...
```

## Frontend Commands

Inside `frontend/`:

```bash
npm run dev
npm run build
npm run preview
```

## Security Notes

- Profile metadata is stored in user config directory (`dbclient`).
- Plaintext passwords are not persisted in profile JSON.
- Passwords are encrypted before being written to disk.
- Encryption master key is stored in OS keychain.

## Notes for Contributors

- Do not edit files under `frontend/bindings/`; they are generated.
- Keep Wails calls inside the frontend store layer when possible.
- Prefer updating `build/config.yml` + `Taskfile.yml` commands consistently.
