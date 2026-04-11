// =============================================================================
// Editor Types — mirrors generated session bindings as plain aliases
// so components never depend on the generated class constructors directly.
// =============================================================================

import type {
  CursorPos as SessionCursorPos,
  QueryTab as SessionQueryTab,
  WorkspaceSession as SessionWorkspaceSession,
} from "../../bindings/github.com/thtn-dev/table_stack/internal/session/models";

/** Cursor position in the SQL editor. */
export type CursorPos = SessionCursorPos;

/** A single query tab in the editor workspace. */
export type QueryTab = SessionQueryTab;

/** Full workspace snapshot for one connection. */
export type WorkspaceSession = SessionWorkspaceSession;
