/**
 * The main content column's horizontal gutters, in theme spacing units.
 *
 * These live here rather than inline in `AppLayoutContent`'s Container because
 * they are not private to it. The gutters are deliberately asymmetric — the
 * left one is wider — which means the column's *content box* is not centered on
 * the column, and anything that has to share an axis with the page's content
 * has to know by how much.
 */
export const CONTENT_PAD_X = {
  xs: { left: 5, right: 4 },
  sm: { left: 10, right: 6 },
  md: { left: 12, right: 8 },
} as const;

/**
 * Undo the gutters above, for chrome that sits *inside* the padded container
 * but has to span the whole column: the workspace's toolbar, a pane's sticky
 * header, and the stand-in drawn where either of them will land.
 *
 * Written once because the three have to agree — a rule that stops short of the
 * column edge on one of them and not the others is the visible symptom, and it
 * only ever shows up at one breakpoint.
 */
export const cancelContentGutters = {
  ml: {
    xs: -CONTENT_PAD_X.xs.left,
    sm: -CONTENT_PAD_X.sm.left,
    md: -CONTENT_PAD_X.md.left,
  },
  mr: {
    xs: -CONTENT_PAD_X.xs.right,
    sm: -CONTENT_PAD_X.sm.right,
    md: -CONTENT_PAD_X.md.right,
  },
};
