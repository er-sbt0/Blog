const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Formats a date as "Jan 1, 2020". */
export function formatFullDate(dateString: string | Date): string {
  const date = typeof dateString === "string"
    ? new Date(dateString)
    : dateString;
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

/**
 * Formats a date relatively ("Today", "Yesterday", "3d ago", etc.) and falls
 * back to `formatFullDate` for dates older than a year.
 */
export function formatRelativeDate(dateString: string | Date): string {
  const date = typeof dateString === "string"
    ? new Date(dateString)
    : dateString;
  const now = new Date();
  const diffDays = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return formatFullDate(date);
}
