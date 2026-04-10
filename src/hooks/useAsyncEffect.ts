import { DependencyList, useEffect } from "react";

type Cleanup = (() => void) | void;
type AsyncEffectCallback = (isCancelled: () => boolean) => Promise<Cleanup>;

/**
 * A useEffect wrapper for async side-effects that prevents stale state updates
 * after the component unmounts or before the next effect run.
 *
 * The callback receives `isCancelled()` — call it before any state update that
 * follows an `await` to guard against setting state on an unmounted component.
 *
 * The callback may return a synchronous cleanup function (same as useEffect).
 *
 * @example
 * useAsyncEffect(async (isCancelled) => {
 *   const data = await fetchSomething();
 *   if (!isCancelled()) setState(data);
 * }, [dep]);
 */
export function useAsyncEffect(
  effect: AsyncEffectCallback,
  deps: DependencyList,
): void {
  useEffect(() => {
    let cancelled = false;
    let cleanup: Cleanup;

    effect(() => cancelled).then((result) => {
      cleanup = result;
    });

    return () => {
      cancelled = true;
      if (typeof cleanup === "function") cleanup();
    };
    // Deps are forwarded as-is; the caller is responsible for correctness.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
