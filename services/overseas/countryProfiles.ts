import type { Country } from './types';
export const countryProfiles: Record<Country, { label: string; queries: string[]; legal: RegExp; country: RegExp }> = {
  US: { label: 'USA', queries: ['Japanese matcha wholesaler USA', 'matcha importer USA', 'matcha foodservice USA'], legal: /about|contact|company|legal/i, country: /\b(?:USA|U\.S\.A\.?|United States)\b/i },
  FR: { label: 'France', queries: ['importateur matcha japonais France', 'grossiste matcha France', 'matcha professionnel France'], legal: /mentions[-\s_]?l[eé]gales|contact|soci[eé]t[eé]/i, country: /\bFrance\b/i },
  DE: { label: 'Germany', queries: ['Japan Matcha Großhandel Deutschland', 'Matcha Importeur Deutschland', 'Matcha Gastronomie Deutschland'], legal: /impressum|imprint|kontakt/i, country: /\b(?:Germany|Deutschland)\b/i },
};
export function isCountry(value: unknown): value is Country { return value === 'US' || value === 'FR' || value === 'DE'; }
