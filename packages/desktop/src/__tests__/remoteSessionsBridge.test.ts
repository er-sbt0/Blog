import {
  API_PREFIX,
  createApiClient,
  createSingleFlight,
  isHostId,
  settleSync,
  unwrapApiResponse,
} from "../remoteSessionsBridge.js";
import { linkDisposition } from "../links.js";

/**
 * docs/plans/remote-claude.md §4.2 and §4.7: the pure half of
 * `window.desktop.sessions.sync` and of where a link may go.
 *
 * The narrowness argument in `preload.cjs` rests on two things pinned here:
 * the renderer's only argument is a host id, refused before any I/O when it is
 * not one, and the alias that reaches ssh comes from the server. The rest is
 * what crosses back over IPC — a value, never a rejection with a stack.
 */

const ID = "0b8f9a52-3c1e-4c55-9d7a-2f6e1a0b9c3d";

const json = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

describe("isHostId", () => {
  it("accepts a UUID", () => {
    expect(isHostId(ID)).toBe(true);
    expect(isHostId(ID.toUpperCase())).toBe(true);
  });

  it.each([
    [undefined],
    [null],
    [42],
    [{ id: ID }],
    [""],
    ["coder.dev"],
    [`${ID}/../../documents`],
    [`${ID}\n`],
    ["-oProxyCommand=sh"],
  ])("refuses %j", (value) => {
    expect(isHostId(value)).toBe(false);
  });
});

describe("unwrapApiResponse", () => {
  it("answers the data of a 2xx", async () => {
    expect(await unwrapApiResponse(json(200, { data: { derived: 3 } }))).toEqual({ derived: 3 });
  });

  it("throws the ApiError subtitle, then the title", async () => {
    await expect(
      unwrapApiResponse(json(404, { error: { title: "Not Found", subtitle: "only on desktop" } })),
    ).rejects.toThrow("only on desktop");
    await expect(unwrapApiResponse(json(404, { error: { title: "Host not found" } }))).rejects.toThrow(
      "Host not found",
    );
  });

  it("names the status when the body is not the API's shape", async () => {
    const notJson = { ok: false, status: 502, json: async () => JSON.parse("<html>") };
    await expect(unwrapApiResponse(notJson)).rejects.toThrow("502");
  });

  it("does not treat a 2xx without data as success", async () => {
    await expect(unwrapApiResponse(json(200, {}))).rejects.toThrow("200");
  });
});

describe("createApiClient", () => {
  function client(responses: unknown[]) {
    const calls: { url: string; init: RequestInit }[] = [];
    let cookie = "next-auth.session-token=one";
    const fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return json(200, { data: responses.shift() });
    }) as unknown as typeof globalThis.fetch;
    const api = createApiClient({ origin: "http://127.0.0.1:41234", cookie: () => cookie, fetch });
    return { api, calls, setCookie: (v: string) => (cookie = v) };
  }

  it("posts JSON under the remote-sessions prefix with the current cookie", async () => {
    const { api, calls, setCookie } = client([{ wanted: [] }, { derived: 0 }]);
    expect(await api.post(`/hosts/${ID}/manifest`, { files: [] })).toEqual({ wanted: [] });
    setCookie("next-auth.session-token=two");
    await api.post(`/hosts/${ID}/finish`, { error: null });

    expect(calls[0].url).toBe(`http://127.0.0.1:41234${API_PREFIX}/hosts/${ID}/manifest`);
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.body).toBe('{"files":[]}');
    expect((calls[0].init.headers as Record<string, string>).cookie).toBe(
      "next-auth.session-token=one",
    );
    // Re-read per call: the sign-out watcher can mint a new session mid-launch.
    expect((calls[1].init.headers as Record<string, string>).cookie).toBe(
      "next-auth.session-token=two",
    );
  });

  it("reads the alias from the server, by id", async () => {
    const { api, calls } = client([{ id: ID, alias: "coder.dev", label: "dev" }]);
    expect(await api.alias(ID)).toBe("coder.dev");
    expect(calls[0].url).toBe(`http://127.0.0.1:41234${API_PREFIX}/hosts/${ID}`);
    expect(calls[0].init.method).toBe("GET");
    expect(calls[0].init.body).toBeUndefined();
  });

  it("refuses a non-id before any request", async () => {
    const { api, calls } = client([]);
    await expect(api.alias("../documents")).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});

describe("createSingleFlight", () => {
  it("gives a second caller the running promise rather than a second run", async () => {
    const flights = createSingleFlight();
    let runs = 0;
    let release!: () => void;
    const task = () => {
      runs++;
      return new Promise<string>((resolve) => (release = () => resolve("done")));
    };
    const a = flights.run(ID, task);
    const b = flights.run(ID, task);
    expect(b).toBe(a);
    await Promise.resolve();
    expect(runs).toBe(1);
    release();
    expect(await a).toBe("done");
    expect(flights.has(ID)).toBe(false);
  });

  it("keeps hosts independent and frees the key after a failure", async () => {
    const flights = createSingleFlight();
    const other = "11111111-2222-4333-8444-555555555555";
    let runs = 0;
    const fail = () => {
      runs++;
      return Promise.reject(new Error("no route to host"));
    };
    await expect(flights.run(ID, fail)).rejects.toThrow();
    await expect(flights.run(ID, fail)).rejects.toThrow();
    await expect(flights.run(other, fail)).rejects.toThrow();
    expect(runs).toBe(3);
  });
});

describe("settleSync", () => {
  it("answers the derived count", async () => {
    expect(await settleSync(Promise.resolve({ derived: 7 }))).toEqual({ ok: true, derived: 7 });
  });

  it("answers ssh's message, not a rejection", async () => {
    const error = new Error("Host key verification failed.");
    expect(await settleSync(Promise.reject(error))).toEqual({
      ok: false,
      error: "Host key verification failed.",
    });
  });

  it("truncates a long message", async () => {
    const result = await settleSync(Promise.reject(new Error("x".repeat(5000))));
    expect(result.ok).toBe(false);
    expect(result.error?.length).toBe(2000);
  });
});

describe("linkDisposition", () => {
  const origin = "http://127.0.0.1:41234";

  it("keeps the app's own pages in the window", () => {
    expect(linkDisposition(`${origin}/sessions`, origin)).toBe("app");
    expect(linkDisposition(`${origin}`, origin)).toBe("app");
  });

  it("sends http(s) elsewhere to the browser", () => {
    expect(linkDisposition("https://example.com/a", origin)).toBe("external");
    expect(linkDisposition("http://example.com", origin)).toBe("external");
  });

  it("does not take a prefix match for the app", () => {
    // Userinfo, then the real host: `startsWith(origin)` called this the app.
    expect(linkDisposition(`${origin}@evil.example/`, origin)).toBe("external");
    expect(linkDisposition("http://127.0.0.1:412345/", origin)).toBe("deny");
    expect(linkDisposition("http://127.0.0.1:41235/", origin)).toBe("external");
  });

  it.each([
    ["file:///home/me/.local/share/applications/x.desktop"],
    ["javascript:alert(1)"],
    ["data:text/html,<script>alert(1)</script>"],
    ["mailto:a@b.c"],
    ["vscode://file/etc/passwd"],
    ["not a url"],
  ])("refuses %j", (url) => {
    expect(linkDisposition(url, origin)).toBe("deny");
  });
});
