/**
 * Web salary-check privacy parity: a saved or typed personal salary is private
 * until the candidate explicitly chooses 月給 for this view. Web reference:
 * src/views/CareerCompanion.tsx (SalaryCheck), main fa779e73.
 *
 * This is presentation-only. The salary path may still use a saved value to
 * search for matching jobs, exactly like Web CareerPaths; it never sends the
 * private value to a public metrics endpoint.
 */
export type SalarySelection = 'monthly' | 'hourly' | 'none' | null;

export function disclosedCareerSalary(
  selection: SalarySelection,
  monthlyYen: number | null,
): number | null {
  if (selection !== 'monthly' || monthlyYen === null || !Number.isFinite(monthlyYen) || monthlyYen < 0) return null;
  return monthlyYen;
}
