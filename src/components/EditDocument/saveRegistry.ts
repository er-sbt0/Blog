/**
 * Module-level registry for the editor's save callback.
 * The DocumentEditor registers its saveToCloud function here on mount and
 * unregisters on unmount. SafeNavigationLink calls triggerSave() and awaits
 * the result before navigating, eliminating the setTimeout race condition.
 */

let saveCallback: (() => Promise<boolean>) | null = null;

export function registerSaveCallback(fn: () => Promise<boolean>): void {
  saveCallback = fn;
}

export function unregisterSaveCallback(): void {
  saveCallback = null;
}

export async function triggerSave(): Promise<boolean> {
  if (!saveCallback) return true; // No editor mounted — nothing to save.
  return saveCallback();
}
