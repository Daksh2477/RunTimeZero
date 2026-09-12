export const statusInfo = (verdict: string | null | undefined) => {
  switch (verdict) {
    case 'ok': return { tone: 'ok', label: 'Within expected range', detail: 'The reported amount is within the range suggested by the evidence.' };
    case 'watch': return { tone: 'watch', label: 'Needs a closer look', detail: 'The reported amount and the evidence do not agree. Review the records.' };
    case 'flagged': return { tone: 'flagged', label: 'Check did not pass', detail: 'This check cannot support a carbon amount. Review the report before proceeding.' };
    case 'insufficient_evidence': return { tone: 'none', label: 'More evidence needed', detail: 'There are not enough usable records to check this amount yet.' };
    default: return { tone: 'none', label: 'Not checked yet', detail: 'A carbon check has not been recorded for this pond.' };
  }
};

export function mass(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return 'Not available';
  return `${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 }).format(value)} kg`;
}
export const money = (value: number | null) => value === null ? 'Not available'
  : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
export function dateLabel(value: string | null | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return 'No date available';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value));
}
export function readingTime(value: string | null | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return 'No readings received';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date(value)) + ' IST';
}
export const channelLabel = (channel: string) => ({ sentinel2: 'Satellite image', drone: 'Aerial image', weighbridge: 'Weighed harvest', field_sample: 'Field measurement' }[channel] ?? 'Recorded observation');
