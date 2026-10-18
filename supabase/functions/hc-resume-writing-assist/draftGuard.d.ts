export type AllowedYears = { calendar: Set<number>; durations: Set<number>; textual: Set<number> };

export type DraftCheck = { ok: boolean; qualifications: string[]; organizations: string[]; years: string[] };

export function normalizeText(value: unknown): string;
export function buildCorpus(...values: unknown[]): string;
export function allowedYears(input: { resume: unknown; profile: unknown; now?: Date }): AllowedYears;
export function unsupportedYears(draft: string, years: AllowedYears): string[];
export function unsupportedQualifications(draft: string, corpus: string): string[];
export function unsupportedOrganizations(draft: string, corpus: string): string[];
export function checkDraft(draft: string, input: { corpus: string; years: AllowedYears }): DraftCheck;
