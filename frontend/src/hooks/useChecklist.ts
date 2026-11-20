import { useCallback, useEffect, useState } from "react";

type ChecklistMap = Record<string, boolean>;

function storageKey(threadId: string): string {
  return `codeit:checklist:${threadId}`;
}

function readStoredMap(threadId: string | null): ChecklistMap {
  if (!threadId) return {};
  try {
    const raw = window.localStorage.getItem(storageKey(threadId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as ChecklistMap;
    }
  } catch {
    // Storage disabled or unavailable
  }
  return {};
}

export function useChecklist(threadId: string | null) {
  const [checkedMap, setCheckedMap] = useState<ChecklistMap>(() =>
    readStoredMap(threadId)
  );

  useEffect(() => {
    setCheckedMap(readStoredMap(threadId));
  }, [threadId]);

  const toggle = useCallback(
    (findingKey: string, stepIndex: number) => {
      const compositeKey = `${findingKey}::${stepIndex}`;
      setCheckedMap((prev) => {
        const next: ChecklistMap = {
          ...prev,
          [compositeKey]: !prev[compositeKey]
        };
        if (threadId) {
          try {
            window.localStorage.setItem(storageKey(threadId), JSON.stringify(next));
          } catch {
            // Storage quota exceeded or blocked
          }
        }
        return next;
      });
    },
    [threadId]
  );

  const isChecked = useCallback(
    (findingKey: string, stepIndex: number): boolean => {
      return Boolean(checkedMap[`${findingKey}::${stepIndex}`]);
    },
    [checkedMap]
  );

  const getCompletedCount = useCallback(
    (findingKey: string, totalSteps: number): number => {
      let count = 0;
      for (let i = 0; i < totalSteps; i += 1) {
        if (checkedMap[`${findingKey}::${i}`]) count += 1;
      }
      return count;
    },
    [checkedMap]
  );

  return { isChecked, toggle, getCompletedCount };
}
