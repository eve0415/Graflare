import type { GraphQLCollector } from '../collectors/types';

import { SCOPE_CONFIG } from './scope';

export const buildBatchedQuery = (scope: 'account' | 'zone', collectors: readonly GraphQLCollector[]): string => {
  if (collectors.length === 0) return '';

  const needsTime = collectors.some(c => c.timeVarType === 'Time');
  const needsDate = collectors.some(c => c.timeVarType === 'Date');

  const { idVar: scopeIdVar, filterKey, node: scopeNode } = SCOPE_CONFIG[scope];
  const scopeIdType = 'String!';
  const queryName = scope === 'account' ? 'AccountMetrics' : 'ZoneMetrics';

  const varDecls = [`${scopeIdVar}: ${scopeIdType}`];
  if (needsTime) {
    varDecls.push('$fromTime: Time!', '$toTime: Time!');
  }
  if (needsDate) {
    varDecls.push('$fromDate: Date!', '$toDate: Date!');
  }

  const fragments = collectors.map(c => c.fragment).join('\n      ');

  return `query ${queryName}(${varDecls.join(', ')}) {
  viewer {
    ${scopeNode}(filter: { ${filterKey}: ${scopeIdVar} }) {
      ${fragments}
    }
  }
}`;
};
