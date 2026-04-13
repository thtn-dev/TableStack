import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { subscribeWithSelector } from "zustand/middleware";
import { useDBStore } from "./useDBStore";

import {
  LoadSession,
  SaveSession,
  OpenFile,
  SaveFile,
} from "../../bindings/github.com/thtn-dev/table_stack/app";

import type { CursorPos, QueryTab, WorkspaceSession } from "./editor-types";

// =============================================================================
// Helpers
// =============================================================================

function generateId(): string {
  return crypto.randomUUID();
}

/** Returns "Query N" where N is the smallest positive integer not yet used. */
function nextQueryTitle(tabs: QueryTab[]): string {
  const usedNums = new Set<number>();
  for (const tab of tabs) {
    const m = tab.title.match(/^Query (\d+)$/);
    if (m) usedNums.add(Number(m[1]));
  }
  let n = 1;
  while (usedNums.has(n)) n++;
  return `Query ${n}`;
}

function makeTab(partial: Partial<QueryTab> & { connectionId: string }, tabs: QueryTab[]): QueryTab {
  const now = Math.floor(Date.now() / 1000);
  const defaults: QueryTab = {
    id: generateId(),
    connectionId: partial.connectionId,
    title: nextQueryTitle(tabs),
    content: "",
    filePath: null,
    isDirty: false,
    cursorPos: { line: 0, column: 0 },
    createdAt: now,
    order: tabs.length,
  };
  // Merge partial over defaults, then pin order to current length
  return { ...defaults, ...partial, order: tabs.length };
}

// =============================================================================
// State shape
// =============================================================================

interface EditorState {
  tabs: QueryTab[];
  activeTabId: string | null;
  activeConnectionId: string | null;

  // ── Session actions ──────────────────────────────────────────────────────────
  loadSession: (session: WorkspaceSession) => void;

  // ── Tab CRUD ─────────────────────────────────────────────────────────────────
  addTab: (partial?: Partial<QueryTab>) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;

  // ── Content mutations ────────────────────────────────────────────────────────
  updateContent: (tabId: string, content: string) => void;
  updateCursor: (tabId: string, cursor: CursorPos) => void;

  // ── File operations ───────────────────────────────────────────────────────────
  /** Opens a file dialog and adds the resulting tab. Returns null if cancelled. */
  openFileTab: () => Promise<QueryTab | null>;
  /** Saves the active tab. Opens Save As dialog if tab has no filePath. */
  saveActiveTab: (forceDialog?: boolean) => Promise<void>;

  /** Mark a tab as saved after a successful SaveFile call. */
  markSaved: (tabId: string, filePath: string, title: string) => void;

  // ── Persist ───────────────────────────────────────────────────────────────────
  /** Immediately save the current session to disk (bypasses debounce). */
  flushSession: () => Promise<void>;
}

// =============================================================================
// Store
// =============================================================================

