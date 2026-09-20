import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { dialog } from "electron";
import { backupFileName, describeImport } from "./fileTargets.js";

/**
 * The backup bundles, with a native front door.
 *
 * §6 and §8 item 7. `/api/export` and `/api/import` already round-trip a whole
 * account — documents, revisions, series, attachments and blobs — and §7 makes
 * that pair the v1 answer to "the desktop app and the VPS hold the same posts".
 * What they did not have on desktop is a way to say *where the file goes* or
 * *which file to read*: in a browser that is the download shelf and a file
 * input, and this window has neither.
 *
 * So this is a dialog and nothing else. **Both requests go through the same
 * authorized routes the browser uses**, with the same session cookie, and
 * neither one is reachable without it: `userRoute` is what decides, exactly as
 * it does on the VPS. The shell is presenting a file picker, not obtaining
 * access — and the cookie is passed explicitly rather than by hoping the main
 * process's `fetch` shares Chromium's jar, because "it worked" and "it was
 * authenticated" are not the same observation when the route would 401.
 */

async function readError(response) {
  const body = await response.text().catch(() => "");
  try {
    const parsed = JSON.parse(body);
    if (parsed?.error?.title) {
      return `${response.status} ${parsed.error.title}: ${parsed.error.subtitle ?? ""}`.trim();
    }
  } catch {
    // Not one of the API's own error envelopes; the status and body will do.
  }
  return `${response.status} ${response.statusText}${body ? ` — ${body.slice(0, 400)}` : ""}`;
}

/**
 * Stream `/api/export` to a file the user names.
 *
 * Written to `<chosen>.part` and renamed on success. A backup is the one file
 * in this app whose whole value is being complete, and an interrupted download
 * that leaves a truncated `.zip` sitting at the name the user chose is a backup
 * they will trust until the day they need it.
 */
export async function exportBundle({ origin, cookie, parent, defaultDir, log }) {
  const target = await dialog.showSaveDialog(parent, {
    title: "Export Backup",
    defaultPath: path.join(defaultDir, backupFileName()),
    filters: [{ name: "Backup bundle", extensions: ["zip"] }],
  });
  if (target.canceled || !target.filePath) return null;

  const response = await fetch(`${origin}/api/export`, { headers: { cookie } });
  if (!response.ok || !response.body) {
    throw new Error(`The server refused the export: ${await readError(response)}`);
  }

  const partial = `${target.filePath}.part`;
  try {
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(partial));
    const { size } = await fs.promises.stat(partial);
    if (size === 0) throw new Error("The server returned an empty bundle.");
    await fs.promises.rename(partial, target.filePath);
    log(`wrote ${target.filePath} (${size} bytes)`);
    return { path: target.filePath, bytes: size };
  } catch (error) {
    await fs.promises.rm(partial, { force: true });
    throw error;
  }
}

/**
 * Post a bundle the user picks to `/api/import`, and report what it did.
 *
 * Read into memory rather than streamed: the route takes `multipart/form-data`
 * and caps the upload at 512 MB, which is also `JSZip.loadAsync`'s working set
 * on the far side, so a streaming client would not change what the server has
 * to hold.
 */
export async function importBundle({ origin, cookie, parent, log }) {
  const chosen = await dialog.showOpenDialog(parent, {
    title: "Import Backup",
    properties: ["openFile"],
    filters: [{ name: "Backup bundle", extensions: ["zip"] }],
  });
  if (chosen.canceled || chosen.filePaths.length === 0) return null;

  const file = chosen.filePaths[0];
  const bytes = await fs.promises.readFile(file);
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "application/zip" }), path.basename(file));

  const response = await fetch(`${origin}/api/import`, {
    method: "POST",
    headers: { cookie },
    body: form,
  });
  if (!response.ok) throw new Error(`The server refused the import: ${await readError(response)}`);

  // `{ data: summary }`, not the summary — the route wraps it the way the rest
  // of the API does. Read straight, every count is `undefined`, every default
  // in `describeImport` fires, and a restore that worked reports "Nothing was
  // imported". It looks exactly like the empty case it is supposed to detect,
  // which is how this survived its first run.
  const body = await response.json();
  const summary = body?.data ?? body;
  const described = describeImport(summary);
  log(`imported ${file}: ${described.detail.split("\n")[0]}`);
  return { ...described, summary, path: file };
}
