import { afterEach, describe, expect, it, vi } from 'vitest';
import { PRIVACY_PASSWORD_KEY, SYNC_PASSWORD_KEY } from './constants';
import { setPrivacyPassword, setSyncPassword } from './secrets';

describe('secrets password storage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('prefers sessionStorage and clears localStorage on success', () => {
    localStorage.setItem(SYNC_PASSWORD_KEY, 'legacy');

    setSyncPassword('pw');

    expect(sessionStorage.getItem(SYNC_PASSWORD_KEY)).toBe('pw');
    expect(localStorage.getItem(SYNC_PASSWORD_KEY)).toBeNull();
  });

  it('falls back to localStorage when sessionStorage setItem throws', () => {
    const realSessionStorage = sessionStorage;
    vi.stubGlobal('sessionStorage', {
      setItem: () => {
        throw new Error('blocked');
      },
      getItem: () => null,
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      get length() {
        return 0;
      },
    } as unknown as Storage);

    localStorage.setItem(SYNC_PASSWORD_KEY, 'legacy');

    setSyncPassword('pw');

    expect(realSessionStorage.getItem(SYNC_PASSWORD_KEY)).toBeNull();
    expect(localStorage.getItem(SYNC_PASSWORD_KEY)).toBe('pw');
  });

  it('clears both storages when password is empty', () => {
    localStorage.setItem(PRIVACY_PASSWORD_KEY, 'pw');
    sessionStorage.setItem(PRIVACY_PASSWORD_KEY, 'pw');

    setPrivacyPassword('');

    expect(sessionStorage.getItem(PRIVACY_PASSWORD_KEY)).toBeNull();
    expect(localStorage.getItem(PRIVACY_PASSWORD_KEY)).toBeNull();
  });

  it('falls back for privacy password too', () => {
    const realSessionStorage = sessionStorage;
    vi.stubGlobal('sessionStorage', {
      setItem: () => {
        throw new Error('blocked');
      },
      getItem: () => null,
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      get length() {
        return 0;
      },
    } as unknown as Storage);

    setPrivacyPassword('pw2');

    expect(realSessionStorage.getItem(PRIVACY_PASSWORD_KEY)).toBeNull();
    expect(localStorage.getItem(PRIVACY_PASSWORD_KEY)).toBe('pw2');
  });
});
