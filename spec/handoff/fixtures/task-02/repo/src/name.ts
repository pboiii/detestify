export function normalizeName(value: string): string {
  return value.trim().split(/\s+/).filter(Boolean).map((part) => part.toLowerCase()).join(' ');
}
