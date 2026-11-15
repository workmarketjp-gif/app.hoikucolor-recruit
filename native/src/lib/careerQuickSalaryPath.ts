/**
 * The three quick-discovery paths are separate from the detailed salary/holiday
 * simulator. The salary path can use either the candidate's current monthly
 * salary or the desired minimum salary, even if the detailed simulator's
 * selected scenario requires a different input.
 *
 * `quickSalaryLine` must be the value returned by the existing canonical
 * `scenarioSalaryLine('keep-income', own, null, desired)` calculation.
 * This only controls the prompt; the owner-pinned API still owns job results.
 */
/** Match the Web CareerPaths default without consulting the detailed simulator. */
export function initialCareerQuickPath(quickSalaryLine: number | null): 'salary' | 'holidays' {
  return quickSalaryLine === null ? 'holidays' : 'salary';
}

export function careerQuickSalaryNeedsInput(
  path: 'salary' | 'holidays' | 'values',
  quickSalaryLine: number | null,
): boolean {
  return path === 'salary' && quickSalaryLine === null;
}
