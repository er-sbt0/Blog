/**
 * Registry of per-document save callbacks. Each EditorTabPanel registers its
 * saveToCloud function here on mount and unregisters on unmount.
 * triggerSave() calls all registered callbacks concurrently so that one
 * "Save" action persists every open tab.
 */

const saveCallbacks = new Map<string, () => Promise<boolean>>();

export function registerSaveCallback(
  docId: string,
  fn: () => Promise<boolean>,
): void {
  saveCallbacks.set(docId, fn);
}

export function unregisterSaveCallback(docId: string): void {
  saveCallbacks.delete(docId);
}

export async function triggerSave(): Promise<boolean> {
  if (saveCallbacks.size === 0) return true;
  const results = await Promise.all(
    [...saveCallbacks.values()].map((fn) => fn()),
  );
  return results.every(Boolean);
}
