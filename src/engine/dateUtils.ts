function parseYearMonth(value: string): [number, number] {
  const [year, month] = value.split('-').map(Number) as [number, number];
  return [year, month];
}

function toAbsMonth(yearMonth: string): number {
  const [year, month] = parseYearMonth(yearMonth);
  return year * 12 + (month - 1);
}

export function deriveRetirementAge(dateOfBirth: string, retirementDate: string): number {
  return Math.floor((toAbsMonth(retirementDate) - toAbsMonth(dateOfBirth)) / 12);
}

export function retirementDateForAge(dateOfBirth: string, retirementAge: number): string {
  const [dobYear, dobMonth] = parseYearMonth(dateOfBirth);
  return `${dobYear + retirementAge}-${String(dobMonth).padStart(2, '0')}`;
}
