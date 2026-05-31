import type { Variable } from '@graflare/shared/schemas/variable';

import { interpolateVariables } from '@graflare/shared/variables/interpolate';
import { useCallback, useState } from 'react';

export const useVariables = (variables: Variable[]) => {
  const [values, setValues] = useState<Map<string, string>>(() => {
    const initial = new Map<string, string>();
    for (const v of variables) {
      if (v.current) initial.set(v.name, v.current);
    }
    return initial;
  });

  const handleChange = useCallback((name: string, value: string) => {
    setValues(prev => {
      const next = new Map(prev);
      next.set(name, value);
      return next;
    });
  }, []);

  const interpolate = useCallback((expr: string) =>
    interpolateVariables(expr, values),
  [values]);

  return { values, handleChange, interpolate };
};
