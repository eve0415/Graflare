import { Alert, AlertDescription } from '@graflare/ui/components/alert';
import { Button } from '@graflare/ui/components/button';
import { Card, CardContent, CardFooter, CardHeader } from '@graflare/ui/components/card';
import { Input } from '@graflare/ui/components/input';
import { Label } from '@graflare/ui/components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@graflare/ui/components/select';
import { useNavigate } from '@tanstack/react-router';
import { useCallback, useState } from 'react';

import { createDatasource, testConnectionInline, updateDatasource } from '../-api';

type DatasourceType = 'prometheus' | 'sql';
type DatasourceDialect = 'sqlite' | 'postgres';
type AuthType = 'none' | 'basic' | 'bearer';

interface DatasourceFormData {
  id?: string;
  name: string;
  type: DatasourceType;
  dialect?: DatasourceDialect | undefined;
  url: string;
  authType: AuthType;
  queryTimeoutMs: number;
  cacheTtl: number;
  username?: string;
  password?: string;
  token?: string;
}

interface Props {
  mode: 'create' | 'edit';
  initialData?: DatasourceFormData;
}

interface TestResult {
  success: boolean;
  latencyMs?: number;
  error?: string;
}

const isAuthType = (value: string): value is AuthType => value === 'none' || value === 'basic' || value === 'bearer';

const isDatasourceType = (value: string): value is DatasourceType => value === 'prometheus' || value === 'sql';

const TYPE_OPTIONS = [
  { value: 'prometheus', label: 'Prometheus' },
  { value: 'sql', label: 'SQL' },
] as const;

const DIALECT_OPTIONS = [
  { value: 'sqlite', label: 'SQLite / D1' },
  { value: 'postgres', label: 'PostgreSQL (coming soon)' },
] as const;

const AUTH_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'basic', label: 'Basic Auth' },
  { value: 'bearer', label: 'Bearer Token' },
] as const;

