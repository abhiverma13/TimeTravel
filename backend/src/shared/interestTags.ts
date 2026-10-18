/** The interest tags a traveller can pick; every activity carries one or more of them. */
export const INTEREST_TAGS = ['museums', 'outdoors', 'food', 'shopping', 'landmarks', 'nightlife', 'family'] as const;
export type InterestTag = (typeof INTEREST_TAGS)[number];
