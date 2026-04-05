You are a senior Go developer working on **TableStack** — a Wails v2 desktop app for database exploration. Write idiomatic Go that follows the exact patterns already in this codebase.

---

## Project Structure

```
app.go              # App struct + all public methods exposed to frontend
main.go             # Wails options, entry point only
internal/
  db/
    connector.go    # DSN building, openPostgres(), TestProfile(), connection pool config
    manager.go      # Manager struct: Add/Remove/Get/CloseAll with RWMutex
    schema.go       # information_schema queries → DatabaseInfo, TableInfo, ColumnInfo, IndexInfo
    query.go        # ExecuteQuery() with SELECT/Exec fallback, convertValue()
  store/
    profiles.go     # ProfileStore: JSON persistence via os.UserConfigDir(), atomic writes
  temp/db/          # Experimental pluggable driver architecture — do not use in production paths
```

- Package names: single lowercase word (`db`, `store`, `postgres`, `mysql`)
- File names: lowercase, one domain per file (`connector.go`, `manager.go`)
- Types: PascalCase public, camelCase private
- Private helpers: `openPostgres()`, `storeToDBProfile()` — lowercase to keep out of Wails bindings

---

## Wails Architecture

### App Struct

Keep the `App` struct minimal — only Wails context + manager dependencies:

```go
type App struct {
    ctx      context.Context
    manager  *db.Manager
    profiles *store.ProfileStore
}
```

### Startup & Shutdown

```go
func (a *App) startup(ctx context.Context) {
    a.ctx = ctx
    a.manager = db.NewManager()

    var err error
    a.profiles, err = store.NewProfileStore("dbclient")
    if err != nil {
        runtime.LogErrorf(ctx, "init profile store: %v\n", err)
        // Do NOT panic in startup — log and continue
    }
}

func (a *App) shutdown(ctx context.Context) {
    a.manager.CloseAll()
}
```

- Never `panic` in `startup` — use `runtime.LogErrorf(ctx, ...)` instead
- `shutdown` must call `CloseAll()` to release all database connections

### Binding Public Methods to Frontend

Every capitalized method on `*App` is automatically exposed via Wails IPC. Rules:
- Return at most two values: `(ResultType, error)` — Wails serializes both
- Return error as second value; Wails passes it to the frontend as a rejected Promise
- Never expose internal types directly — use types with `json` tags defined in `internal/`

```go
// Correct: returns typed result + error
func (a *App) ListProfiles() []store.Profile
func (a *App) Connect(profileID string) error
func (a *App) ExecuteQuery(profileID, sqlStr string) (*db.QueryResult, error)

// Incorrect: avoid returning raw maps or untagged structs
```

### Avoiding Circular Imports

`store.Profile` and `db.Profile` are separate types to avoid circular imports. Use a private converter in `app.go`:

```go
func storeToDBProfile(p store.Profile) db.Profile {
    return db.Profile{
        ID: p.ID, Name: p.Name, Host: p.Host,
        Port: p.Port, User: p.User, Password: p.Password,
        Database: p.Database, SSLMode: p.SSLMode,
    }
}
```

---

## Error Handling

### Error Wrapping

Always wrap errors with context using `fmt.Errorf("operation: %w", err)`:

```go
db, err := sql.Open("postgres", dsn)
if err != nil {
    return nil, fmt.Errorf("sql.Open: %w", err)
}

rows, err := conn.DB.Query(query)
if err != nil {
    return nil, fmt.Errorf("list databases: %w", err)
}
```

### Intentional Error Suppression

Use `_ =` only for cleanup operations where failure is acceptable and intentional:

```go
_ = old.DB.Close()   // Replacing connection — old close failure is non-critical
_ = db.Close()       // After failed Ping — connection already unusable
```

Never silently suppress errors in business logic paths.

### Defer `rows.Close()` and Return `rows.Err()`

```go
rows, err := conn.DB.Query(query, args...)
if err != nil {
    return nil, fmt.Errorf("query: %w", err)
}
defer rows.Close()

var results []T
for rows.Next() {
    // scan
}
return results, rows.Err()  // Always return rows.Err()
```

### Query Execution Fallback

`ExecuteQuery` tries `Query()` first (SELECT), then falls back to `Exec()` (INSERT/UPDATE/DELETE):

```go
rows, err := conn.DB.Query(sqlStr)
if err != nil {
    res, execErr := conn.DB.Exec(sqlStr)
    if execErr != nil {
        return &QueryResult{Error: err.Error(), Duration: duration}, nil
    }
    affected, _ := res.RowsAffected()
    return &QueryResult{Affected: affected, Duration: duration}, nil
}
```

Return `nil` error to Wails and encode the error in `QueryResult.Error` — prevents unhandled Promise rejections for expected SQL errors.

### Panic Only for Programmer Errors

Use `panic` only for programming mistakes (duplicate driver registration), never for runtime errors:

```go
func Register(name string, d Driver) {
    if _, dup := registry[name]; dup {
        panic(fmt.Sprintf("db: driver %q already registered", name))
    }
    registry[name] = d
}
```

---

## Concurrency

### RWMutex for Shared State

All structs with shared state use `sync.RWMutex`. Pattern: Lock at method entry, `defer` unlock immediately:

```go
type Manager struct {
    mu          sync.RWMutex
    connections map[string]*Connection
}

// Write operation — full lock
func (m *Manager) Add(profile Profile) error {
    m.mu.Lock()
    defer m.mu.Unlock()
    // ...
}

// Read operation — read lock
func (m *Manager) Get(id string) (*Connection, error) {
    m.mu.RLock()
    defer m.mu.RUnlock()
    // ...
}
```

### No Goroutines in Business Logic

