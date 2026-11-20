import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";

/**
 * The one doc tool that reads the filesystem: `insert_image { path }`
 * (docs/plans/archive/agent-block.md §4.1, §4.2, phase 3).
 *
 * Doc tools are auto-allowed — `canUseTool` lets anything from the in-process
 * server through without a card (`agentPermissions.js`) — so this is a read
 * of the author's disk that nobody is asked about, and whatever it reads lands
 * in a post that may be published. Its whole job is therefore to refuse: a
 * file outside the session's folder, a file that is too big, and a file that
 * is not a picture, whatever its name says.
 *
 * ### The folder is main's, never the renderer's
 *
 * `root` is the session entry's `cwd` — the folder the author picked in the
 * native dialog, or main's own record of it on a resume (`agentSessions.js`).
 * The renderer never names a path here and never receives one: it gets bytes
 * and a type, and uploads them.
 *
 * ### Why this is not `resolveWithin`
 *
 * `src/lib/safePath.ts` takes the *basename* first, because its callers resolve
 * a single hostile filename into a flat directory. Here subdirectories are the
 * ordinary case — `out/plot.png` is what a script writes — so a basename would
 * silently read the wrong file. What is kept is the shape of the guarantee:
 * resolve, then re-check containment, and do the authoritative check on the
 * **real** path, after every symlink has been followed — a link in the folder
 * pointing at `~/.ssh/id_ed25519` resolves to a path outside it and is refused
 * however innocent its own name is. The file is then opened with
 * `O_NOFOLLOW` and its identity (device + inode) compared with what the real
 * path named, so swapping the file for a link between the check and the read
 * gets a refusal rather than the link's target.
 *
 * No `electron` import: the spec drives it against a temporary directory.
 */

/** The same cap as `POST /api/blob` (`MAX_BYTES`), so a file this reads can be stored. */
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;

const MAX_PATH = 4096;

/** Inside `root` (or `root` itself) on a lexical comparison. */
function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

/**
 * Resolve `name` against `root` without touching the disk, or null if it
 * names somewhere else. Relative paths, subdirectories included, and absolute
 * paths that are already inside `root` are accepted; anything that climbs out,
 * an empty name and one carrying a NUL byte are not.
 *
 * The first half only. `readImageFile` repeats the check on the real path,
 * which is the one that decides.
 */
export function resolveInside(root, name) {
  if (typeof root !== "string" || !root || !path.isAbsolute(root)) return null;
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > MAX_PATH || trimmed.includes("\0")) return null;
  const base = path.resolve(root);
  const resolved = path.resolve(base, trimmed);
  if (resolved === base || !isInside(base, resolved)) return null;
  return resolved;
}

const startsWith = (bytes, signature, at = 0) =>
  bytes.length >= at + signature.length &&
  signature.every((byte, i) => bytes[at + i] === byte);

const ascii = (text) => [...text].map((c) => c.charCodeAt(0));

/**
 * An SVG is text, so it is recognised by its prologue: optional BOM and
 * whitespace, an XML declaration, comments, a DOCTYPE with no internal subset
 * (which is where entity definitions live), and then an `<svg` root.
 * Undecodable UTF-8 is not an SVG.
 */
function isSvg(bytes) {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return false;
  }
  let rest = text.slice(0, 8192).replace(/^﻿/, "");
  for (;;) {
    const before = rest;
    rest = rest.replace(/^\s+/, "");
    rest = rest.replace(/^<\?xml[^>]*\?>/, "");
    rest = rest.replace(/^<!--[\s\S]*?-->/, "");
    rest = rest.replace(/^<!DOCTYPE\s+svg[^[>]*>/i, "");
    if (rest === before) break;
  }
  return /^<svg[\s>/]/.test(rest);
}

/**
 * The image type a file's *content* says it is, or null. The extension is
 * never consulted: `notes.png` holding a shell script is not a PNG.
 */
export function sniffImageType(bytes) {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, ascii("GIF87a")) || startsWith(bytes, ascii("GIF89a"))) return "image/gif";
  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) return "image/webp";
  if (isSvg(bytes)) return "image/svg+xml";
  return null;
}

/**
 * @typedef {{ bytes: Uint8Array, mime: string, name: string }} ImageFile
 * @typedef {{ ok: false, error: string }} Refusal
 */

/** @returns {Refusal} */
const refuse = (error) => ({ ok: false, error: String(error) });

