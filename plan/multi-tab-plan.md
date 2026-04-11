# TableStack — Multi-Tab Query Editor & Session Persistence

## Tổng quan

Hiện tại TableStack chỉ cho phép mở **1 query editor**. Mục tiêu là nâng cấp lên hệ thống **multi-tab** với khả năng:

- Mở nhiều query editor cùng lúc (tab-based)
- Mở file `.sql` từ disk
- Tạo query mới chưa cần save file
- Mỗi connection profile có workspace riêng
- Khi tắt app → mở lại đúng trạng thái trước đó (tabs, content, cursor, active tab)

### Tech Stack

- **Backend:** Go + Wails v3 (alpha)
- **Frontend:** React + TypeScript
- **Session storage:** JSON file trên disk (`~/.tablestack/sessions/`)

---

## Flow tổng quan

```
┌──────────────────────────────────────────────────────────────┐
│                        APP LIFECYCLE                         │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────┐    ┌──────────────────┐    ┌────────────────┐  │
│  │App Start │───▶│Load last used    │───▶│LoadSession()   │  │
│  │          │    │connection ID     │    │→ restore tabs  │  │
│  └─────────┘    └──────────────────┘    │→ restore cursor│  │
│                                         │→ set active tab│  │
│                                         └───────┬────────┘  │
│                                                 │            │
│                                                 ▼            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                    RUNTIME                            │   │
│  │                                                       │   │
│  │  User actions:                                        │   │
│  │  ├─ New Tab ──────▶ tab(id, content="", file=nil)     │   │
│  │  ├─ Open File ────▶ tab(id, content=read, file=path)  │   │
│  │  ├─ Edit content ─▶ tab.content=x, isDirty=true       │   │
│  │  ├─ Save (Ctrl+S) ▶ WriteFile → isDirty=false         │   │
│  │  ├─ Close Tab ────▶ prompt if dirty → remove tab      │   │
│  │  └─ Switch Conn ──▶ save current → load new session   │   │
│  │                                                       │   │
│  │  Auto-save session: debounce 2s → SaveSession()       │   │
│  └───────────────────────────────────┬───────────────────┘   │
│                                      │                       │
│                                      ▼                       │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                   APP CLOSE                           │   │
│  │  → Flush pending debounce                             │   │
│  │  → SaveSession() đồng bộ                              │   │
│  │  → Lưu last active connectionID                       │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Flow: Mở / Đóng Tab

```
┌─────────────┐
│  User click  │
│  "New Tab"   │
└──────┬──────┘
       │
       ▼
┌──────────────┐     ┌────────────────────────────────────┐
│ Tạo QueryTab │     │ ID:           uuid                 │
│ mới          │────▶│ ConnectionID: current connection    │
│              │     │ Title:        "Query {n}"           │
└──────────────┘     │ Content:      ""                    │
                     │ FilePath:     nil (chưa save)       │
                     │ IsDirty:      false                 │
                     │ Order:        len(tabs)             │
                     └────────────────────────────────────┘

┌─────────────┐
│  User click  │
│  Close Tab   │
└──────┬──────┘
       │
       ▼
   ┌──────────┐     ┌────────────────────┐
   │ isDirty? │──Y─▶│ Hiện dialog:       │
   └────┬─────┘     │ Save / Don't Save  │
        │N          │ / Cancel            │
        │           └────────┬───────────┘
        │                    │
        ▼                    ▼
   ┌─────────────────────────────┐
   │ Remove tab from state       │
   │ If closing active tab:      │
   │   → activate tab bên cạnh   │
   │ If last tab:                │
   │   → tạo 1 tab mặc định mới │
   └─────────────────────────────┘
```

### Flow: Save File

```
┌──────────────┐
│ User Ctrl+S  │
└──────┬───────┘
       │
       ▼
  ┌───────────┐      ┌────────────────────────┐
  │ FilePath  │──nil─▶│ Mở Save As dialog      │
  │ exists?   │       │ → user chọn path       │
  └─────┬─────┘       │ → nếu cancel → return  │
        │has path     └────────────┬───────────┘
        │                         │
        ▼                         ▼
  ┌─────────────────────────────────────┐
  │ WriteFile(path, content)            │
  │ → tab.FilePath = path               │
  │ → tab.IsDirty = false               │
  │ → tab.Title = filename from path    │
  └─────────────────────────────────────┘
