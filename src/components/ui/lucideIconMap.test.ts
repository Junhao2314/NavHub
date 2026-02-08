import { describe, expect, it } from 'vitest';

import { isLucideIconName, LUCIDE_ICON_NAMES, resolveLucideIconName } from './lucideIconMap';

describe('lucide icon map', () => {
  it('includes the default icons used by the app', () => {
    const required = [
      'Star',
      'Code',
      'Palette',
      'BookOpen',
      'Gamepad2',
      'Bot',
      'Folder',
      'Lock',
      'Pin',
      'Globe',
      'Video',
      'Link',
    ] as const;

    for (const iconName of required) {
      expect(isLucideIconName(iconName)).toBe(true);
    }
  });

  it('loads the full lucide catalog through dynamic imports', () => {
    expect(LUCIDE_ICON_NAMES.length).toBeGreaterThan(1000);
  });

  it('resolves icon names from kebab-case and case-insensitive input', () => {
    expect(resolveLucideIconName('cloud-rain')).toBe('CloudRain');
    expect(resolveLucideIconName('cloudrain')).toBe('CloudRain');
    expect(resolveLucideIconName('does-not-exist')).toBeNull();
  });
});
