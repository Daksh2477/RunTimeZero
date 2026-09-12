/** Expected request failures, safe to return without exposing SQL/internal errors. */
export class RequestError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

export function validatePondId(id: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new RequestError('A valid pond UUID is required.');
  }
}

export function validateWindow(start: Date, end: Date): void {
  const duration = end.getTime() - start.getTime();
  if (!Number.isFinite(duration) || duration <= 0 || duration > 120 * 86_400_000) {
    throw new RequestError('Window must be ordered, valid, and no longer than 120 days.');
  }
}
