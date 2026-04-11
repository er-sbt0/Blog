/**
 * Represents a pending (unsaved) date change for a post in time-edit mode.
 */
export interface PendingTimeChange {
  originalDate: Date;
  newDate: Date;
}
