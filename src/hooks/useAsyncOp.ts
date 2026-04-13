"use client";
import { useCallback, useState } from "react";

type AsyncOpResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Manages loading / error / data state for a single async operation.
 * Call `execute` with an async factory that returns a tagged union result.
 */
export function useAsyncOp<T>() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<T | null>(null);

  const execute = useCallback(
    async (fn: () => Promise<AsyncOpResult<T>>) => {
      setError(null);
      setData(null);
      setLoading(true);
      try {
        const result = await fn();
        if (result.ok) setData(result.data);
        else setError(result.error);
        return result;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { loading, error, data, execute };
}
