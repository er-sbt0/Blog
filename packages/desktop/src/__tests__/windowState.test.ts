import {
  DEFAULT_SIZE,
  displayForBounds,
  MIN_SIZE,
  normalizeWindowState,
  placeWindow,
  VISIBLE_MARGIN,
  windowStateToSave,
} from "../windowState.js";

/**
 * Restoring a window (docs/plans/desktop-app.md §8 item 7, phase 7).
 *
 * Every assertion here is about a window the user cannot see or cannot reach,
 * which is why this is a spec and not something anyone was going to notice by
 * running it: a laptop undocked between two launches puts the saved rectangle
 * on a display that no longer exists, and Electron will honour those
 * coordinates without complaint. There is no error, no window, and on Wayland
 * no reliable "move window" escape hatch. The same is true of a 4K window
 * restored on a 1080p panel, only smaller and slower to notice.
 *
 * So the rule the whole module encodes — **ignoring the saved state beats
 * honouring it off-screen** — is asserted here rather than trusted, along with
 * the shapes that get it wrong quietly: a truncated JSON file, a display list
 * that is empty because the compositor has not answered yet, and a maximized
 * window whose `getBounds()` is the screen.
 */

const laptop = { id: 1, workArea: { x: 0, y: 27, width: 1920, height: 1053 } };
/** A second monitor to the right, as `screen` reports one: offset, not indexed. */
const external = { id: 2, workArea: { x: 1920, y: 0, width: 2560, height: 1440 } };

describe("normalizeWindowState", () => {
  it("accepts a well-formed rectangle and rounds it", () => {
    expect(normalizeWindowState({ x: 10.4, y: 20.6, width: 800.2, height: 600.8 })).toEqual({
      x: 10,
      y: 21,
      width: 800,
      height: 601,
      maximized: false,
    });
  });

  /**
   * The file is JSON on disk, written during `close` — the moment a process is
   * most likely to be interrupted. Every one of these reads as "first launch",
   * because the alternative is `NaN` reaching `BrowserWindow`.
   */
  it.each([
    ["nothing", null],
    ["a string", "{}"],
    ["a missing coordinate", { x: 0, y: 0, width: 800 }],
    ["NaN", { x: NaN, y: 0, width: 800, height: 600 }],
    ["Infinity", { x: 0, y: Infinity, width: 800, height: 600 }],
    ["a zero size", { x: 0, y: 0, width: 0, height: 600 }],
    ["a negative size", { x: 0, y: 0, width: 800, height: -600 }],
    ["a stringified number", { x: "0", y: 0, width: 800, height: 600 }],
  ])("refuses %s", (_label, raw) => {
    expect(normalizeWindowState(raw as never)).toBeNull();
  });

  it("carries `maximized` only when it is exactly true", () => {
    const bounds = { x: 0, y: 0, width: 800, height: 600 };
    expect(normalizeWindowState({ ...bounds, maximized: true })?.maximized).toBe(true);
    expect(normalizeWindowState({ ...bounds, maximized: "yes" })?.maximized).toBe(false);
    expect(normalizeWindowState(bounds)?.maximized).toBe(false);
  });
});

describe("displayForBounds", () => {
  it("picks the display holding most of the window, not the first one it touches", () => {
    // Straddling the seam, mostly on the external monitor.
    const straddling = { x: 1700, y: 100, width: 1200, height: 800 };
    expect(displayForBounds(straddling, [laptop, external])?.id).toBe(external.id);
  });

  it("returns null when the rectangle touches nothing — the unplugged monitor", () => {
    expect(displayForBounds({ x: 3000, y: 200, width: 1400, height: 900 }, [laptop])).toBeNull();
  });

  it("does not count a shared edge as overlap", () => {
    expect(displayForBounds({ x: 1920, y: 27, width: 400, height: 300 }, [laptop])).toBeNull();
  });
});

