import { describe, expect, it } from 'vitest';
import { normalizeHttpUrl } from './url';

describe('normalizeHttpUrl', () => {
  it('returns https URL as-is', () => {
    expect(normalizeHttpUrl('https://example.com')).toBe('https://example.com');
  });

  it('returns http URL as-is', () => {
    expect(normalizeHttpUrl('http://example.com')).toBe('http://example.com');
  });

  it('adds https scheme when missing', () => {
    expect(normalizeHttpUrl('example.com')).toBe('https://example.com');
  });

  it('handles protocol-relative URLs', () => {
    expect(normalizeHttpUrl('//example.com/path')).toBe('https://example.com/path');
  });

  it('rejects javascript: URLs', () => {
    expect(normalizeHttpUrl('javascript:alert(1)')).toBeNull();
  });

  it('rejects data: URLs', () => {
    expect(normalizeHttpUrl('data:text/html,hello')).toBeNull();
  });

  it('rejects about: URLs', () => {
    expect(normalizeHttpUrl('about:blank')).toBeNull();
  });

  it('rejects chrome:// URLs', () => {
    expect(normalizeHttpUrl('chrome://settings')).toBeNull();
  });

  it('rejects relative paths', () => {
    expect(normalizeHttpUrl('/foo')).toBeNull();
  });
});
