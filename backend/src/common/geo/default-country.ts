/**
 * ISO 3166-1 alpha-2 code of the country assumed when a municipality code arrives without its country
 * (DEFAULT_COUNTRY_ISO). Municipality codes are unique per region, not worldwide, so every lookup is
 * made inside a country: the one of the legal entity when there is one, this one otherwise.
 */
export const DEFAULT_COUNTRY_ISO = Symbol('DEFAULT_COUNTRY_ISO');
