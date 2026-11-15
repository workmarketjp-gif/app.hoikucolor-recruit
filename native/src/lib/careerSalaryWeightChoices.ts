/**
 * The approved Web /career slider allows 0..100 in 10-point steps.
 * Keep a previously saved non-step value visible and selected, instead of
 * silently changing the user's canonical settings on first render.
 *
 * Web reference: src/views/CareerView.tsx, salaryWeight range (min 0,
 * max 100, step 10), main 5d9f4491221fd8c9e9ad6286e9e1fba6596b9d59.
 */
export const WEB_CAREER_WEIGHT_STEP = 10;
export const WEB_CAREER_WEIGHT_CHOICES: readonly number[] = Object.freeze(
  Array.from({ length: 11 }, (_, index) => index * WEB_CAREER_WEIGHT_STEP),
);

export function visibleCareerWeightChoices(savedOrDraftWeight: number): readonly number[] {
  if (!Number.isFinite(savedOrDraftWeight) || savedOrDraftWeight < 0 || savedOrDraftWeight > 100 ||
      WEB_CAREER_WEIGHT_CHOICES.includes(savedOrDraftWeight)) {
    return WEB_CAREER_WEIGHT_CHOICES;
  }
  return [...WEB_CAREER_WEIGHT_CHOICES, savedOrDraftWeight].sort((a, b) => a - b);
}
