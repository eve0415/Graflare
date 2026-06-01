import type { LabelMatcher } from '../schemas/alerting';

export function matchLabels(matchers: LabelMatcher[], labels: Record<string, string>): boolean {
  return matchers.every(m => matchSingle(m, labels));
}

function matchSingle(matcher: LabelMatcher, labels: Record<string, string>): boolean {
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
}

function safeRegex(pattern: string): RegExp {
  try {
    return new RegExp(`^(?:${pattern})$`);
  } catch {
    return /(?!)/;
  }
}
