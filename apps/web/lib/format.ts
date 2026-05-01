// Display helpers for money, dates, and progress. Pure — usable from
// both Server and Client Components without pulling in `server-only`.

export function formatPence(pence: number, currency: 'gbp' = 'gbp'): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: currency.toUpperCase(),
    maximumFractionDigits: 0,
  }).format(pence / 100);
}

/** Whole-number days from `now` until `deadline`. Negative if past. */
export function daysUntil(deadline: Date, now: Date = new Date()): number {
  const ms = deadline.getTime() - now.getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

/** "3 days left" / "12 hours left" / "Ended" — for campaign cards. */
export function timeRemaining(deadline: Date | null, now: Date = new Date()): string {
  if (!deadline) return 'No deadline';
  const ms = deadline.getTime() - now.getTime();
  if (ms <= 0) return 'Ended';
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days >= 1) return `${days} day${days === 1 ? '' : 's'} left`;
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours >= 1) return `${hours} hour${hours === 1 ? '' : 's'} left`;
  return 'Ending soon';
}

/** Clamp progress to 0..1 (avoids visual overflow if pledges race past goal). */
export function progressFraction(raisedPence: number, goalPence: number): number {
  if (goalPence <= 0) return 0;
  return Math.min(1, Math.max(0, raisedPence / goalPence));
}
