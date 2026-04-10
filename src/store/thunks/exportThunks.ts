"use client";
/**
 * Redux thunks for export and import operations.
 *
 * Cloud operations call the server API routes.
 * Local operations use the browser-side IDB utilities.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { ImportSummary } from "@/lib/export/manifest";

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown error";

// ─── Cloud export ─────────────────────────────────────────────────────────────

/**
 * Download a full cloud backup as a .zip file.
 * Triggers browser download — does not change Redux state.
 */
export const exportCloudBackup = createAsyncThunk(
  "app/exportCloudBackup",
  async (_, thunkAPI) => {
    try {
      const response = await fetch("/api/export");
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const msg = body?.error?.subtitle ?? body?.error?.title ??
          `HTTP ${response.status}`;
        return thunkAPI.rejectWithValue({
          title: "Export failed",
          subtitle: msg,
        });
      }

      // Extract filename from Content-Disposition header if possible
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ??
        `backup-${new Date().toISOString().slice(0, 10)}.zip`;

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      return thunkAPI.fulfillWithValue({ filename });
    } catch (error: unknown) {
      console.error("[exportCloudBackup]", error);
      return thunkAPI.rejectWithValue({
        title: "Export failed",
        subtitle: toErrorMessage(error),
      });
    }
  },
);

// ─── Cloud import ─────────────────────────────────────────────────────────────

/**
 * Upload a backup .zip file and import it into the cloud database.
 * Returns an ImportSummary with counts of imported/skipped/errors.
 */
export const importCloudBackup = createAsyncThunk(
  "app/importCloudBackup",
  async (file: File, thunkAPI) => {
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/import", {
        method: "POST",
        body: formData,
      });

      const body = await response.json();
      if (!response.ok) {
        const msg = body?.error?.subtitle ?? body?.error?.title ??
          `HTTP ${response.status}`;
        return thunkAPI.rejectWithValue({
          title: "Import failed",
          subtitle: msg,
        });
      }

      return thunkAPI.fulfillWithValue(body.data as ImportSummary);
    } catch (error: unknown) {
      console.error("[importCloudBackup]", error);
      return thunkAPI.rejectWithValue({
        title: "Import failed",
        subtitle: toErrorMessage(error),
      });
    }
  },
);

// ─── Local export ─────────────────────────────────────────────────────────────

/**
 * Build a local backup zip from IndexedDB and trigger a browser download.
 * Dynamic import keeps IDB/JSZip code out of the SSR bundle.
 */
export const exportLocalBackup = createAsyncThunk(
  "app/exportLocalBackup",
  async (_, thunkAPI) => {
    try {
      const { buildLocalBackupZip, triggerDownload } = await import(
        "@/lib/export/localBundler"
      );
      const result = await buildLocalBackupZip();
      const filename = `local-backup-${
        new Date().toISOString().slice(0, 10)
      }.zip`;
      triggerDownload(result.blob, filename);
      return thunkAPI.fulfillWithValue({
        filename,
        ...result.stats,
        warnings: result.warnings,
      });
    } catch (error: unknown) {
      console.error("[exportLocalBackup]", error);
      return thunkAPI.rejectWithValue({
        title: "Local export failed",
        subtitle: toErrorMessage(error),
      });
    }
  },
);

// ─── Local import ─────────────────────────────────────────────────────────────

/**
 * Import a backup .zip file into the local IndexedDB stores.
 * Returns an ImportSummary.
 */
export const importLocalBackup = createAsyncThunk(
  "app/importLocalBackup",
  async (file: File, thunkAPI) => {
    try {
      const { importLocalBackupZip } = await import(
        "@/lib/export/localImporter"
      );
      const summary = await importLocalBackupZip(file);
      return thunkAPI.fulfillWithValue(summary);
    } catch (error: unknown) {
      console.error("[importLocalBackup]", error);
      return thunkAPI.rejectWithValue({
        title: "Local import failed",
        subtitle: toErrorMessage(error),
      });
    }
  },
);
