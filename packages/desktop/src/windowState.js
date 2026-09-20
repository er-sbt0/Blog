/**
 * Where the window goes, as arithmetic.
 *
 * Phase 7 of docs/plans/desktop-app.md (§8 item 7). Remembering a window's size
 * and position is trivial; *restoring* one is not, because the display layout
 * that the saved numbers described may no longer exist. The two cases that
 * actually break are named in the phase brief and both are silent:
 *
 * - **A position on a monitor that is no longer attached.** The window is
 *   created successfully, at coordinates no compositor will ever show. There is
 *   no error, no window, and no way for the user to find it — on Wayland there
 *   is not even a "move window" keyboard escape hatch that works reliably.
 *   Restoring off-screen is strictly worse than ignoring the saved state, so
 *   when the saved rectangle is not meaningfully visible anywhere the geometry
 *   is thrown away and the window is centred instead.
 * - **A size larger than the current display.** A 3840×2160 window restored on
 *   a 1920×1080 laptop puts its bottom edge and often its whole title bar out of
 *   reach. Clamped to the work area, which is the display minus the panels — the
 *   thing to clamp against, not the raw screen bounds.
 *
 * Import-free on purpose, the rule `dragGeometry.ts` sets and `session.js`
 * follows: everything here is decided before Electron is involved, `screen`'s
 * display list is a plain array of rectangles, and the failure modes above are
 * the kind a spec can pin and a running window cannot show you. See
 * `__tests__/windowState.test.ts`.
 */

/** The window a first launch gets. Matches phases 2–6's hardcoded pair. */
export const DEFAULT_SIZE = { width: 1400, height: 900 };

/**
 * The smallest window the workspace is usable in — the sidebar, the pane strip
 * and the right rail all have fixed minimums of their own, and below this they
 * start overlapping rather than reflowing.
 *
 * A work area smaller than this wins anyway: a window that does not fit the
 * display is the problem being solved, so this is a floor on *our* clamping,
 * not a demand made of the screen.
 */
export const MIN_SIZE = { width: 800, height: 600 };

/**
 * How much of the window has to be on a display for the saved position to be
 * worth keeping.
 *
 * Roughly a title bar's worth of height and enough width to grab it with a
 * mouse. Less than this and the window is technically on screen and
 * practically lost, which is the failure this whole module exists to avoid —
 * so it is treated as "not visible" and the window is re-centred.
 */
export const VISIBLE_MARGIN = { width: 120, height: 48 };

/**
 * Accept a stored blob only if every number in it is one.
 *
 * The file is JSON on disk, so it can be hand-edited, truncated by a crash
 * during the write, or left over from a version that stored something else.
 * `null` means "ignore what was saved", and every caller treats that as a first
 * launch — which is the safe direction, because the alternative is passing
 * `NaN` to `BrowserWindow` and getting a window at an undefined position.
 */
export function normalizeWindowState(raw) {
  if (!raw || typeof raw !== "object") return null;
  const { x, y, width, height } = raw;
  if (![x, y, width, height].every((value) => Number.isFinite(value))) return null;
  if (width <= 0 || height <= 0) return null;
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
    maximized: raw.maximized === true,
  };
}

function intersection(a, b) {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return { width: Math.max(0, width), height: Math.max(0, height) };
}

function clamp(value, low, high) {
  return Math.min(Math.max(value, low), high);
}

/**
 * The display a saved rectangle belongs to: the one it overlaps most.
 *
 * "Most", not "first that overlaps", because a window straddling two monitors
 * has to land somewhere and the one holding more of it is the one the user was
 * looking at. Returns `null` when nothing overlaps at all — which is exactly
 * the detached-monitor case, and the caller turns it into a re-centre rather
 * than a guess.
 */
export function displayForBounds(bounds, displays) {
  let best = null;
  let bestArea = 0;
  for (const display of displays) {
    const area = intersection(bounds, display.workArea);
    const overlap = area.width * area.height;
    if (overlap > bestArea) {
      best = display;
      bestArea = overlap;
    }
  }
  return best;
}

