export const STABLE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isStableId(value: string): boolean {
  return STABLE_ID.test(value) && value.length <= 80;
}

export function assertStableId(value: string, label = 'identifier'): void {
  if (!isStableId(value)) throw new Error(`${label} must be a lowercase stable slug, not a path: ${value}`);
}

export function assertUniqueIds(ids: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const id of ids) {
    assertStableId(id, label);
    if (seen.has(id)) throw new Error(`Duplicate ${label}: ${id}.`);
    seen.add(id);
  }
}
