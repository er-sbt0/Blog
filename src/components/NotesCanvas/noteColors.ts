/**
 * Shared note color definitions for consistent styling across NotesCanvas components
 */

export const NOTE_COLORS = {
  yellow: "linear-gradient(135deg, #FFF9C4 0%, #FFF59D 100%)",
  pink: "linear-gradient(135deg, #FCE4EC 0%, #F8BBD0 100%)",
  blue: "linear-gradient(135deg, #E3F2FD 0%, #BBDEFB 100%)",
  green: "linear-gradient(135deg, #E8F5E9 0%, #C8E6C9 100%)",
  orange: "linear-gradient(135deg, #FFF3E0 0%, #FFE0B2 100%)",
  purple: "linear-gradient(135deg, #F3E5F5 0%, #E1BEE7 100%)",
  mint: "linear-gradient(135deg, #E0F2F1 0%, #B2DFDB 100%)",
  peach: "linear-gradient(135deg, #FFEBEE 0%, #FFCDD2 100%)",
} as const;

export type NoteColorKey = keyof typeof NOTE_COLORS;

export const NOTE_COLOR_LIST = [
  { name: "Yellow", value: "yellow" as NoteColorKey },
  { name: "Pink", value: "pink" as NoteColorKey },
  { name: "Blue", value: "blue" as NoteColorKey },
  { name: "Green", value: "green" as NoteColorKey },
  { name: "Orange", value: "orange" as NoteColorKey },
  { name: "Purple", value: "purple" as NoteColorKey },
  { name: "Mint", value: "mint" as NoteColorKey },
  { name: "Peach", value: "peach" as NoteColorKey },
];