/** The display a window with no remembered position opens on. */
function primaryDisplay(displays, primaryId) {
  if (primaryId !== undefined) {
    const named = displays.find((display) => display.id === primaryId);
    if (named) return named;
  }
  return displays[0];
}

function centred(size, workArea) {
  return {
    x: Math.round(workArea.x + (workArea.width - size.width) / 2),
    y: Math.round(workArea.y + (workArea.height - size.height) / 2),
    width: size.width,
    height: size.height,
  };
}

function fitSize(size, workArea) {
  return {
    width: Math.round(clamp(size.width, Math.min(MIN_SIZE.width, workArea.width), workArea.width)),
    height: Math.round(
      clamp(size.height, Math.min(MIN_SIZE.height, workArea.height), workArea.height),
    ),
  };
}

/**
 * The bounds to open with, given what was saved and what is plugged in now.
 *
 * `displays` is `screen.getAllDisplays()`'s shape reduced to what matters:
 * `{ id, workArea: { x, y, width, height } }`. Work area rather than bounds,
 * because a maximised-looking window placed under a panel is the same class of
 * mistake as one placed off-screen, only smaller.
 *
 * Returns `{ x, y, width, height, maximized }` always — never a partial object.
 * A caller that had to decide between `setBounds` and letting Electron centre
 * would be re-deriving half of this at the call site.
 */
export function placeWindow(saved, displays, defaults = DEFAULT_SIZE) {
  const state = normalizeWindowState(saved);

  // No displays at all is not a hypothetical: `screen` answers before the
  // compositor has told Electron about any output on some Wayland sessions, and
  // an empty list means every rectangle is off-screen by definition. Nothing
  // can be validated, so nothing saved is used — Electron centres a window with
  // no `x`/`y`, and that is what the caller does with a null position.
  if (displays.length === 0) {
    return { ...defaults, x: null, y: null, maximized: state?.maximized === true };
  }

  if (!state) {
    const display = primaryDisplay(displays);
    return { ...centred(fitSize(defaults, display.workArea), display.workArea), maximized: false };
  }

  const display = displayForBounds(state, displays) ?? primaryDisplay(displays);
  const size = fitSize(state, display.workArea);
  const visible = intersection({ ...state, ...size }, display.workArea);

  // Not enough of it is anywhere: the monitor it was on is gone, or it was
  // dragged to an edge and the layout changed under it. Centre rather than
  // nudge — a window that reappears somewhere sensible is better than one that
  // clings to coordinates that stopped meaning anything.
  if (visible.width < VISIBLE_MARGIN.width || visible.height < VISIBLE_MARGIN.height) {
    return { ...centred(size, display.workArea), maximized: state.maximized };
  }

  // Visible enough to keep the position, but the clamped size may now hang off
  // the right or bottom edge. Minimal shift back inside, so a window the user
  // deliberately parked near an edge stays near that edge.
  return {
    x: clamp(state.x, display.workArea.x, display.workArea.x + display.workArea.width - size.width),
    y: clamp(
      state.y,
      display.workArea.y,
      display.workArea.y + display.workArea.height - size.height,
    ),
    width: size.width,
    height: size.height,
    maximized: state.maximized,
  };
}

/**
 * What to write back, given the window's own report.
 *
 * `normalBounds` rather than `bounds`: a maximised window's `getBounds()` is the
 * screen, so saving that and then restoring un-maximised gives a window the size
 * of the display with no way to tell it was ever anything else. Electron keeps
 * the pre-maximise rectangle in `getNormalBounds()`, and that is the one worth
 * remembering.
 */
export function windowStateToSave({ normalBounds, maximized }) {
  const state = normalizeWindowState(normalBounds);
  if (!state) return null;
  return { ...state, maximized: maximized === true };
}
