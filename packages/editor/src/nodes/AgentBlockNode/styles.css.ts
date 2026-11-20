/**
 * The `/agent` block's chrome. Editor-only: `exportDOM` renders nothing, so
 * there is no reader-facing half in `theme.css` to keep in step.
 *
 * Every colour comes from `styles/tokens.css.ts` — DESIGN.md §19, enforced by
 * `pnpm check:theme`, which reads `.css.ts` as well as `.css`.
 */
import { keyframes, style } from "@vanilla-extract/css";
import { DURATION, FONT, RADIUS, SPACE } from "../../styles/scale";
import { vars } from "../../styles/tokens.css";

export const card = style({
  display: "flex",
  flexDirection: "column",
  gap: SPACE.sm,
  margin: `${SPACE.sm} 0`,
  padding: SPACE.md,
  border: `1px solid ${vars.color.border}`,
  borderRadius: RADIUS.lg,
  backgroundColor: vars.color.fillQuaternary,
  color: vars.color.text,
  fontSize: FONT.lg,
  lineHeight: 1.5,
  userSelect: "text",
  transition: `border-color ${DURATION.base} ease`,
  selectors: {
    '&[data-running="true"]': { borderColor: vars.color.accentSoft },
    "&:focus-within": { borderColor: vars.color.textTertiary },
  },
});

export const header = style({
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: SPACE.sm,
  minHeight: "28px",
});

export const title = style({
  display: "inline-flex",
  alignItems: "center",
  gap: SPACE.xs,
  fontWeight: 600,
  color: vars.color.text,
});

export const spacer = style({ flex: 1 });

/** Status, the folder and the selection: one chip vocabulary. */
export const chip = style({
  display: "inline-flex",
  alignItems: "center",
  gap: SPACE.xs,
  maxWidth: "100%",
  padding: `2px ${SPACE.sm}`,
  borderRadius: "9999px",
  backgroundColor: vars.color.fillTertiary,
  color: vars.color.textSecondary,
  fontSize: FONT.sm,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

export const chipText = style({
  overflow: "hidden",
  textOverflow: "ellipsis",
});

export const statusRunning = style({
  backgroundColor: vars.color.accentSoft,
  color: vars.color.text,
});

export const statusError = style({
  backgroundColor: vars.color.dangerSoft,
  color: vars.color.danger,
});

/** "Waiting on you": a card needs the author. */
export const statusWaiting = style({
  backgroundColor: vars.color.warningSoft,
  color: vars.color.text,
});

export const statusDone = style({
  backgroundColor: vars.color.successSoft,
  color: vars.color.success,
});

/** One sent prompt. Locked: it is the record of what was asked. */
export const prompt = style({
  margin: 0,
  padding: `${SPACE.sm} ${SPACE.md}`,
  borderLeft: `2px solid ${vars.color.accent}`,
  borderRadius: RADIUS.sm,
  backgroundColor: vars.color.fillTertiary,
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
});

export const promptLabel = style({
  display: "block",
  marginBottom: "2px",
  fontSize: FONT.xs,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: vars.color.textTertiary,
});

export const hint = style({
  margin: 0,
  fontSize: FONT.md,
  color: vars.color.textSecondary,
});

export const composer = style({
  display: "flex",
  alignItems: "flex-end",
  gap: SPACE.sm,
});

export const input = style({
  flex: 1,
  minWidth: 0,
  padding: `${SPACE.sm} ${SPACE.md}`,
  border: `1px solid ${vars.color.border}`,
  borderRadius: RADIUS.md,
  backgroundColor: vars.color.bg,
  color: vars.color.text,
  fontFamily: "inherit",
  fontSize: FONT.lg,
  lineHeight: 1.5,
  resize: "none",
  outline: "none",
  selectors: {
    "&:focus-visible": {
      borderColor: vars.color.accent,
      boxShadow: `0 0 0 3px ${vars.color.accentSoft}`,
    },
    "&:disabled": { color: vars.color.textTertiary, cursor: "not-allowed" },
    "&::placeholder": { color: vars.color.textTertiary },
  },
});

export const footer = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: SPACE.sm,
  fontSize: FONT.sm,
  color: vars.color.textTertiary,
});

/** The log's disclosure. A real button: open/closed is announced. */
export const logToggle = style({
  display: "inline-flex",
  alignItems: "center",
  gap: SPACE.xs,
  alignSelf: "flex-start",
  padding: `2px ${SPACE.xs}`,
  border: 0,
  borderRadius: RADIUS.sm,
  background: "none",
  color: vars.color.textSecondary,
  fontFamily: "inherit",
  fontSize: FONT.md,
  cursor: "pointer",
  transition: `background-color ${DURATION.fast} ease`,
  selectors: {
    "&:hover": { backgroundColor: vars.color.fillSecondary },
    "&:focus-visible": {
      outline: `2px solid ${vars.color.accent}`,
      outlineOffset: "1px",
    },
  },
});

