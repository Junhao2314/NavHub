import { describe, expect, it } from 'vitest';

import { isLucideIconName } from './lucideIconMap';

describe('lucide icon subset', () => {
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
});
