import { Alert, AlertDescription } from '@graflare/ui/components/alert';
import { Button } from '@graflare/ui/components/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@graflare/ui/components/card';
import { Input } from '@graflare/ui/components/input';
import { Label } from '@graflare/ui/components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@graflare/ui/components/select';
import { useNavigate } from '@tanstack/react-router';
import { useCallback, useState } from 'react';

import { createDatasource, testConnection, updateDatasource } from '../-api';

type DatasourceType = 'prometheus';
type AuthType = 'none' | 'basic' | 'bearer';

interface DatasourceFormData {
  id?: string;
  name: string;
  type: DatasourceType;
  url: string;
  authType: AuthType;
  queryTimeoutMs: number;
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

const isDatasourceType = (value: string): value is DatasourceType => value === 'prometheus';

export const DatasourceForm = ({ mode, initialData }: Props) => {
  const navigate = useNavigate();
  const [form, setForm] = useState<DatasourceFormData>(
    initialData ?? {
      name: '',
      type: 'prometheus',
      url: '',
      authType: 'none',
      queryTimeoutMs: 30000,
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
              url: form.url,
              authType: form.authType,
              queryTimeoutMs: form.queryTimeoutMs,
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
                url: form.url,
                authType: form.authType,
                queryTimeoutMs: form.queryTimeoutMs,
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
    if (form.id === undefined) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testConnection({ data: form.id });
      setTestResult(result);
    } catch (error) {
      setTestResult({
        success: false,
        error: error instanceof Error ? error.message : 'Test failed',
      });
    } finally {
      setTesting(false);
    }
  }, [form.id]);

  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setForm(prev => ({ ...prev, name: value }));
  }, []);

  const handleTypeChange = useCallback((value: string | null) => {
    if (value !== null && isDatasourceType(value)) {
      setForm(prev => ({ ...prev, type: value }));
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
          <CardTitle>{mode === 'create' ? 'Add Data Source' : 'Edit Data Source'}</CardTitle>
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
            <Select value={form.type} onValueChange={handleTypeChange}>
              <SelectTrigger id='type'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='prometheus'>Prometheus</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className='space-y-2'>
            <Label htmlFor='url'>URL</Label>
            <Input id='url' type='url' value={form.url} onChange={handleUrlChange} placeholder='https://prometheus.example.com' required />
          </div>

          <div className='space-y-2'>
            <Label htmlFor='authType'>Authentication</Label>
            <Select value={form.authType} onValueChange={handleAuthTypeChange}>
              <SelectTrigger id='authType'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='none'>None</SelectItem>
                <SelectItem value='basic'>Basic Auth</SelectItem>
                <SelectItem value='bearer'>Bearer Token</SelectItem>
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

          {mode === 'edit' && (
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
          )}
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
