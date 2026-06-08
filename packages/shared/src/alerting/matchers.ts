import type { LabelMatcher } from '../schemas/alerting';

export const matchLabels = (matchers: LabelMatcher[], labels: Record<string, string>): boolean => matchers.every(m => matchSingle(m, labels));

const matchSingle = (matcher: LabelMatcher, labels: Record<string, string>): boolean => {
  const value = labels[matcher.name] ?? '';

  switch (matcher.operator) {
    case '=':
      return value === matcher.value;
    case '!=':
      return value !== matcher.value;
    case '=~':
      return safeRegex(matcher.value).test(value);
    case '!~':
      return !safeRegex(matcher.value).test(value);
  }
};

const safeRegex = (pattern: string): RegExp => {
  try {
    return new RegExp(`^(?:${pattern})$`);
  } catch {
    return /(?!)/;
  }
};
