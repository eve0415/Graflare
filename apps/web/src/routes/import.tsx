import { Alert } from '@graflare/ui/components/alert';
import { Badge } from '@graflare/ui/components/badge';
import { Button } from '@graflare/ui/components/button';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { FileUp, Upload } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

import { importDashboard } from '../lib/api';

type DetectedFormat = 'classic' | 'v1' | 'v2' | null;

const detectFormat = (json: Record<string, unknown>): DetectedFormat => {
  if (typeof json.apiVersion === 'string') {
    if (json.apiVersion.startsWith('dashboard.grafana.app/v2')) return 'v2';
    if (json.kind === 'Dashboard') return 'v1';
  }
  if ('panels' in json || 'title' in json) return 'classic';
  return null;
};

const formatLabels: Record<string, string> = {
  classic: 'Classic',
  v1: 'V1 Resource',
  v2: 'V2 Resource',
};

const ImportPage = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [jsonText, setJsonText] = useState('');
  const [parsed, setParsed] = useState<Record<string, unknown> | null>(null);
  const [format, setFormat] = useState<DetectedFormat>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [importError, setImportError] = useState<string | null>(null);

  const handleParse = useCallback((text: string) => {
    setJsonText(text);
    setImportError(null);
    setWarnings([]);

    if (text.trim() === '') {
      setParsed(null);
      setFormat(null);
      setParseError(null);
      return;
    }

    try {
      const json: unknown = JSON.parse(text);
      if (typeof json !== 'object' || json === null || Array.isArray(json)) {
        setParseError('JSON must be an object');
        setParsed(null);
        setFormat(null);
        return;
      }
      const record = Object.fromEntries(Object.entries(json));
      setParsed(record);
      setFormat(detectFormat(record));
      setParseError(null);
    } catch {
      setParseError('Invalid JSON');
      setParsed(null);
      setFormat(null);
    }
  }, []);

  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    handleParse(e.target.value);
  }, [handleParse]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file === undefined) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        handleParse(reader.result);
      }
    };
    reader.readAsText(file);
  }, [handleParse]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file === undefined) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        handleParse(reader.result);
      }
    };
    reader.readAsText(file);
  }, [handleParse]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleClickUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleImport = useCallback(() => {
    if (parsed === null) return;

    const run = async () => {
      setImporting(true);
      setImportError(null);
      try {
        const result = await importDashboard({
          data: {
            json: parsed,
            format: format ?? undefined,
          },
        });

        setWarnings(result.warnings);

        if (result.dashboard !== null) {
          await navigate({ to: '/dashboards/$id', params: { id: result.dashboard.id } });
        }
      } catch (error) {
        setImportError(error instanceof Error ? error.message : 'Import failed');
      } finally {
        setImporting(false);
      }
    };
    void run();
  }, [parsed, format, navigate]);

  const panelCount = parsed !== null && Array.isArray(parsed.panels) ? parsed.panels.length : 0;
  const title = parsed !== null && typeof parsed.title === 'string' ? parsed.title : null;

  return (
    <div className='mx-auto max-w-2xl space-y-6'>
      <h1 className='text-2xl font-semibold tracking-tight'>Import Dashboard</h1>
      <p className='text-muted-foreground text-sm'>
        Import a Grafana dashboard from JSON. Supports Classic, V1 Resource, and V2 Resource formats.
      </p>

      <div
        className='border-border hover:border-foreground/20 flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed p-8 transition-colors'
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onClick={handleClickUpload}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleClickUpload(); }}
        role='button'
        tabIndex={0}
        aria-label='Upload JSON file'
      >
        <Upload className='text-muted-foreground h-8 w-8' />
        <p className='text-muted-foreground text-sm'>Drop a JSON file here or click to upload</p>
        <input
          ref={fileInputRef}
          type='file'
          accept='.json'
          className='hidden'
          onChange={handleFileUpload}
          
        />
      </div>

      <div className='space-y-2'>
        <label htmlFor='json-input' className='text-sm font-medium'>Or paste JSON</label>
        <textarea
          id='json-input'
          className='border-border bg-background h-48 w-full rounded-md border p-3 font-mono text-sm'
          value={jsonText}
          onChange={handleTextChange}
          placeholder='Paste Grafana dashboard JSON here...'
        />
      </div>

      {parseError !== null && (
        <Alert variant='destructive'>
          <p>{parseError}</p>
        </Alert>
      )}

      {parsed !== null && format !== null && (
        <div className='border-border space-y-3 rounded-lg border p-4'>
          <div className='flex items-center gap-2'>
            <FileUp className='h-4 w-4' />
            <span className='font-medium'>Preview</span>
            <Badge variant='secondary'>{formatLabels[format]}</Badge>
          </div>
          {title !== null && <p className='text-sm'>Title: {title}</p>}
          <p className='text-muted-foreground text-sm'>{panelCount} panels detected</p>

          {warnings.length > 0 && (
            <div className='space-y-1'>
              {warnings.map((w, i) => (
                <p key={String(i)} className='text-sm text-yellow-600'>⚠ {w}</p>
              ))}
            </div>
          )}

          {importError !== null && (
            <Alert variant='destructive'>
              <p>{importError}</p>
            </Alert>
          )}

          <Button onClick={handleImport} disabled={importing}>
            {importing ? 'Importing...' : 'Import Dashboard'}
          </Button>
        </div>
      )}
    </div>
  );
};

export const Route = createFileRoute('/import')({
  component: ImportPage,
});
