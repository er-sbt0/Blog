import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer, type Server } from "node:net";
import { isStablePort, readPortFile, stableHttpPort } from "../paths.js";

/**
 * The port the window's origin is built from.
 *
 * A spec rather than something anyone would notice by running the app, because
 * the failure it guards is silent in exactly the way the window-state one is:
 * an ephemeral HTTP port each launch means the renderer opens onto a *different
 * origin* each launch, and the browser scopes `localStorage` and IndexedDB per
 * origin. Nothing errors. The sidebar is its default width, the Copilot panel
 * is closed, every series is expanded again and the workspace record with the
 * open tabs and their scroll positions is addressed to an origin that will
 * never come back — 37 such directories had accumulated under `userData`.
 *
 * So what is asserted here is the part that has to hold for storage to survive:
 * a remembered port is re-bound rather than re-picked, a file we cannot trust
 * reads as "nothing remembered" rather than reaching `listen`, and a remembered
 * port that something else now holds yields a *different* one that is itself
 * remembered — the self-healing direction, at the price of one reset launch.
 */

const tmpdir = () =>
  fs.mkdtempSync(path.join(os.tmpdir(), "blog-desktop-port-"));

/** Hold a loopback port for the duration of one assertion. */
const occupy = (port: number): Promise<Server> =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });

const release = (server: Server) =>
  new Promise<void>((resolve) => server.close(() => resolve()));

describe("isStablePort", () => {
  it("accepts an unprivileged port", () => {
    expect(isStablePort(61234)).toBe(true);
    expect(isStablePort(1024)).toBe(true);
    expect(isStablePort(65535)).toBe(true);
  });

  it("refuses the ports that belong to a database this app must not touch", () => {
    // The whole reason the check is repeated here: a remembered port skips
    // `freePort`, which is where `assertNotForbidden` normally sits. A file
    // holding 5432 would otherwise send the shell at the developer's container.
    expect(isStablePort(5432)).toBe(false);
    expect(isStablePort(55432)).toBe(false);
    expect(isStablePort(55433)).toBe(false);
  });

  it("refuses privileged, out-of-range and non-integer values", () => {
    expect(isStablePort(80)).toBe(false);
    expect(isStablePort(0)).toBe(false);
    expect(isStablePort(70000)).toBe(false);
    expect(isStablePort(61234.5)).toBe(false);
    expect(isStablePort(Number.NaN)).toBe(false);
    expect(isStablePort("61234" as unknown as number)).toBe(false);
  });
});

describe("readPortFile", () => {
  it("reads a port back", () => {
    const file = path.join(tmpdir(), "http-port.json");
    fs.writeFileSync(file, JSON.stringify({ port: 61234 }));
    expect(readPortFile(file)).toBe(61234);
  });

  it("reads a missing, truncated or foreign file as nothing remembered", () => {
    const dir = tmpdir();
    expect(readPortFile(path.join(dir, "absent.json"))).toBeNull();

    const truncated = path.join(dir, "truncated.json");
    fs.writeFileSync(truncated, '{ "port": 612');
    expect(readPortFile(truncated)).toBeNull();

    const foreign = path.join(dir, "foreign.json");
    fs.writeFileSync(foreign, JSON.stringify({ port: "61234" }));
    expect(readPortFile(foreign)).toBeNull();

    const forbidden = path.join(dir, "forbidden.json");
    fs.writeFileSync(forbidden, JSON.stringify({ port: 5432 }));
    expect(readPortFile(forbidden)).toBeNull();
  });
});

describe("stableHttpPort", () => {
  it("remembers the port it picked, so the next launch has the same origin", async () => {
    const file = path.join(tmpdir(), "http-port.json");

    const first = await stableHttpPort(file);
    expect(isStablePort(first)).toBe(true);
    expect(readPortFile(file)).toBe(first);

    // The claim the whole change rests on: two launches, one origin.
    expect(await stableHttpPort(file)).toBe(first);
  });

  it("picks another when the remembered port is taken, and remembers that one", async () => {
    const file = path.join(tmpdir(), "http-port.json");
    const taken = await stableHttpPort(file);
    const squatter = await occupy(taken);

    const logged: string[] = [];
    try {
      const next = await stableHttpPort(file, (line: string) => logged.push(line));
      expect(next).not.toBe(taken);
      expect(isStablePort(next)).toBe(true);
      // Persisted rather than left as this launch's accident: the reset costs
      // one launch, not every launch after it.
      expect(readPortFile(file)).toBe(next);
    } finally {
      await release(squatter);
    }

    // Said out loud, because "my layout is gone" is otherwise unexplainable.
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain(String(taken));
  });

  it("still yields a port when it cannot be remembered", async () => {
    // An unwritable directory is not a reason to refuse to launch — it costs
    // the next launch its storage, which is where we were before the file.
    const file = path.join(tmpdir(), "missing-dir", "http-port.json");
    const port = await stableHttpPort(file);
    expect(isStablePort(port)).toBe(true);
    expect(readPortFile(file)).toBeNull();
  });
});