```

### Flow: Switch Connection

```
┌──────────────────┐
│ User chọn        │
│ connection khác  │
└────────┬─────────┘
         │
         ▼
┌─────────────────────┐
│ SaveSession(oldConn)│  ← lưu state hiện tại
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ LoadSession(newConn)│  ← load state của connection mới
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ Restore tabs,       │
│ active tab,         │
│ cursor positions    │
└─────────────────────┘
```

---

## Phase 1: Backend — Session Manager (Go)

### Mục tiêu

Xây dựng `SessionManager` trong Go để quản lý đọc/ghi session state ra file JSON.

### Yêu cầu

#### 1.1 Data Models

Định nghĩa các struct sau (đặt trong package riêng, ví dụ `internal/session`):

- **`CursorPos`**: Lưu vị trí cursor
  - `Line int` — dòng hiện tại
  - `Column int` — cột hiện tại

- **`QueryTab`**: Đại diện 1 tab trong editor
  - `ID string` — UUID, unique
  - `ConnectionID string` — ID của connection profile mà tab này thuộc về
  - `Title string` — tên hiển thị (ví dụ "Query 1", "users.sql")
  - `Content string` — nội dung SQL hiện tại trong editor
  - `FilePath *string` — nil nếu chưa save, có giá trị nếu đã save ra file
  - `IsDirty bool` — true nếu content thay đổi so với lần save cuối (hoặc so với lúc tạo)
  - `CursorPos CursorPos` — vị trí cursor cuối cùng
  - `CreatedAt int64` — unix timestamp lúc tạo tab
  - `Order int` — thứ tự hiển thị tab (0-based)

- **`WorkspaceSession`**: Snapshot toàn bộ workspace của 1 connection
  - `ActiveConnectionID string` — connection đang active
  - `ActiveTabID string` — tab đang active
  - `Tabs []QueryTab` — danh sách tất cả tabs
  - `LastSavedAt int64` — unix timestamp lần save cuối

Tất cả struct phải có json tags.

#### 1.2 SessionManager

Struct `SessionManager` quản lý session persistence:

- **Constructor:** `NewSessionManager(sessionDir string)` — nhận đường dẫn thư mục lưu session. Tự tạo thư mục nếu chưa tồn tại.

- **`Save(connID string, session WorkspaceSession) error`**
  - Cập nhật `LastSavedAt` = thời điểm hiện tại
  - Serialize session thành JSON (indent cho dễ debug)
  - **Atomic write**: ghi vào file `.tmp` trước, rồi `os.Rename` sang file chính. Mục đích tránh corrupt nếu app crash giữa chừng ghi
  - File path: `{sessionDir}/{connID}.session.json`
  - Thread-safe (dùng `sync.RWMutex`)

- **`Load(connID string) (*WorkspaceSession, error)`**
  - Đọc file `{sessionDir}/{connID}.session.json`
  - Nếu file không tồn tại → trả về default session (1 tab trống, title "Query 1")
  - Nếu file bị corrupt (JSON invalid) → trả về default session (không crash)
  - Thread-safe

- **`Delete(connID string) error`**
  - Xóa file session. Dùng khi user xóa connection profile.

- **`defaultSession(connID string) *WorkspaceSession`**
  - Helper tạo session mặc định: 1 tab trống với title "Query 1", tab đó là active tab

#### 1.3 Quy tắc file path

Mỗi connection profile có 1 file session riêng:

```
{sessionDir}/
  ├── {connID_1}.session.json
  ├── {connID_2}.session.json
  └── {connID_3}.session.json
