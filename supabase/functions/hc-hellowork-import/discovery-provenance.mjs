// Private, bounded provenance for public Hello Work discovery search results.
// These search parameters are evidence of how a URL was found, NOT proof of an
// individual job's actual workplace. Never derive prefecture/city from them.
const ALLOWED_TERMS = new Set(['保育士', '保育教諭', '幼稚園教諭', '保育補助']);
const VALID_PREFECTURES = /^(0[1-9]|[1-3][0-9]|4[0-7])$/;

export function createSearchObservation(prefecture, queryTerm, page, at) {
  const prefectureCode = String(prefecture).padStart(2, '0');
  if (!VALID_PREFECTURES.test(prefectureCode) ||
      !ALLOWED_TERMS.has(queryTerm) ||
      !Number.isInteger(page) || page < 1 ||
      typeof at !== 'string' || !Number.isFinite(Date.parse(at))) {
    throw new Error('INVALID_HELLOWORK_SEARCH_OBSERVATION');
  }
  return Object.freeze({
    prefecture_code: prefectureCode,
    search_term: queryTerm,
    search_page: page,
    observed_at: at,
  });
}

function priorProvenance(previousPayload) {
  if (!previousPayload || typeof previousPayload !== 'object') return null;
  const prior = previousPayload.discovery_search;
  return prior && typeof prior === 'object' && prior.version === 1 ? prior : null;
}

export function mergeSourcePayloadProvenance(freshPayload, previousPayload, observation = null) {
  const prior = priorProvenance(previousPayload);
  if (!prior && !observation) return freshPayload;
  const codes = new Set((Array.isArray(prior?.observed_prefecture_codes) ?
    prior.observed_prefecture_codes : []).filter((v) =>
    typeof v === 'string' && VALID_PREFECTURES.test(v)));
  const terms = new Set((Array.isArray(prior?.observed_search_terms) ?
    prior.observed_search_terms : []).filter((v) => ALLOWED_TERMS.has(v)));
  if (observation) {
    codes.add(observation.prefecture_code);
    terms.add(observation.search_term);
  }
  return {
    ...freshPayload,
    discovery_search: {
      version: 1,
      // These sets are naturally bounded to 47 prefectures and 4 approved terms.
      observed_prefecture_codes: [...codes].sort(),
      observed_search_terms: [...terms].sort(),
      first_observed_at: prior?.first_observed_at || observation?.observed_at || null,
      last_observed_at: observation?.observed_at || prior?.last_observed_at || null,
      last_search: observation || prior?.last_search || null,
      // Critically, this is NOT a verified workplace address or prefecture.
      evidence_kind: 'search_filter_only',
    },
  };
}
