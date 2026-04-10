import { format } from "date-fns";

interface DateDisplayProps {
  date: Date | string;
  variant?: "short" | "medium" | "long" | "full";
  customFormat?: string;
  className?: string;
}

/**
 * DateDisplay - Renders dates consistently on server and client
 *
 * Formats dates consistently regardless of server/client timezone.
 * All dates are formatted consistently to avoid hydration mismatches.
 *
 * @example
 * <DateDisplay date={post.updatedAt} variant="short" />
 */
export function DateDisplay({
  date,
  variant = "medium",
  customFormat,
  className,
}: DateDisplayProps) {
  const dateObj = typeof date === "string" ? new Date(date) : date;

  // Format strings that match across all timezones
  const formats = {
    short: "MMM d", // Jan 31
    medium: "MMM d, yyyy", // Jan 31, 2026
    long: "MMMM d, yyyy", // January 31, 2026
    full: "MMMM d, yyyy, h:mm a", // January 31, 2026, 3:45 PM
  };

  const formatStr = customFormat || formats[variant];
  const formatted = format(dateObj, formatStr);

  return (
    <time dateTime={dateObj.toISOString()} className={className}>
      {formatted}
    </time>
  );
}