```

`connID` chính là ID duy nhất của connection profile (đã có sẵn trong hệ thống).

### Yêu cầu Testing (Go)

Viết unit test cho `SessionManager` với các test case sau:

- **TestSave_NewSession**: Save 1 session mới → file được tạo đúng path, content JSON hợp lệ
- **TestSave_OverwriteExisting**: Save lần 2 → file được ghi đè, `LastSavedAt` cập nhật
- **TestSave_AtomicWrite**: Verify file `.tmp` không tồn tại sau khi save thành công
- **TestLoad_ExistingSession**: Load session đã save → data khớp
- **TestLoad_FileNotExist**: Load khi chưa có file → trả default session, không error
- **TestLoad_CorruptJSON**: Tạo file với nội dung không phải JSON → trả default session, không panic
- **TestDelete_ExistingFile**: Xóa file session → file không còn trên disk
- **TestDelete_NonExistentFile**: Xóa khi file không tồn tại → không error
- **TestConcurrency**: Gọi Save và Load đồng thời từ nhiều goroutine → không race condition (dùng `-race` flag)
- **TestDefaultSession**: Verify default session có đúng 1 tab, title "Query 1", tab ID = active tab ID

Dùng `t.TempDir()` cho session directory trong test. Không mock file system, test trực tiếp với file thật.

---

## Phase 2: Backend — Wails Bindings (Go)

### Mục tiêu

Expose các API cho frontend thông qua Wails binding. Tạo service struct để Wails v3 bind.

### Yêu cầu

#### 2.1 QueryEditorService

Struct `QueryEditorService` là Wails-bound service:

- Nhận dependency: `SessionManager`, Wails `application.Context` (cho dialog)
- Tất cả method public sẽ tự động expose cho frontend qua Wails

#### 2.2 Các method

- **`LoadSession(connID string) (*WorkspaceSession, error)`**
  - Gọi `SessionManager.Load(connID)`
  - Trả session cho frontend restore

- **`SaveSession(connID string, session WorkspaceSession) error`**
  - Gọi `SessionManager.Save(connID, session)`
  - Frontend gọi method này mỗi khi state thay đổi (đã debounce phía frontend)

- **`OpenFile() (*QueryTab, error)`**
  - Mở file dialog (Wails runtime dialog) để user chọn file `.sql`
  - Filter: `*.sql` files
  - Đọc content file
  - Trả về 1 `QueryTab` mới với:
    - `ID`: uuid mới
    - `Title`: tên file (vd: `users.sql`)
    - `Content`: nội dung file
    - `FilePath`: đường dẫn file đã chọn
    - `IsDirty`: false
  - Nếu user cancel dialog → trả `nil, nil` (không phải error)

- **`SaveFile(tab QueryTab) (*QueryTab, error)`**
  - Nếu `tab.FilePath != nil` → ghi content vào file đó (Save)
  - Nếu `tab.FilePath == nil` → mở Save As dialog, user chọn path (Save As)
    - Default filename: `{tab.Title}.sql`
    - Filter: `*.sql`
  - Sau khi ghi thành công → trả về tab đã cập nhật:
    - `FilePath` = path đã save
    - `IsDirty` = false
    - `Title` = tên file từ path
  - Nếu user cancel Save As dialog → trả `nil, nil`

- **`SaveLastConnection(connID string) error`**
  - Lưu `connID` vào file `{sessionDir}/last_connection.txt`
  - Dùng để biết connection nào load khi mở app lần sau

- **`GetLastConnection() (string, error)`**
  - Đọc file `last_connection.txt`
  - Trả `""` nếu file không tồn tại

### Yêu cầu Testing (Go)

**Lưu ý**: Các method dùng Wails dialog (`OpenFile`, `SaveFile`) khó test trực tiếp vì phụ thuộc UI runtime. Có 2 cách tiếp cận:

**Cách 1 (khuyến khích):** Tách logic file I/O ra interface riêng:

```
type FileDialogProvider interface {
    OpenFileDialog(filters ...) (string, error)
    SaveFileDialog(defaultName string, filters ...) (string, error)
}
```

Mock interface này trong test. Logic đọc/ghi file vẫn test được thật.

**Cách 2:** Chỉ test `LoadSession`, `SaveSession`, `SaveLastConnection`, `GetLastConnection` — những method không cần dialog.

Test cases:

- **TestLoadSession_DelegatesToManager**: Verify gọi đúng SessionManager
- **TestSaveSession_DelegatesToManager**: Verify gọi đúng SessionManager
- **TestOpenFile_ReadsContent**: (cần mock dialog) Verify trả đúng tab với content file
- **TestOpenFile_UserCancel**: (cần mock dialog) User cancel → nil, nil
- **TestSaveFile_ExistingPath**: Ghi content vào file → verify file content
- **TestSaveFile_NewFile**: (cần mock dialog) Save As → verify file tạo đúng
- **TestSaveLastConnection**: Save rồi Get → trả đúng connID
- **TestGetLastConnection_NoFile**: Chưa save lần nào → trả ""

---

## Phase 3: Frontend — State Management (React/TypeScript)

### Mục tiêu

Xây dựng state management cho multi-tab editor phía frontend.

### Yêu cầu

#### 3.1 Types

Định nghĩa TypeScript types tương ứng với Go structs:

```
CursorPos { line: number; column: number }