/** The log's toggle on the left, the full-transcript link on the right. */
export const logHeader = style({
  display: "flex",
  alignItems: "center",
  gap: SPACE.sm,
  minHeight: "24px",
});

export const logCapped = style({
  color: vars.color.textSecondary,
  fontSize: FONT.sm,
});

/** What the caps cut — said once, above the entries it is about. */
export const logNote = style({
  margin: 0,
  fontSize: FONT.sm,
  color: vars.color.textSecondary,
});

export const caret = style({
  transition: `transform ${DURATION.base} ease`,
  selectors: {
    '[aria-expanded="true"] > &': { transform: "rotate(90deg)" },
  },
});

export const log = style({
  display: "flex",
  flexDirection: "column",
  gap: SPACE.xs,
  margin: 0,
  padding: SPACE.sm,
  listStyle: "none",
  maxHeight: "320px",
  overflowY: "auto",
  border: `1px solid ${vars.color.border}`,
  borderRadius: RADIUS.md,
  backgroundColor: vars.color.bg,
  fontSize: FONT.md,
});

export const logEntry = style({
  display: "flex",
  alignItems: "flex-start",
  gap: SPACE.sm,
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
  color: vars.color.textSecondary,
});

export const logTool = style({
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: FONT.sm,
});

export const logError = style({ color: vars.color.danger });

export const logIcon = style({
  flex: "0 0 auto",
  marginTop: "3px",
  color: vars.color.textTertiary,
});

export const empty = style({
  color: vars.color.textTertiary,
  fontStyle: "italic",
});

const pulse = keyframes({
  "0%, 100%": { opacity: 1 },
  "50%": { opacity: 0.45 },
});

export const live = style({
  "@media": {
    "(prefers-reduced-motion: no-preference)": {
      animation: `${pulse} 1.6s ease-in-out infinite`,
    },
  },
});

/** "Always allowed": the session's grants, each withdrawable. */
export const grants = style({
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: SPACE.xs,
  fontSize: FONT.sm,
});

export const grantsLabel = style({
  display: "inline-flex",
  alignItems: "center",
  gap: SPACE.xs,
  color: vars.color.textTertiary,
});

export const grant = style([chip, {
  maxWidth: "320px",
  paddingRight: "2px",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
}]);

export const grantRemove = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "18px",
  height: "18px",
  padding: 0,
  border: 0,
  borderRadius: "9999px",
  background: "none",
  color: vars.color.textTertiary,
  cursor: "pointer",
  selectors: {
    "&:hover:not(:disabled)": {
      backgroundColor: vars.color.fillSecondary,
      color: vars.color.text,
    },
    "&:focus-visible": {
      outline: `2px solid ${vars.color.accent}`,
      outlineOffset: "1px",
    },
    "&:disabled": { cursor: "not-allowed", opacity: 0.5 },
  },
});

/** A permission card. Pending stands out; a closed one recedes. */
export const permission = style({
  display: "flex",
  flexDirection: "column",
  gap: SPACE.xs,
  padding: `${SPACE.sm} ${SPACE.md}`,
  border: `1px solid ${vars.color.border}`,
  borderRadius: RADIUS.md,
  backgroundColor: vars.color.bg,
  transition: `border-color ${DURATION.base} ease`,
  selectors: {
    '&[data-state="pending"]': {
      borderColor: vars.color.warning,
      backgroundColor: vars.color.warningSoft,
    },
    '&[data-state="expired"]': { color: vars.color.textTertiary },
  },
});

export const permissionHead = style({
  display: "flex",
  alignItems: "center",
  gap: SPACE.sm,
  fontWeight: 600,
  overflowWrap: "anywhere",
});

export const permissionIcon = style({
  flex: "0 0 auto",
  color: vars.color.textSecondary,
});

export const permissionSummary = style({
  display: "block",
  padding: `${SPACE.xs} ${SPACE.sm}`,
  borderRadius: RADIUS.sm,
  backgroundColor: vars.color.fillTertiary,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: FONT.sm,
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
  maxHeight: "160px",
  overflowY: "auto",
});

export const permissionDetail = style({
  margin: 0,
  fontSize: FONT.md,
  color: vars.color.textSecondary,
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
  maxHeight: "120px",
  overflowY: "auto",
});

export const permissionActions = style({
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: SPACE.sm,
  marginTop: SPACE.xs,
});

export const permissionNote = style({
  marginLeft: "auto",
  fontSize: FONT.sm,
  color: vars.color.textTertiary,
});

export const permissionOutcome = style({
  margin: 0,
  fontSize: FONT.md,
  color: vars.color.success,
});

export const permissionDenied = style({ color: vars.color.danger });