export const DatasourceForm = ({ mode, initialData }: Props) => {
  const navigate = useNavigate();
  const [form, setForm] = useState<DatasourceFormData>(
    initialData ?? {
      name: '',
      type: 'prometheus',
      url: '',
      authType: 'none',
      queryTimeoutMs: 30000,
      cacheTtl: 0,
    },
  );
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.SyntheticEvent) => {
      e.preventDefault();
      setSaving(true);
      setError(null);

      try {
        const credentials =
          form.authType === 'basic' ? { username: form.username, password: form.password } : form.authType === 'bearer' ? { token: form.token } : undefined;

        if (mode === 'create') {
          await createDatasource({
            data: {
              name: form.name,
              type: form.type,
              dialect: form.dialect,
              url: form.url,
              authType: form.authType,
              queryTimeoutMs: form.queryTimeoutMs,
              cacheTtl: form.cacheTtl,
              credentials,
            },
          });
        } else if (form.id !== undefined) {
          await updateDatasource({
            data: {
              id: form.id,
              data: {
                name: form.name,
                type: form.type,
                dialect: form.dialect,
                url: form.url,
                authType: form.authType,
                queryTimeoutMs: form.queryTimeoutMs,
                cacheTtl: form.cacheTtl,
                credentials,
              },
            },
          });
        }
        await navigate({ to: '/datasources' });
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Save failed');
      } finally {
        setSaving(false);
      }
    },
    [form, mode, navigate],
  );

  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const credentials =
        form.authType === 'basic' ? { username: form.username, password: form.password } : form.authType === 'bearer' ? { token: form.token } : undefined;
      const result = await testConnectionInline({
        data: {
          type: form.type,
          url: form.url,
          authType: form.authType,
          credentials,
          queryTimeoutMs: form.queryTimeoutMs,
        },
      });
      setTestResult(result);
    } catch (error) {
      setTestResult({
        success: false,
        error: error instanceof Error ? error.message : 'Test failed',
      });
    } finally {
      setTesting(false);
    }
  }, [form]);

  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setForm(prev => ({ ...prev, name: value }));
  }, []);

  const handleTypeChange = useCallback((value: string | null) => {
    if (value !== null && isDatasourceType(value)) {
      if (value === 'sql') {
        setForm(prev => ({ ...prev, type: value, dialect: prev.dialect ?? 'sqlite', authType: 'bearer' }));
      } else {
        setForm(prev => ({ ...prev, type: value, dialect: undefined }));
      }
    }
  }, []);

  const handleDialectChange = useCallback((value: string | null) => {
    if (value === 'sqlite' || value === 'postgres') {
      setForm(prev => ({ ...prev, dialect: value }));
    }
  }, []);

  const handleUrlChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setForm(prev => ({ ...prev, url: value }));
  }, []);

  const handleAuthTypeChange = useCallback((value: string | null) => {
    if (value !== null && isAuthType(value)) {
      setForm(prev => ({ ...prev, authType: value }));
    }
  }, []);

  const handleUsernameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setForm(prev => ({ ...prev, username: value }));
  }, []);

  const handlePasswordChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setForm(prev => ({ ...prev, password: value }));
  }, []);

  const handleTokenChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setForm(prev => ({ ...prev, token: value }));
  }, []);

  const handleTimeoutChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number.parseInt(e.target.value, 10);
    setForm(prev => ({ ...prev, queryTimeoutMs: value }));
  }, []);

  const handleCacheTtlChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const parsed = Number.parseInt(e.target.value, 10);
    const value = Number.isNaN(parsed) ? 0 : Math.max(0, parsed);
    setForm(prev => ({ ...prev, cacheTtl: value }));
  }, []);

  const handleSubmitEvent = useCallback(
    (e: React.SyntheticEvent) => {
      void handleSubmit(e);
    },
    [handleSubmit],
  );

  const handleTestClick = useCallback(() => {
    void handleTest();
  }, [handleTest]);

  const handleCancel = useCallback(() => {
    void navigate({ to: '/datasources' });
  }, [navigate]);

  return (
    <form onSubmit={handleSubmitEvent}>
      <Card>
        <CardHeader>
          {/* Real <h1> (not the CardTitle <div>) so the standalone create/edit page has exactly
              one page heading — keeps the card-title styling, fixes axe page-has-heading-one. */}
          <h1 className='text-base font-medium'>{mode === 'create' ? 'Add Data Source' : 'Edit Data Source'}</h1>
        </CardHeader>
        <CardContent className='space-y-4'>
          {error !== null && (
            <Alert variant='destructive'>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className='space-y-2'>
            <Label htmlFor='name'>Name</Label>
            <Input id='name' value={form.name} onChange={handleNameChange} placeholder='Production Prometheus' required />
          </div>

          <div className='space-y-2'>
            <Label htmlFor='type'>Type</Label>
            <Select value={form.type} onValueChange={handleTypeChange} items={TYPE_OPTIONS}>
              <SelectTrigger id='type'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {form.type === 'sql' && (
            <div className='space-y-2'>
              <Label htmlFor='dialect'>Dialect</Label>
              <Select value={form.dialect ?? 'sqlite'} onValueChange={handleDialectChange} items={DIALECT_OPTIONS}>
                <SelectTrigger id='dialect'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIALECT_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value} disabled={o.value === 'postgres'}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className='space-y-2'>
            <Label htmlFor='url'>{form.type === 'sql' ? 'SQL Endpoint URL' : 'URL'}</Label>
            <Input
              id='url'
              type='url'
              value={form.url}
              onChange={handleUrlChange}
              placeholder={form.type === 'sql' ? 'https://bridge.example.com' : 'https://prometheus.example.com'}
              required
            />
          </div>

          <div className='space-y-2'>
            <Label htmlFor='authType'>Authentication</Label>
            <Select value={form.authType} onValueChange={handleAuthTypeChange} items={AUTH_OPTIONS}>
              <SelectTrigger id='authType'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AUTH_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {form.authType === 'basic' && (
            <>
              <div className='space-y-2'>
                <Label htmlFor='username'>Username</Label>
                <Input id='username' value={form.username ?? ''} onChange={handleUsernameChange} />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='password'>Password</Label>
                <Input id='password' type='password' value={form.password ?? ''} onChange={handlePasswordChange} />
              </div>
            </>
          )}

          {form.authType === 'bearer' && (
            <div className='space-y-2'>
              <Label htmlFor='token'>Token</Label>
              <Input id='token' type='password' value={form.token ?? ''} onChange={handleTokenChange} />
            </div>
          )}

          <div className='space-y-2'>
            <Label htmlFor='timeout'>Query Timeout (ms)</Label>
            <Input id='timeout' type='number' min={1000} max={120000} step={1000} value={form.queryTimeoutMs} onChange={handleTimeoutChange} />
          </div>

          <div className='space-y-2'>
            <Label htmlFor='cacheTtl'>Cache TTL (seconds, 0 = disabled)</Label>
            <Input id='cacheTtl' type='number' min={0} max={86400} step={1} value={form.cacheTtl} onChange={handleCacheTtlChange} />
          </div>

          <div className='flex items-center gap-3'>
            <Button type='button' variant='outline' size='sm' onClick={handleTestClick} disabled={testing}>
              {testing ? 'Testing...' : 'Test Connection'}
            </Button>
            {testResult !== null && (
              <span className={`text-sm ${testResult.success ? 'text-green-600' : 'text-destructive'}`}>
                {testResult.success ? `Connected (${testResult.latencyMs}ms)` : testResult.error}
              </span>
            )}
          </div>
        </CardContent>
        <CardFooter className='flex gap-2'>
          <Button type='submit' disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
          <Button type='button' variant='outline' onClick={handleCancel}>
            Cancel
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
};
