import { formatDistanceToNow } from 'date-fns';

interface RelativeDateProps {
  date: Date | string;
  addSuffix?: boolean;
  className?: string;
}

/**
 * RelativeDate - Shows relative time (e.g., "2 hours ago")
 *
 * Relative time calculations are consistent on server/client,
 * making this hydration-safe.
 *
 * @example
 * <RelativeDate date={post.createdAt} addSuffix />
 */
export function RelativeDate({
  date,
  addSuffix = true,
  className
}: RelativeDateProps) {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  const relative = formatDistanceToNow(dateObj, { addSuffix });

  return (
    <time
      dateTime={dateObj.toISOString()}
      title={dateObj.toISOString()}
      className={className}
    >
      {relative}
    </time>
  );
}