QueryTab {
  id: string
  connectionId: string
  title: string
  content: string
  filePath: string | null    // null = chưa save
  isDirty: boolean
  cursorPos: CursorPos
  createdAt: number
  order: number
}

WorkspaceSession {
  activeConnectionId: string
  activeTabId: string
  tabs: QueryTab[]
  lastSavedAt: number
}
```

#### 3.2 State & Actions

Dùng `useReducer` hoặc state management phù hợp (zustand, context, etc.) với các actions:

| Action | Mô tả | Side effect |
|--------|--------|-------------|
| `LOAD_SESSION` | Nhận session từ backend, set toàn bộ state | Không |
| `ADD_TAB` | Thêm tab mới (trống hoặc từ file) | Trigger auto-save |
| `CLOSE_TAB` | Xóa tab. Nếu đóng tab active → active tab bên cạnh. Nếu tab cuối → tạo tab mặc định | Trigger auto-save |
| `SET_ACTIVE_TAB` | Chuyển active tab | Trigger auto-save |
| `UPDATE_CONTENT` | Cập nhật content của 1 tab, set isDirty=true | Trigger auto-save |
| `UPDATE_CURSOR` | Cập nhật cursor position | Trigger auto-save |
| `MARK_SAVED` | Sau khi save file thành công → isDirty=false, cập nhật filePath & title | Trigger auto-save |
| `REORDER_TABS` | Đổi thứ tự tabs (drag & drop) | Trigger auto-save |

#### 3.3 Auto-Save Session (Debounce)

- Mỗi khi state thay đổi (bất kỳ action nào) → debounce 2 giây → gọi `SaveSession()` qua Wails binding
- Khi component unmount (hoặc trước khi switch connection) → flush debounce ngay lập tức
- Khi app sắp đóng (Wails `OnBeforeClose` hoặc `beforeunload` event) → flush và gọi `SaveSession()` đồng bộ

#### 3.4 Tab Title Logic

- Tab mới (chưa save): "Query 1", "Query 2", ... (tự động đánh số tăng dần, kiểm tra trùng)
- Tab từ file: lấy tên file (vd: `users.sql`)
- Sau khi Save As: đổi title thành tên file mới
- Tab đã sửa (isDirty): hiển thị dấu `●` hoặc `*` trước/sau title ở UI

---

## Phase 4: Frontend — Tab UI Component (React/TypeScript)

### Mục tiêu

Xây dựng UI component hiển thị tab bar và quản lý tương tác.

### Yêu cầu

#### 4.1 TabBar Component

Hiển thị danh sách tabs dạng thanh ngang (giống VSCode, DBeaver):

- Mỗi tab hiển thị: icon (tuỳ chọn) + title + nút close (×)
- Tab active có style khác biệt (highlight)
- Tab dirty hiển thị indicator (● trước title hoặc thay nút × bằng ●)
- Click tab → `SET_ACTIVE_TAB`
- Click nút close → xử lý close flow (xem Phase 3)
- Nút "+" ở cuối tab bar → `ADD_TAB` (tạo tab trống mới)
- Hỗ trợ **kéo thả** (drag & drop) để thay đổi thứ tự tabs (optional, có thể làm sau)
- Khi tabs quá nhiều (tràn chiều ngang) → hiển thị scroll hoặc nút mũi tên trái/phải

#### 4.2 Context Menu trên Tab

Click phải vào tab → hiện context menu:

- **Close** — đóng tab này
- **Close Others** — đóng tất cả tab khác
- **Close All** — đóng tất cả
- **Close to the Right** — đóng tất cả tab bên phải
- Separator
- **Save** — save tab này (Ctrl+S)
- **Save As...** — luôn mở Save As dialog
- Separator
- **Copy Path** — copy file path (chỉ hiện nếu đã save)

#### 4.3 Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+N` | New tab (tạo tab trống mới) |
| `Ctrl+O` | Open file (gọi `OpenFile()` backend) |
| `Ctrl+S` | Save tab hiện tại |
| `Ctrl+Shift+S` | Save As |
| `Ctrl+W` | Close tab hiện tại |
| `Ctrl+Tab` | Switch sang tab kế tiếp |
| `Ctrl+Shift+Tab` | Switch sang tab trước đó |

