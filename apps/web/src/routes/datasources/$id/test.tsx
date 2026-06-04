import { Alert, AlertDescription } from '@graflare/ui/components/alert';
import { Button } from '@graflare/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@graflare/ui/components/card';
import { Input } from '@graflare/ui/components/input';
import { Label } from '@graflare/ui/components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@graflare/ui/components/select';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useState } from 'react';

import { proxyQuery } from '../../../lib/proxy';

type QueryType = 'instant' | 'range';

const monoFontStyle = { fontFamily: 'Geist Mono, monospace' } as const;

const isQueryType = (value: string): value is QueryType => value === 'instant' || value === 'range';

const QUERY_TYPE_OPTIONS = [
  { value: 'instant', label: 'Instant' },
  { value: 'range', label: 'Range' },
] as const;

const QueryTestPage = () => {
  const { id } = Route.useParams();
  const [query, setQuery] = useState('up');
  const [queryType, setQueryType] = useState<QueryType>('instant');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [step, setStep] = useState('15s');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [nowSeconds] = useState(() => Math.floor(Date.now() / 1000));

  const handleSubmit = useCallback(
    async (e: React.SyntheticEvent) => {
      e.preventDefault();
      setLoading(true);
      setError(null);
      setResult(null);

      try {
        const endpoint = queryType === 'instant' ? '/api/v1/query' : '/api/v1/query_range';

        const params: Record<string, string> = { query };
        if (queryType === 'range') {
          params.start = start || String(Math.floor(Date.now() / 1000) - 3600);
          params.end = end || String(Math.floor(Date.now() / 1000));
          params.step = step;
        }

        const res = await proxyQuery({
          data: { datasourceId: id, endpoint, params },
        });
        setResult(res);
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Query failed');
      } finally {
        setLoading(false);
      }
    },
    [queryType, query, start, end, step, id],
  );

  const handleSubmitEvent = useCallback(
    (e: React.SyntheticEvent) => {
      void handleSubmit(e);
    },
    [handleSubmit],
  );

  const handleQueryChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setQuery(e.target.value);
  }, []);

  const handleQueryTypeChange = useCallback((value: string | null) => {
    if (value !== null && isQueryType(value)) {
      setQueryType(value);
    }
  }, []);

  const handleStartChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setStart(e.target.value);
  }, []);

  const handleEndChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setEnd(e.target.value);
  }, []);

  const handleStepChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setStep(e.target.value);
  }, []);

  return (
    <div className='space-y-4'>
      <h1 className='text-xl font-semibold'>Query Test</h1>

      <form onSubmit={handleSubmitEvent}>
        <Card>
          <CardHeader>
            <CardTitle className='text-sm'>PromQL Query</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='space-y-2'>
              <Label htmlFor='query'>Query</Label>
              <textarea
                id='query'
                aria-label='Query'
                value={query}
                onChange={handleQueryChange}
                className='border-input bg-background ring-offset-background focus-visible:ring-ring flex min-h-[80px] w-full rounded-lg border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none'
                style={monoFontStyle}
                placeholder='up'
              />
            </div>

            <div className='space-y-2'>
              <Label htmlFor='queryType'>Query Type</Label>
              <Select value={queryType} onValueChange={handleQueryTypeChange} items={QUERY_TYPE_OPTIONS}>
                <SelectTrigger id='queryType'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {QUERY_TYPE_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {queryType === 'range' && (
              <div className='grid grid-cols-3 gap-3'>
                <div className='space-y-2'>
                  <Label htmlFor='start'>Start (unix)</Label>
                  <Input id='start' value={start} onChange={handleStartChange} placeholder={String(nowSeconds - 3600)} />
                </div>
                <div className='space-y-2'>
                  <Label htmlFor='end'>End (unix)</Label>
                  <Input id='end' value={end} onChange={handleEndChange} placeholder={String(nowSeconds)} />
                </div>
                <div className='space-y-2'>
                  <Label htmlFor='step'>Step</Label>
                  <Input id='step' value={step} onChange={handleStepChange} placeholder='15s' />
                </div>
              </div>
            )}

            <Button type='submit' disabled={loading || !query.trim()}>
              {loading ? 'Running...' : 'Run Query'}
            </Button>
          </CardContent>
        </Card>
      </form>

      {error !== null && (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {result !== null && (
        <Card>
          <CardHeader>
            <CardTitle className='text-sm'>Result</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className='bg-muted overflow-auto rounded-lg p-4 text-xs' style={monoFontStyle}>
              {JSON.stringify(result, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export const Route = createFileRoute('/datasources/$id/test')({
  component: QueryTestPage,
});
