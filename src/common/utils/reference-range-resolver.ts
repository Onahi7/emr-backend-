import { GenderEnum } from '../../database/schemas/patient.schema';
import { ReferenceRangeItem } from '../../database/schemas/test-catalog.schema';

interface ResolveReferenceRangeOptions {
  age?: number;
  gender?: GenderEnum | 'M' | 'F' | 'O' | 'all';
  pregnancy?: boolean;
  condition?: string;
  simpleReferenceRange?: string;
  referenceRanges?: ReferenceRangeItem[];
  explicitReferenceRange?: string;
}

function normalizeGender(gender?: GenderEnum | 'M' | 'F' | 'O' | 'all'): 'M' | 'F' | 'all' {
  const normalizedGender = String(gender || '').toUpperCase();
  if (normalizedGender === GenderEnum.MALE) return 'M';
  if (normalizedGender === GenderEnum.FEMALE) return 'F';
  return 'all';
}

function ageMatches(range: ReferenceRangeItem, age?: number): boolean {
  if (age === undefined || age === null || Number.isNaN(age)) return true;
  const minMatch = range.ageMin === undefined || age >= range.ageMin;
  const maxMatch = range.ageMax === undefined || age <= range.ageMax;
  return minMatch && maxMatch;
}

function genderMatches(range: ReferenceRangeItem, gender: 'M' | 'F' | 'all'): boolean {
  if (!range.gender || range.gender === 'all') return true;
  if (gender === 'all') return false;
  return range.gender === gender;
}

function rankRangeSpecificity(
  range: ReferenceRangeItem,
  age: number | undefined,
  gender: 'M' | 'F' | 'all',
): number {
  const rangeGender = range.gender || 'all';
  const genderScore =
    rangeGender !== 'all' && gender !== 'all' && rangeGender === gender ? 20 : rangeGender === 'all' ? 10 : 0;

  const hasMin = range.ageMin !== undefined;
  const hasMax = range.ageMax !== undefined;
  const boundsScore = hasMin && hasMax ? 6 : hasMin || hasMax ? 3 : 0;

  let spanScore = 0;
  if (age !== undefined && hasMin && hasMax && range.ageMax! >= range.ageMin!) {
    const span = range.ageMax! - range.ageMin!;
    spanScore = Math.max(0, 5 - span / 10);
  }

  const minAgeScore = hasMin ? range.ageMin! / 1000 : 0;

  return genderScore + boundsScore + spanScore + minAgeScore;
}

function pickMostSpecificRange(
  candidates: ReferenceRangeItem[],
  age: number | undefined,
  gender: 'M' | 'F' | 'all',
): ReferenceRangeItem | undefined {
  if (!candidates.length) return undefined;

  return candidates
    .slice()
    .sort((a, b) => rankRangeSpecificity(b, age, gender) - rankRangeSpecificity(a, age, gender))[0];
}

function pickBestMatchingRange(
  ranges: ReferenceRangeItem[],
  age: number | undefined,
  gender: 'M' | 'F' | 'all',
  pregnancy?: boolean,
  condition?: string,
): ReferenceRangeItem | undefined {
  if (!ranges.length) return undefined;

  if (pregnancy && gender === 'F') {
    const pregnancyMatch = ranges.find((range) => range.pregnancy && ageMatches(range, age));
    if (pregnancyMatch) return pregnancyMatch;
  }

  if (condition) {
    const normalizedCondition = condition.trim().toLowerCase();
    const conditionCandidates = ranges.filter(
      (range) =>
        !!range.condition &&
        range.condition.trim().toLowerCase() === normalizedCondition &&
        ageMatches(range, age) &&
        genderMatches(range, gender),
    );
    const conditionMatch = pickMostSpecificRange(conditionCandidates, age, gender);
    if (conditionMatch) return conditionMatch;
  }

  const demographicCandidates = ranges.filter(
    (range) => !range.pregnancy && ageMatches(range, age) && genderMatches(range, gender),
  );
  const demographicMatch = pickMostSpecificRange(demographicCandidates, age, gender);
  if (demographicMatch) return demographicMatch;

  const allGenderCandidates = ranges.filter(
    (range) => !range.pregnancy && ageMatches(range, age) && (!range.gender || range.gender === 'all'),
  );
  const allGenderMatch = pickMostSpecificRange(allGenderCandidates, age, gender);
  if (allGenderMatch) return allGenderMatch;

  return ranges.find((range) => !range.pregnancy) || ranges[0];
}

export function resolveReferenceRange(options: ResolveReferenceRangeOptions): string | undefined {
  if (options.explicitReferenceRange) {
    return options.explicitReferenceRange;
  }

  const ranges = options.referenceRanges || [];
  const normalizedGender = normalizeGender(options.gender);

  if (ranges.length > 0) {
    const match = pickBestMatchingRange(
      ranges,
      options.age,
      normalizedGender,
      options.pregnancy,
      options.condition,
    );

    if (match?.range) {
      return match.range;
    }
  }

  return options.simpleReferenceRange;
}
