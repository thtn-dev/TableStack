You are a senior React developer working on **TableStack** — a Wails v3 desktop app with React 19 + TypeScript + Zustand + TailwindCSS 4. Write clean, maintainable code that strictly follows the patterns already established in this codebase.

---

## TypeScript Conventions

- Define explicit `interface` for component props; use `type` for unions, aliases, and inferred Zod schemas
- Prefer `type` imports: `import type { Profile } from "@/store"`
- Re-export Wails generated types through `src/store/types.ts` — never import directly from `../../bindings/...` in components
- Use the `AsyncState<T>` generic for any remote data: `{ status: AsyncStatus; data: T | null; error: string | null }`
- Use `as const` for literal arrays (e.g. `const SSL_MODES = ["disable", "require"] as const`) then derive types with `z.enum(SSL_MODES)` or `(typeof SSL_MODES)[number]`
- Infer form types from Zod schemas: `type FormValues = z.infer<typeof schema>` — never define them manually

---

## Component Design

- Functional components only; named exports (not default where avoidable)
- Props interface above the component, named `<ComponentName>Props`
- Co-locate small helper components in the same file (e.g. `Field`, `TestBanner`, `TreeRow`) — extract to separate file only when reused elsewhere
- Render order based on `AsyncState.status`: loading → error → empty → success; never check `data === null` alone
- Use `cn()` from `@/lib/utils` for all conditional className merging — never string concatenation
- Avoid `React.FC` — use explicit return type only when needed for clarity

---

## Zustand Store

- All remote data lives in the Zustand store (`src/store/useDBStore.ts`); local UI state (dialog open/close, form status) stays in component `useState`
- Middleware stack: `subscribeWithSelector(immer(...))` — always use `immer` for mutations
- Call `enableMapSet()` at module top-level when storing `Set` or `Map`
- Export stable selector functions for per-id subscriptions:
  ```ts
  export const selectIsConnected = (profileId: string) => (s: DBState) =>
    s.activeConnections.has(profileId);
  ```
- Use `useDBStore(selectIsConnected(id))` in components — never subscribe to the whole store
- Serialize `Set` to string for `useEffect` dependencies to avoid infinite loops
- Cascade deletes: when removing a profile, clean up all related cache entries in the same `set()` call

---

## Wails Bindings

- Import app bindings from `../../bindings/github.com/thtn-dev/table_stack/app` in the store layer
- If runtime APIs are needed, use the v3 runtime package (`@wailsio/runtime`) instead of legacy `@wailsjs/*` imports
- Call Wails bindings **only inside Zustand store actions** — never directly in components
- Errors from Wails are strings; convert with `String(err)` and store in `AsyncState.error`
- Do not edit anything under `frontend/bindings/` — it is auto-generated

---

## Async & Error Handling

- Always `try/catch` async store actions; update loading/error state in both paths
- Use `finally` to reset loading flags
- Re-throw errors from store actions so components can show inline feedback if needed
- Display errors with `<pre>` + `whitespace-pre-wrap break-all` for stack traces; short messages with `role="alert"` inline

---

## React Hook Form + Zod

- Every form uses `react-hook-form` + `zodResolver`; no manual validation
- Wrap Radix UI controlled inputs (Select, Switch) with `<Controller>` — pass `field.value` / `field.onChange`
- Extract a local `Field` wrapper component for label + input + error message to avoid repetition
- Use `form` attribute on submit `<Button>` when the button is outside the `<form>` element
- Use `noValidate` on `<form>` to let Zod handle all validation

---

## TailwindCSS 4

- Use CSS variable tokens: `bg-background`, `text-foreground`, `bg-muted`, `text-muted-foreground`, `border-border`, `bg-destructive`, `text-destructive`, `bg-primary`
- Use opacity modifiers: `bg-destructive/10`, `border-border/40`, `text-muted-foreground/70`
- Use `dark:` prefix for dark-mode overrides; do not hard-code colors
- Prefer layout utilities: `grid grid-rows-[auto_1fr_auto]`, `flex items-center gap-2`, `size-*` shorthand
- Use `group/name` and `peer/name` named variants for scoped group/peer hover states
- `select-none` on all UI chrome (title bar, sidebars)
- `shrink-0` on fixed-size flex children to prevent compression

---

## shadcn/ui Components

- Import from `@/components/ui/*` — do not add logic to ui/ files
- Use `asChild` prop when wrapping Radix triggers with custom elements
- Tooltip pattern: always wrap icon-only `<Button>` in `<Tooltip><TooltipTrigger asChild>...</TooltipTrigger><TooltipContent /></Tooltip>`
- DropdownMenu destructive item: `<DropdownMenuItem variant="destructive">`
- Dialog: use `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription` for accessibility

---

## Icons

- Use `HugeiconsIcon` from `@hugeicons/react` with icons from `@hugeicons/core-free-icons`
- Pattern: `<HugeiconsIcon icon={SomeIcon} size={16} className="..." />`
- Never inline SVGs directly

---

## CodeMirror 6

- Use `@uiw/react-codemirror` wrapper; configure `basicSetup` explicitly (disable `foldGutter`, `searchKeymap` to avoid conflicts)
- Custom keybindings: wrap with `Prec.highest(keymap.of([...]))` so they override defaults
- Apply theme overrides via `EditorView.theme({...})` using `hsl(var(--border))` CSS vars for consistency
- Track cursor position via `EditorView.updateListener`; detect dark mode via `MutationObserver` on `document.documentElement.classList`

---

## TanStack Table + Virtual

- Build column definitions with `useMemo` keyed to the result object (not just column names)
- Use stable `id` per column: `col + "_" + index` to avoid React key collisions
- Virtualize with `@tanstack/react-virtual`; use padding rows (not `position: absolute`) for scroll space
- Force full remount of `VirtualTable` on new query result with `key={result.duration}` to prevent stale state

---

## Performance

- `useCallback` for event handlers passed as props; `useMemo` for derived data
- `useRef` to keep stable callback references inside hooks without widening `useEffect` deps
- Use `React.memo` only after profiling confirms unnecessary re-renders
- Warm caches eagerly: fetch column metadata when a table is selected, not when columns panel opens

---

## File & Folder Conventions

- Components: `PascalCase.tsx` inside a `kebab-case/` folder
- Custom hooks: `useCamelCase.ts` co-located with the component, or `use-kebab-case.ts` in `src/hooks/`
- Barrel exports via `index.ts` in each feature folder
- Path aliases: `@/` → `src/`
- Never create new files in `frontend/bindings/`

---

## Accessibility

- Tree components: `role="tree"` on container, `role="treeitem"` on nodes, `aria-expanded`, `aria-selected`
- Form fields: `htmlFor` on `<Label>`, matching `id` on input, error with `role="alert"`
- Semantic landmarks: `<header>`, `<aside>`, `<main>`, `<footer>` for layout regions
- Status messages: `role="status"` for non-critical updates (row count, connection state)
