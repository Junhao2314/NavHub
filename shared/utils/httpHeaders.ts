export function mergeVaryHeaderValue(prev: string | null, next: string): string {
  const prevParts = (prev ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const nextParts = next
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const merged = [...prevParts];
  for (const part of nextParts) {
    if (!merged.includes(part)) merged.push(part);
  }
  return merged.join(', ');
}
