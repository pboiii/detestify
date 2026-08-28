export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function legacyNormalizeEmail(value: string): string {
  return normalizeEmail(value);
}