#### 4.4 Editor Area

- Mỗi tab render 1 instance editor SQL (dùng thư viện editor hiện tại của project)
- Khi switch tab → **giữ lại scroll position và cursor** của tab trước (lưu vào state), restore cho tab mới
- Content thay đổi → dispatch `UPDATE_CONTENT`
- Cursor thay đổi → dispatch `UPDATE_CURSOR` (có thể debounce riêng, 500ms)

---

## Phase 5: Frontend — Connection Switch & App Lifecycle

### Mục tiêu

Xử lý chuyển đổi connection profile và lifecycle app (mở/đóng).

### Yêu cầu

#### 5.1 App Startup

1. Gọi `GetLastConnection()` để lấy connection ID lần dùng trước
2. Nếu có → tự động connect và gọi `LoadSession(connID)` → restore tabs
3. Nếu không có (lần đầu dùng app hoặc file bị xóa) → hiển thị màn hình chọn connection

#### 5.2 Switch Connection

Khi user chọn connection khác:

1. Flush debounce auto-save ngay lập tức
2. Gọi `SaveSession(oldConnID, currentState)` — lưu state connection cũ
3. Gọi `LoadSession(newConnID)` — load state connection mới
4. Restore tabs từ session mới
5. Gọi `SaveLastConnection(newConnID)` — ghi nhớ connection cuối

#### 5.3 App Close

Khi user đóng app:

1. Kiểm tra có tab nào `isDirty` với `filePath != nil` (đã có file nhưng chưa save thay đổi mới) → hỏi user "Save changes before closing?"
2. Flush debounce
3. Gọi `SaveSession()` đồng bộ — **lưu toàn bộ state bao gồm cả content chưa save** để khi mở lại vẫn có
4. Gọi `SaveLastConnection()`

**Lưu ý quan trọng:** Content của tab chưa save file (`filePath == nil`) vẫn được lưu trong session JSON. Khi mở lại app, content sẽ được restore. User không mất work.

#### 5.4 Xóa Connection Profile

Khi user xóa 1 connection profile:

1. Gọi `SessionManager.Delete(connID)` — xóa file session tương ứng
2. Nếu connection đang active → chuyển sang connection khác hoặc về màn hình chọn connection

---

## Tóm tắt phân công

| Phase | Scope | Ngôn ngữ | Có test? |
|-------|-------|----------|----------|
| Phase 1 | SessionManager — đọc/ghi session JSON | Go | ✅ Unit test bắt buộc |
| Phase 2 | Wails bindings — API cho frontend | Go | ✅ Unit test (mock dialog) |
| Phase 3 | State management — reducer/actions | TypeScript | Tuỳ chọn |
| Phase 4 | Tab UI — component, context menu, shortcuts | React/TS | Tuỳ chọn |
| Phase 5 | Connection switch, app lifecycle | React/TS + Go | Tuỳ chọn |

### Thứ tự thực hiện

Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5

## Progress Tracking (BẮT BUỘC)

Sau khi hoàn thành mỗi Phase hoặc sub-task, AI phải:

1. Cập nhật file markdown trong thư mục `/plan/`
2. Không được coi task là hoàn thành nếu chưa update progress
3. Nếu có thay đổi thiết kế → phải ghi lại trong "Decisions"
4. Nếu có vấn đề / trade-off → phải ghi vào "Notes"

/plan
  ├── master-plan.md // file này, tổng hợp toàn bộ kế hoạch
  ├── phase-1-session-manager.md
  ├── phase-2-wails-bindings.md
  ├── phase-3-frontend-state.md
  ├── phase-4-tab-ui.md
  ├── phase-5-lifecycle.md
  └── decisions.md

Mỗi file phase phải bao gồm:
- ## Status 
- ## Checklist
- ## Implementation Notes
- ## Decisions
- ## Issues / Trade-offs (optional)
- ## Test Results (nếu có)
- ## Files Changed
- ## Last Updated