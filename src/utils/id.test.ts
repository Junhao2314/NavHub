import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateId } from './id';

describe('generateId', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses crypto.randomUUID when available', () => {
    vi.stubGlobal('crypto', {
      randomUUID: () => 'uuid-1234',
    });

    expect(generateId()).toBe('uuid-1234');
  });

  it('falls back to crypto.getRandomValues when randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (array: Uint8Array) => {
        array.fill(0);
      },
    });

    expect(generateId()).toBe('00000000-0000-4000-8000-000000000000');
  });

  it('falls back to timestamp+random when crypto is unavailable', () => {
    vi.stubGlobal('crypto', undefined);

    const id = generateId();
    expect(id).toMatch(/^[0-9a-z]+_[0-9a-z]+$/);
  });
});
