import { describe, expect, it } from 'vitest';
import { parseTargetLocalExact } from './targetLocal';

describe('parseTargetLocalExact', () => {
  it('converts the same wall time to different UTC instants across time zones', () => {
    const wall = '2026-02-11T00:00:00';

    const utc = parseTargetLocalExact(wall, 'UTC');
    const shanghai = parseTargetLocalExact(wall, 'Asia/Shanghai');

    expect(utc.ok).toBe(true);
    expect(shanghai.ok).toBe(true);
    if (!utc.ok || !shanghai.ok) return;

    expect(utc.targetDate).not.toBe(shanghai.targetDate);
  });

  it('detects non-existent local times during DST spring forward', () => {
    const result = parseTargetLocalExact('2024-03-10T02:30:00', 'America/New_York');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('nonexistent');
  });
});
