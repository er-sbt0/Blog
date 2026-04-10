"use client";
import { useEffect, useState } from "react";
import { useSelector } from "@/store";
import { fetchCloudStorageUsage, fetchLocalStorageUsage } from "@/store/app";
import { useErrorAnnounce } from "@/hooks/useErrorAnnounce";
import type { DocumentStorageUsage } from "@/types";

export type StorageUsageState = {
  loading: boolean;
  usage: number;
  details: { value: number; label?: string; color?: string }[];
};

const initial: StorageUsageState = { loading: true, usage: 0, details: [] };

function parse(documents: DocumentStorageUsage[]): StorageUsageState {
  const usage = documents.reduce((acc, d) => acc + (d.size ?? 0), 0) / 1024 /
    1024;
  const details = documents.map((d) => ({
    value: (d.size ?? 0) / 1024 / 1024,
    label: d.name,
  }));
  return { loading: false, usage, details };
}

/**
 * Encapsulates the calls to fetchLocalStorageUsage / fetchCloudStorageUsage
 * from `@/store/app`, keeping StorageChart free of direct store-module imports.
 */
export function useStorageUsage() {
  const user = useSelector((s) => s.user);
  const initialized = useSelector((s) => s.ui.initialized);
  const errorAnnounce = useErrorAnnounce();

  const [local, setLocal] = useState<StorageUsageState>(initial);
  const [cloud, setCloud] = useState<StorageUsageState>(initial);

  useEffect(() => {
    fetchLocalStorageUsage()
      .then((payload) => setLocal(parse(payload)))
      .catch((error: unknown) =>
        errorAnnounce("Failed to load local storage usage", error)
      );
    // errorAnnounce is stable - no need to re-run when it changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user) {
      setCloud({ ...initial, loading: false });
      return;
    }
    setCloud(initial);
    fetchCloudStorageUsage()
      .then((payload) => setCloud(parse(payload)))
      .catch((error: unknown) =>
        errorAnnounce("Failed to load cloud storage usage", error)
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return { local, cloud, initialized };
}