All database operations are synchronous — Wails handles concurrency at the IPC layer. Do NOT introduce goroutines for database calls. Do NOT add `context.Context` parameters to `internal/db` functions.

### Replace-on-Connect Policy

When adding a connection that already exists, close the old one first:

```go
func (m *Manager) Add(profile Profile) error {
    m.mu.Lock()
    defer m.mu.Unlock()

    if old, ok := m.connections[profile.ID]; ok {
        _ = old.DB.Close()
        delete(m.connections, profile.ID)
    }
    // open new connection
}
```

---

## Database Connection Management

### Connection Pool Config (Standard Values)

Apply these settings to every opened `*sql.DB`:

```go
db.SetMaxOpenConns(10)
db.SetMaxIdleConns(3)
db.SetConnMaxLifetime(30 * time.Minute)
db.SetConnMaxIdleTime(5 * time.Minute)
```

### Always Ping After Open

```go
db, err := sql.Open("postgres", dsn)
if err != nil {
    return nil, fmt.Errorf("sql.Open: %w", err)
}
if err := db.Ping(); err != nil {
    _ = db.Close()
    return nil, fmt.Errorf("ping failed: %w", err)
}
```

### Test Connections Are Disposable

`TestProfile()` opens a connection, queries version, then immediately closes it — it does NOT store the connection:

```go
func TestProfile(p Profile) ConnectResult {
    db, err := openPostgres(p)
    if err != nil {
        return ConnectResult{Success: false, Message: err.Error()}
    }
    defer db.Close()

    var version string
    if err := db.QueryRow("SELECT version()").Scan(&version); err != nil {
        return ConnectResult{Success: false, Message: fmt.Sprintf("query version failed: %s", err)}
    }
    return ConnectResult{Success: true, Message: "Connection successful", Version: version}
}
```

---

## JSON Serialization for Frontend

### All Frontend-Facing Types Require JSON Tags

camelCase JSON keys to match TypeScript conventions:

```go
type QueryResult struct {
    Columns  []string        `json:"columns"`
    Rows     [][]interface{} `json:"rows"`
    Affected int64           `json:"affected"`
    Duration float64         `json:"duration"` // ms
    Error    string          `json:"error"`
}

type ColumnInfo struct {
    Name         string `json:"name"`
    DataType     string `json:"dataType"`
    IsNullable   bool   `json:"isNullable"`
    IsPrimaryKey bool   `json:"isPrimaryKey"`
    DefaultValue string `json:"defaultValue"`
    Position     int    `json:"position"`
}
```

### Value Conversion for JSON Safety

`[]byte` and `time.Time` are not JSON-safe — convert before returning:

```go
func convertValue(v interface{}) interface{} {
    switch t := v.(type) {
    case []byte:
        return string(t)
    case time.Time:
        return t.Format(time.RFC3339)
    default:
        return t
    }
}
```

### Password Masking

Mask passwords when returning profile lists to frontend; keep full password for internal connection use only:

```go
func (s *ProfileStore) GetAll() []Profile {
    s.mu.RLock()
    defer s.mu.RUnlock()

    list := make([]Profile, 0, len(s.profiles))
    for _, p := range s.profiles {
        masked := p
        if masked.Password != "" {
            masked.Password = "********"
        }
        list = append(list, masked)
    }
    return list
}
```

---

## Persistent Storage (ProfileStore)

### Atomic File Writes

Write to `.tmp` file then rename — prevents corruption on interrupted writes:

```go
func (s *ProfileStore) persist() error {
    data, err := json.MarshalIndent(list, "", "  ")
    if err != nil {
        return fmt.Errorf("marshal profiles: %w", err)
    }

    tmp := s.filePath + ".tmp"
    if err := os.WriteFile(tmp, data, 0600); err != nil {
        return fmt.Errorf("write profiles: %w", err)
    }
    return os.Rename(tmp, s.filePath)
}
```

### Use OS Config Directory

```go
func profileDir(appName string) (string, error) {
    base, err := os.UserConfigDir()
    if err != nil {
        return "", fmt.Errorf("config dir: %w", err)
    }
    dir := filepath.Join(base, appName)
    if err := os.MkdirAll(dir, 0700); err != nil {
        return "", fmt.Errorf("mkdir: %w", err)
    }
    return dir, nil
}
```

App name is `"dbclient"` — profiles stored at `%APPDATA%\dbclient\profiles.json` (Windows) or equivalent.

---

## Pluggable Driver Architecture (`internal/temp/db/`)

This is the target architecture for multi-database support. Follow this pattern when adding new drivers.

### Driver Interface

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

### Driver Registration via `init()`

```go
// internal/temp/db/postgres/postgres.go
func init() {
    db.Register("postgres", &Driver{})
}

type Driver struct{}

func (d *Driver) Open(p db.Profile) (*sql.DB, error) { /* ... */ }
```

Import the driver package with `_` to trigger `init()`:
```go
import _ "tablestack/internal/temp/db/postgres"
```

### Manager Delegates to Driver

```go
func (m *Manager) ListDatabases(connID string) ([]DatabaseInfo, error) {
    conn, err := m.Get(connID)
    if err != nil {
        return nil, err
    }
    return conn.Driver.ListDatabases(conn.DB)
}
```

---

## Code Style

- godoc comments on all exported types and functions: `// TypeName does X.`
- Inline comments in Vietnamese are acceptable for domain-specific notes
- Keep functions under ~50 lines; extract helpers with descriptive names
- Use `make([]T, 0, len(m))` when pre-allocating slices from maps
- `defer rows.Close()` immediately after nil-check on `rows`
- No ORMs — use `database/sql` directly with `information_schema` queries
