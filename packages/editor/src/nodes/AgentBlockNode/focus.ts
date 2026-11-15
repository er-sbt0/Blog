/**
 * "Focus the prompt of the block that was just inserted" (§4.4).
 *
 * The insert happens in a Lexical update, before React has mounted the block's
 * component, so there is no element to focus yet. The plugin records the new
 * node's key here and the component claims it on mount — once, so a later
 * remount (a split, a reload) does not steal focus from wherever the author is.
 */
const pending = new Set<string>();

export const requestAgentFocus = (key: string): void => {
  pending.add(key);
};

export const takeAgentFocus = (key: string): boolean => pending.delete(key);
