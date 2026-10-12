import { normalized } from './discovery-quality';
/** Nationwide is deliberately unrestricted; Vietnam is an explicit country filter. */
export function canonicalGeography(value: string): string {
  const label = normalized(value);
  if (['toan quoc', 'nationwide'].includes(label)) return 'Nationwide';
  if (['any location', 'all locations', 'global'].includes(label)) return 'Any location';
  if (['viet nam', 'vietnam'].includes(label)) return 'Vietnam';
  if (['hanoi', 'ha noi'].includes(label)) return 'Hanoi';
  if (['ho chi minh city', 'ho chi minh', 'tp ho chi minh', 'tp hcm', 'hcm', 'hcmc', 'sai gon', 'saigon'].includes(label)) return 'Ho Chi Minh City';
  if (['da nang', 'danang'].includes(label)) return 'Da Nang';
  return value.trim();
}
export function unrestrictedGeography(value: string) {
  return ['Nationwide', 'Any location'].includes(canonicalGeography(value));
}
export function canonicalScopes(value: string | string[]) {
  return Array.isArray(value) ? [...new Set(value.map(canonicalGeography))].sort() : canonicalGeography(value);
}