export const useEditorStore = create<EditorState>()(
  subscribeWithSelector(
    immer((set, get) => ({
      tabs: [],
      activeTabId: null,
      activeConnectionId: null,

      // ── loadSession ───────────────────────────────────────────────────────────
      loadSession(session: WorkspaceSession) {
        set((s) => {
          s.tabs = session.tabs.slice().sort((a, b) => a.order - b.order);
          s.activeTabId = session.activeTabId;
          s.activeConnectionId = session.activeConnectionId;
        });
      },

      // ── addTab ────────────────────────────────────────────────────────────────
      addTab(partial?: Partial<QueryTab>) {
        const { tabs, activeConnectionId } = get();
        const connId = partial?.connectionId ?? activeConnectionId ?? "";
        const tab = makeTab({ ...partial, connectionId: connId }, tabs);
        set((s) => {
          s.tabs.push(tab);
          s.activeTabId = tab.id;
        });
      },

      // ── closeTab ──────────────────────────────────────────────────────────────
      closeTab(tabId: string) {
        set((s) => {
          const idx = s.tabs.findIndex((t) => t.id === tabId);
          if (idx === -1) return;
          s.tabs.splice(idx, 1);
          // Recompute order
          s.tabs.forEach((t, i) => { t.order = i; });
          // If closing active tab, pick adjacent tab
          if (s.activeTabId === tabId) {
            if (s.tabs.length === 0) {
              s.activeTabId = null;
            } else {
              const next = s.tabs[Math.min(idx, s.tabs.length - 1)];
              s.activeTabId = next.id;
            }
          }
        });
        // Clear the per-tab query result so ResultPanel doesn't show stale data
        useDBStore.getState().clearQueryResult(tabId);
      },

      // ── setActiveTab ──────────────────────────────────────────────────────────
      setActiveTab(tabId: string) {
        set((s) => { s.activeTabId = tabId; });
      },

      // ── reorderTabs ───────────────────────────────────────────────────────────
      reorderTabs(fromIndex: number, toIndex: number) {
        set((s) => {
          const [tab] = s.tabs.splice(fromIndex, 1);
          s.tabs.splice(toIndex, 0, tab);
          s.tabs.forEach((t, i) => { t.order = i; });
        });
      },

      // ── updateContent ─────────────────────────────────────────────────────────
      updateContent(tabId: string, content: string) {
        set((s) => {
          const tab = s.tabs.find((t) => t.id === tabId);
          if (!tab) return;
          tab.content = content;
          tab.isDirty = true;
        });
      },

      // ── updateCursor ──────────────────────────────────────────────────────────
      updateCursor(tabId: string, cursor: CursorPos) {
        set((s) => {
          const tab = s.tabs.find((t) => t.id === tabId);
          if (tab) tab.cursorPos = cursor;
        });
      },

      // ── markSaved ─────────────────────────────────────────────────────────────
      markSaved(tabId: string, filePath: string, title: string) {
        set((s) => {
          const tab = s.tabs.find((t) => t.id === tabId);
          if (!tab) return;
          tab.filePath = filePath;
          tab.title = title;
          tab.isDirty = false;
        });
      },

      // ── openFileTab ───────────────────────────────────────────────────────────
      async openFileTab(): Promise<QueryTab | null> {
        const result = await OpenFile();
        if (!result) return null; // user cancelled
        // Ensure connectionId is set
        const connId = get().activeConnectionId ?? "";
        const tab: QueryTab = { ...(result as QueryTab), connectionId: connId };
        get().addTab(tab);
        return tab;
      },

      // ── saveActiveTab ─────────────────────────────────────────────────────────
      async saveActiveTab(forceDialog = false): Promise<void> {
        const { tabs, activeTabId } = get();
        const tab = tabs.find((t) => t.id === activeTabId);
        if (!tab) return;

        const tabToSave: QueryTab = forceDialog
          ? { ...tab, filePath: null }
          : tab;

        const saved = await SaveFile(tabToSave);
        if (!saved) return; // user cancelled dialog
        get().markSaved(saved.id, saved.filePath!, saved.title);
      },

      // ── flushSession ──────────────────────────────────────────────────────────
      async flushSession(): Promise<void> {
        const { tabs, activeTabId, activeConnectionId } = get();
        if (!activeConnectionId) return;
        const session: WorkspaceSession = {
          activeConnectionId,
          activeTabId: activeTabId ?? "",
          tabs,
          lastSavedAt: Math.floor(Date.now() / 1000),
        };
        await SaveSession(activeConnectionId, session);
      },
    })),
  ),
);

// =============================================================================
// Selectors
// =============================================================================

export const selectActiveTab = (s: EditorState): QueryTab | null =>
  s.tabs.find((t) => t.id === s.activeTabId) ?? null;

export const selectHasDirtyTabs = (s: EditorState): boolean =>
  s.tabs.some((t) => t.isDirty);

// =============================================================================
// useAutoSave hook — debounced session save on content/cursor changes
// =============================================================================

import { useEffect, useRef } from "react";

export function useAutoSave(delayMs = 2000) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsub = useEditorStore.subscribe(
      // selector: track tabs content fingerprint + activeTabId
      (s) => ({
        tabs: s.tabs,
        activeTabId: s.activeTabId,
        activeConnectionId: s.activeConnectionId,
      }),
      ({ activeConnectionId, activeTabId, tabs }) => {
        if (!activeConnectionId) return;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(async () => {
          const session: WorkspaceSession = {
            activeConnectionId,
            activeTabId: activeTabId ?? "",
            tabs,
            lastSavedAt: Math.floor(Date.now() / 1000),
          };
          await SaveSession(activeConnectionId, session);
        }, delayMs);
      },
      { equalityFn: (a, b) => a.activeConnectionId === b.activeConnectionId && a.activeTabId === b.activeTabId && a.tabs === b.tabs },
    );

    return () => {
      unsub();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [delayMs]);
}
