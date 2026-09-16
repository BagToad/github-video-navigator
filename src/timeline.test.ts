import { describe, expect, it } from 'vitest';
import {
  activeGroup,
  activeIndex,
  formatTime,
  timestampLabel,
} from './timeline';

describe('timeline synchronization', () => {
  const items = [{ at: 2 }, { at: 10 }, { at: 10 }, { at: 21.5 }];
  it.each([
    [0, -1],
    [2, 0],
    [9.999, 0],
    [10, 2],
    [21.499, 2],
    [21.5, 3],
    [100, 3],
  ])('finds the current entry at %s seconds', (time, expected) => {
    expect(activeIndex(items, time)).toBe(expected);
  });
  it('groups simultaneous notes and works after backward seeks', () => {
    expect(activeGroup(items, 21.5)).toEqual({ start: 3, end: 3 });
    expect(activeGroup(items, 10)).toEqual({ start: 1, end: 2 });
    expect(activeGroup(items, 1)).toEqual({ start: -1, end: -1 });
  });
  it('handles an empty timeline', () => {
    expect(activeIndex([], 10)).toBe(-1);
    expect(activeGroup([], 10)).toEqual({ start: -1, end: -1 });
  });
});

describe('timestamp formatting', () => {
  it.each([
    [0, '0:00'],
    [9, '0:09'],
    [61, '1:01'],
    [3601, '1:00:01'],
    [NaN, '0:00'],
  ])('formats %s', (value, expected) => {
    expect(formatTime(value)).toBe(expected);
  });
  it('preserves fractional timestamp labels', () => {
    expect(timestampLabel(12.125)).toBe('0:12.125');
    expect(timestampLabel(0.01)).toBe('0:00.01');
    expect(timestampLabel(59.9999)).toBe('1:00');
  });
});
