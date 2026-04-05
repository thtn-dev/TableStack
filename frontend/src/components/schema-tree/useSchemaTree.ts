import { useState, useCallback, useRef } from "react";

// =============================================================================
// Tree expand/collapse state — local only, not persisted to Zustand.
// =============================================================================

type NodeKey = string; // `${profileId}` or `${profileId}::${schema}`

interface UseSchemaTreeReturn {
  isExpanded: (key: NodeKey) => boolean;
  toggle: (key: NodeKey) => void;
  expand: (key: NodeKey) => void;
  collapse: (key: NodeKey) => void;
  collapseAll: () => void;
}

export function useSchemaTree(
  defaultExpanded: NodeKey[] = []
): UseSchemaTreeReturn {
  const [expanded, setExpanded] = useState<Set<NodeKey>>(
    () => new Set(defaultExpanded)
  );

  // Keep a ref to the current Set so callbacks below never go stale.
  // This avoids adding `expanded` to deps, which would create new function
  // references on every toggle and cascade re-renders through the whole tree.
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;

  // Stable reference — reads from ref, not closure over `expanded`.
  const isExpanded = useCallback(
    (key: NodeKey) => expandedRef.current.has(key),
    [] // stable forever
  );

  const toggle = useCallback((key: NodeKey) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const expand = useCallback((key: NodeKey) => {
    setExpanded((prev) => {
      if (prev.has(key)) return prev;
      return new Set([...prev, key]);
    });
  }, []);

  const collapse = useCallback((key: NodeKey) => {
    setExpanded((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const collapseAll = useCallback(() => setExpanded(new Set()), []);

  return { isExpanded, toggle, expand, collapse, collapseAll };
}
