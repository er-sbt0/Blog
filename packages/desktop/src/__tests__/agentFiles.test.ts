import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  prepareImageInput,
  readImageFile,
  resolveInside,
  sniffImageType,
} from "../agentFiles.js";

/**
 * `insert_image { path }` — the one doc tool that reads the disk, with no card
 * (docs/plans/agent-block.md phase 3). Almost entirely refusals, because a
 * refusal that fails lets a post carry a file from anywhere the author can
 * read: traversal, an absolute path elsewhere, a symlink out of the folder,
 * an oversized file, and a file whose name lies about what it is.
 */

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16]);
const GIF = new TextEncoder().encode("GIF89a\x01\x00");
const WEBP = new TextEncoder().encode("RIFF\x10\x00\x00\x00WEBPVP8 ");
const SVG = new TextEncoder().encode(
  '﻿<?xml version="1.0"?>\n<!-- made by matplotlib -->\n' +
    '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n' +
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>',
);

let base: string;
let root: string;
let outside: string;

beforeEach(() => {
  base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "agent-files-")));
  root = path.join(base, "work");
  outside = path.join(base, "elsewhere");
  fs.mkdirSync(path.join(root, "out"), { recursive: true });
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(root, "out", "plot.png"), PNG);
  fs.writeFileSync(path.join(outside, "secret.png"), PNG);
});
afterEach(() => fs.rmSync(base, { recursive: true, force: true }));

describe("resolveInside", () => {
  it("accepts relative paths, subdirectories and absolute paths inside the folder", () => {
    expect(resolveInside("/w", "plot.png")).toBe("/w/plot.png");
    expect(resolveInside("/w", "out/../out/plot.png")).toBe("/w/out/plot.png");
    expect(resolveInside("/w", "/w/out/plot.png")).toBe("/w/out/plot.png");
    expect(resolveInside("/w", "..dots/x.png")).toBe("/w/..dots/x.png");
  });

  it.each([
    ["traversal", "../secret.png"],
    ["deep traversal", "out/../../secret.png"],
    ["an absolute path elsewhere", "/etc/passwd"],
    ["a sibling sharing the prefix", "/w2/x.png"],
    ["the folder itself", "."],
    ["empty", "   "],
    ["a NUL byte", "plot.png\0.txt"],
  ])("refuses %s", (_why, name) => {
    expect(resolveInside("/w", name)).toBeNull();
  });

  it("refuses a non-string and a relative root", () => {
    expect(resolveInside("/w", 42 as unknown as string)).toBeNull();
    expect(resolveInside("w", "x.png")).toBeNull();
  });
});

describe("sniffImageType", () => {
  it.each([
    ["image/png", PNG],
    ["image/jpeg", JPEG],
    ["image/gif", GIF],
    ["image/webp", WEBP],
    ["image/svg+xml", SVG],
  ])("recognises %s by content", (mime, bytes) => {
    expect(sniffImageType(bytes)).toBe(mime);
  });

  it.each([
    ["a shell script", new TextEncoder().encode("#!/bin/sh\nrm -rf ~\n")],
    ["HTML", new TextEncoder().encode("<html><svg></svg></html>")],
    ["an SVG with an internal DTD subset", new TextEncoder().encode('<!DOCTYPE svg [<!ENTITY a "b">]><svg></svg>')],
    ["text that is not UTF-8", Uint8Array.from([0x3c, 0x73, 0x76, 0x67, 0x20, 0xff, 0xfe])],
    ["a truncated PNG signature", PNG.slice(0, 4)],
    ["nothing", new Uint8Array()],
  ])("refuses %s", (_why, bytes) => {
    expect(sniffImageType(bytes)).toBeNull();
  });
});

describe("readImageFile", () => {
  it("reads a picture inside the folder and answers bytes, type and basename", async () => {
    const read = await readImageFile(root, "out/plot.png");
    expect(read).toMatchObject({ ok: true, file: { mime: "image/png", name: "plot.png" } });
    if (read.ok) expect([...read.file.bytes]).toEqual([...PNG]);
    // No path in the answer.
    expect(JSON.stringify(read)).not.toContain(root);
  });

  it("accepts an absolute path spelled through a symlinked folder", async () => {
    const link = path.join(base, "link-to-work");
    fs.symlinkSync(root, link);
    const read = await readImageFile(link, path.join(link, "out", "plot.png"));
    expect(read.ok).toBe(true);
  });

  it("refuses traversal and absolute paths outside", async () => {
    for (const name of ["../elsewhere/secret.png", path.join(outside, "secret.png")]) {
      const read = await readImageFile(root, name);
      expect(read.ok).toBe(false);
    }
  });

  it("refuses a symlink in the folder that points out of it", async () => {
    fs.symlinkSync(path.join(outside, "secret.png"), path.join(root, "innocent.png"));
    const read = await readImageFile(root, "innocent.png");
    expect(read).toMatchObject({ ok: false });
    if (!read.ok) expect(read.error).toMatch(/outside your working folder/);
  });

  it("refuses a symlinked directory that points out of the folder", async () => {
    fs.symlinkSync(outside, path.join(root, "linked"));
    const read = await readImageFile(root, "linked/secret.png");
    expect(read.ok).toBe(false);
  });

  it("follows a symlink that stays inside the folder", async () => {
    fs.symlinkSync(path.join(root, "out", "plot.png"), path.join(root, "latest.png"));
    expect((await readImageFile(root, "latest.png")).ok).toBe(true);
  });

  it("refuses a file over the cap without reading it", async () => {
    fs.writeFileSync(path.join(root, "big.png"), Buffer.concat([Buffer.from(PNG), Buffer.alloc(64)]));
    const read = await readImageFile(root, "big.png", { maxBytes: 32 });
    expect(read).toMatchObject({ ok: false });
    if (!read.ok) expect(read.error).toMatch(/capped/);
  });

  it("refuses a file whose name says picture and whose content does not", async () => {
    fs.writeFileSync(path.join(root, "plot2.png"), "#!/bin/sh\necho hi\n");
    const read = await readImageFile(root, "plot2.png");
    expect(read).toMatchObject({ ok: false });
    if (!read.ok) expect(read.error).toMatch(/not a PNG, JPEG, GIF, WebP or SVG/);
  });

  it("refuses a directory, a missing file and an empty one", async () => {
    expect((await readImageFile(root, "out")).ok).toBe(false);
    expect((await readImageFile(root, "missing.png")).ok).toBe(false);
    fs.writeFileSync(path.join(root, "empty.png"), "");
    expect((await readImageFile(root, "empty.png")).ok).toBe(false);
  });
});

describe("prepareImageInput", () => {
  it("turns a path into bytes and passes only the fields it knows", async () => {
    const prepared = await prepareImageInput(
      { path: "out/plot.png", alt: "a", caption: "c", after: "blk_x", file: "forged", extra: 1 },
      root,
    );
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(Object.keys(prepared.input).sort()).toEqual(["after", "alt", "caption", "file"]);
    expect((prepared.input.file as { name: string }).name).toBe("plot.png");
  });

  it("passes a url as text and reads nothing", async () => {
    const prepared = await prepareImageInput({ url: " https://example.com/a.png ", alt: "" }, root);
    expect(prepared).toEqual({ ok: true, input: { url: "https://example.com/a.png", alt: "" } });
  });

  it("wants exactly one of path and url", async () => {
    expect((await prepareImageInput({ alt: "" }, root)).ok).toBe(false);
    expect((await prepareImageInput({ path: "out/plot.png", url: "https://x/y.png" }, root)).ok)
      .toBe(false);
  });
});
