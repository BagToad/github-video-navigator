export function activeIndex(
  items: readonly { at: number }[],
  time: number,
): number {
  let left = 0;
  let right = items.length - 1;
  let current = -1;
  while (left <= right) {
    const middle = Math.floor((left + right) / 2);
    const item = items[middle];
    if (item && item.at <= time) {
      current = middle;
      left = middle + 1;
    } else {
      right = middle - 1;
    }
  }
  return current;
}

export function activeGroup(
  items: readonly { at: number }[],
  time: number,
): { start: number; end: number } {
  const end = activeIndex(items, time);
  let start = end;
  while (start > 0 && items[start - 1]?.at === items[end]?.at) start--;
  return { start, end };
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = String(total % 60).padStart(2, '0');
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}`
    : `${minutes}:${rest}`;
}

export function timestampLabel(seconds: number): string {
  const rounded = Math.round(seconds * 1000) / 1000;
  const fraction = Number((rounded % 1).toFixed(3));
  return `${formatTime(rounded)}${fraction ? String(fraction).slice(1) : ''}`;
}
