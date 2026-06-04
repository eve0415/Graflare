import { Input } from '@graflare/ui/components/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@graflare/ui/components/select';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangleIcon } from 'lucide-react';
import { useCallback, useMemo } from 'react';

import { metricsQueryOptions } from '../../-root/introspection-queries';

interface PromqlMetricSelectorProps {
  datasourceId: string;
  value: string;
  onChange: (value: string) => void;
}

export const PromqlMetricSelector = ({ datasourceId, value, onChange }: PromqlMetricSelectorProps) => {
  const metricsQuery = useQuery(metricsQueryOptions(datasourceId));
  const metrics = metricsQuery.data?.metrics ?? [];
  const metricItems = useMemo(() => metrics.map(m => ({ value: m, label: m })), [metrics]);
  const hasError = metricsQuery.data?.error !== undefined;

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    },
    [onChange],
  );

  const handleSelectChange = useCallback(
    (v: string | null) => {
      if (v !== null) {
        onChange(v);
      }
    },
    [onChange],
  );

  if (hasError) {
    return (
      <div className='flex items-center gap-1.5'>
        <Input value={value} onChange={handleInputChange} placeholder='Metric name' className='h-7 w-64' aria-label='Metric name' />
        <span className='text-muted-foreground flex items-center gap-1 text-xs'>
          <AlertTriangleIcon className='size-3' />
          Could not load metrics
        </span>
      </div>
    );
  }

  return (
    <Select value={value} onValueChange={handleSelectChange} items={metricItems}>
      <SelectTrigger aria-label='Metric' className='w-64'>
        <SelectValue placeholder='Select metric' />
      </SelectTrigger>
      <SelectContent>
        {metricItems.map(o => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