/**
 * Read one picture from inside `root` for `insert_image`.
 *
 * Answers `{ ok: true, file: { bytes, mime, name } }` — `name` is the
 * basename, for a default alt text, and nothing in the answer is a path — or
 * `{ ok: false, error }` with a sentence the model can act on. The error says
 * the path was refused without saying what is on the other side of it.
 */
/**
 * @param {string} root
 * @param {string} name
 * @param {{ maxBytes?: number }} [options]
 * @returns {Promise<{ ok: true, file: ImageFile } | Refusal>}
 */
export async function readImageFile(root, name, { maxBytes = IMAGE_MAX_BYTES } = {}) {
  let realRoot;
  try {
    realRoot = await fs.realpath(root);
  } catch {
    return refuse("The session's folder no longer exists.");
  }
  // An absolute path may be spelled through the folder as the author picked
  // it or as it really is; both are the folder.
  const lexical = resolveInside(realRoot, name) ??
    (path.resolve(root) !== realRoot ? resolveInside(path.resolve(root), name) : null);
  if (!lexical) {
    return refuse(
      `insert_image reads only files inside your working folder (${realRoot}); ` +
        `"${String(name).slice(0, 200)}" is not one. Write the file there first.`,
    );
  }

  let real;
  try {
    real = await fs.realpath(lexical);
  } catch {
    return refuse(`No such file in your working folder: ${String(name).slice(0, 200)}`);
  }
  if (real === realRoot || !isInside(realRoot, real)) {
    return refuse(
      `"${String(name).slice(0, 200)}" leads outside your working folder ` +
        "(through a symbolic link), so it cannot be inserted.",
    );
  }

  let handle;
  try {
    const expected = await fs.stat(real);
    if (!expected.isFile()) return refuse(`Not a file: ${String(name).slice(0, 200)}`);
    if (expected.size > maxBytes) {
      return refuse(
        `That file is ${expected.size} bytes; images are capped at ${maxBytes} ` +
          "bytes. Save a smaller one (a lower DPI, or JPEG/WebP).",
      );
    }
    handle = await fs.open(real, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    const opened = await handle.stat();
    if (opened.dev !== expected.dev || opened.ino !== expected.ino || !opened.isFile()) {
      return refuse("The file changed while it was being read. Try again.");
    }
    if (opened.size > maxBytes) {
      return refuse(`That file is over the ${maxBytes}-byte cap for images.`);
    }
    const buffer = await handle.readFile();
    // An exact copy rather than a view, so what is structured-cloned to the
    // renderer is these bytes and not whatever pool a Buffer might sit in.
    const bytes = new Uint8Array(buffer.byteLength);
    bytes.set(buffer);
    if (bytes.length > maxBytes) {
      return refuse(`That file is over the ${maxBytes}-byte cap for images.`);
    }
    if (bytes.length === 0) return refuse("That file is empty.");
    const mime = sniffImageType(bytes);
    if (!mime) {
      return refuse(
        "That file is not a PNG, JPEG, GIF, WebP or SVG — checked by its " +
          "content, not its name.",
      );
    }
    return { ok: /** @type {const} */ (true), file: { bytes, mime, name: path.basename(real) } };
  } catch (cause) {
    return refuse(`That file cannot be read: ${cause?.code ?? cause?.message ?? cause}`);
  } finally {
    await handle?.close().catch(() => {});
  }
}

/**
 * The renderer's input for an `insert_image` call, built field by field from
 * the model's: a `path` becomes `file` (bytes main read), a `url` passes as
 * text, and nothing else the model sent crosses — so a `file` the model made
 * up never reaches the renderer, and no path ever does.
 */
/**
 * @param {unknown} input
 * @param {string} cwd
 * @returns {Promise<{ ok: true, input: Record<string, unknown> } | Refusal>}
 */
export async function prepareImageInput(input, cwd) {
  const args = input && typeof input === "object" ? input : {};
  const hasPath = typeof args.path === "string" && args.path.trim() !== "";
  const hasUrl = typeof args.url === "string" && args.url.trim() !== "";
  if (hasPath === hasUrl) {
    return refuse("insert_image takes exactly one of `path` (a file in your working folder) or `url`.");
  }
  const out = {};
  for (const key of ["alt", "caption", "after", "before", "appendTo", "stateHash"]) {
    if (typeof args[key] === "string") out[key] = args[key];
  }
  if (hasUrl) return { ok: /** @type {const} */ (true), input: { ...out, url: args.url.trim() } };
  const read = await readImageFile(cwd, args.path);
  if (!read.ok) return read;
  return { ok: /** @type {const} */ (true), input: { ...out, file: read.file } };
}
