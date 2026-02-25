import { DateTime } from 'luxon';

export type TargetLocalParseResult =
  | { ok: true; targetLocal: string; targetDate: string; local: DateTime }
  | { ok: false; error: 'invalid' | 'nonexistent' };

export const toTargetLocalString = (dt: DateTime): string => dt.toFormat("yyyy-MM-dd'T'HH:mm:ss");

/**
 * Parse local wall time in a given IANA zone, with DST-gap detection.
 *
 * Notes:
 * - Luxon shifts non-existent times (DST spring forward) to the next valid time.
 * - We treat that shift as an error by comparing the normalized wall time back to the input.
 * - Ambiguous times (DST fall back) are accepted; Luxon will choose one offset.
 */
export const parseTargetLocalExact = (
  targetLocal: string,
  timeZone: string,
): TargetLocalParseResult => {
  const input = targetLocal.trim();
  const local = DateTime.fromISO(input, { zone: timeZone });
  if (!local.isValid) return { ok: false, error: 'invalid' };

  const normalized = toTargetLocalString(local.set({ millisecond: 0 }));
  if (normalized !== input) return { ok: false, error: 'nonexistent' };

  const targetDate = local.toUTC().toISO();
  if (!targetDate) return { ok: false, error: 'invalid' };

  return { ok: true, targetLocal: normalized, targetDate, local: local.set({ millisecond: 0 }) };
};
