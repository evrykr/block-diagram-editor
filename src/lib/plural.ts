export function plural(
  count: number,
  forms: [string, string, string],
): string {
  const absolute = Math.abs(count) % 100;
  const last = absolute % 10;
  if (absolute > 10 && absolute < 20) return forms[2];
  if (last > 1 && last < 5) return forms[1];
  if (last === 1) return forms[0];
  return forms[2];
}

export function countLabel(
  count: number,
  forms: [string, string, string],
): string {
  return `${count} ${plural(count, forms)}`;
}