describe("placeWindow", () => {
  it("centres the default size on a first launch", () => {
    const placed = placeWindow(null, [laptop]);
    expect(placed).toEqual({
      x: Math.round((1920 - DEFAULT_SIZE.width) / 2),
      y: Math.round(27 + (1053 - DEFAULT_SIZE.height) / 2),
      ...DEFAULT_SIZE,
      maximized: false,
    });
  });

  it("keeps a position that is still entirely on a display", () => {
    const saved = { x: 100, y: 100, width: 1200, height: 800, maximized: false };
    expect(placeWindow(saved, [laptop, external])).toEqual({ ...saved });
  });

  /**
   * The case the phase brief names first, and the reason this module exists.
   *
   * The window was on a monitor at x=1920. That monitor is gone. Honouring the
   * saved x puts it somewhere the compositor will never draw; the answer is to
   * forget the position and centre, *keeping the size* — the size was never the
   * problem.
   */
  it("re-centres a window saved on a display that is no longer attached", () => {
    const saved = { x: 2400, y: 300, width: 1200, height: 800, maximized: false };
    const placed = placeWindow(saved, [laptop]);

    expect(placed.width).toBe(1200);
    expect(placed.height).toBe(800);
    expect(placed.x).toBe(Math.round((1920 - 1200) / 2));
    expect(placed.y).toBe(Math.round(27 + (1053 - 800) / 2));
    // And, restated as the property rather than the arithmetic: it is on screen.
    expect(placed.x).toBeGreaterThanOrEqual(laptop.workArea.x);
    expect(placed.x + placed.width).toBeLessThanOrEqual(
      laptop.workArea.x + laptop.workArea.width,
    );
  });

  it("re-centres a window left with only a sliver on screen", () => {
    // 40px of it visible: technically on the display, practically unreachable —
    // below VISIBLE_MARGIN.width, so it is treated as lost.
    const saved = { x: 1880, y: 100, width: 1200, height: 800, maximized: false };
    expect(VISIBLE_MARGIN.width).toBeGreaterThan(40);
    expect(placeWindow(saved, [laptop]).x).toBe(Math.round((1920 - 1200) / 2));
  });

  it("nudges a window that is only slightly off the edge, rather than centring it", () => {
    // 900px of 1200 visible: the user parked it right, and keeping it near the
    // right edge is what they meant. Minimal shift back inside.
    const saved = { x: 1620, y: 100, width: 1200, height: 800, maximized: false };
    const placed = placeWindow(saved, [laptop]);
    expect(placed.x).toBe(1920 - 1200);
    expect(placed.y).toBe(100);
  });

  /** The second named case: a 4K window restored on a 1080p panel. */
  it("clamps a size larger than the display it lands on", () => {
    const saved = { x: 0, y: 0, width: 3840, height: 2160, maximized: false };
    const placed = placeWindow(saved, [laptop]);
    expect(placed.width).toBe(laptop.workArea.width);
    expect(placed.height).toBe(laptop.workArea.height);
    expect(placed.x).toBe(laptop.workArea.x);
    expect(placed.y).toBe(laptop.workArea.y);
  });

  it("clamps to the work area, not the whole screen — a panel is not usable space", () => {
    // `laptop.workArea.y` is 27: a top bar. A window at y=0 would sit under it.
    const saved = { x: 0, y: 0, width: 1920, height: 1080, maximized: false };
    expect(placeWindow(saved, [laptop]).y).toBe(27);
    expect(placeWindow(saved, [laptop]).height).toBe(1053);
  });

  it("grows a stored size that is below the usable minimum", () => {
    const saved = { x: 100, y: 100, width: 200, height: 150, maximized: false };
    const placed = placeWindow(saved, [laptop]);
    expect(placed.width).toBe(MIN_SIZE.width);
    expect(placed.height).toBe(MIN_SIZE.height);
  });

  it("lets a display smaller than the minimum win anyway", () => {
    const tiny = { id: 9, workArea: { x: 0, y: 0, width: 640, height: 480 } };
    const placed = placeWindow({ x: 0, y: 0, width: 1400, height: 900 }, [tiny]);
    expect(placed.width).toBe(640);
    expect(placed.height).toBe(480);
  });

  /**
   * `screen` can answer before the compositor has told Electron about any
   * output. An empty list means every rectangle is off-screen by definition, so
   * nothing saved can be validated and none of it is used — `x: null` is the
   * caller's signal to omit the coordinates and let Electron centre.
   */
  it("ignores the saved geometry when no display is reported", () => {
    const placed = placeWindow({ x: 2400, y: 300, width: 1200, height: 800 }, []);
    expect(placed).toEqual({ ...DEFAULT_SIZE, x: null, y: null, maximized: false });
  });

  it("still restores maximized with no displays, because maximizing needs no coordinates", () => {
    const placed = placeWindow({ x: 0, y: 0, width: 800, height: 600, maximized: true }, []);
    expect(placed.maximized).toBe(true);
  });

  it("carries the maximized flag through a re-centre", () => {
    const saved = { x: 9000, y: 9000, width: 1200, height: 800, maximized: true };
    expect(placeWindow(saved, [laptop]).maximized).toBe(true);
  });

  it("places a window on the external monitor when that is where it was", () => {
    const saved = { x: 2000, y: 100, width: 1400, height: 900, maximized: false };
    expect(placeWindow(saved, [laptop, external])).toEqual({ ...saved });
  });

  it("is idempotent — placing its own answer changes nothing", () => {
    const once = placeWindow({ x: 2400, y: 300, width: 3840, height: 2160 }, [laptop]);
    expect(placeWindow(once, [laptop])).toEqual(once);
  });
});

describe("windowStateToSave", () => {
  it("saves the pre-maximize rectangle, not the screen", () => {
    expect(
      windowStateToSave({
        normalBounds: { x: 120, y: 80, width: 1200, height: 800 },
        maximized: true,
      }),
    ).toEqual({ x: 120, y: 80, width: 1200, height: 800, maximized: true });
  });

  it("refuses to write a rectangle it would refuse to read", () => {
    expect(
      windowStateToSave({ normalBounds: { x: 0, y: 0, width: 0, height: 0 }, maximized: false }),
    ).toBeNull();
    expect(windowStateToSave({ normalBounds: undefined, maximized: false })).toBeNull();
  });
});
