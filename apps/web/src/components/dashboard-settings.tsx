import { Button } from '@graflare/ui/components/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@graflare/ui/components/dialog';
import { Input } from '@graflare/ui/components/input';
import { Label } from '@graflare/ui/components/label';
import { Separator } from '@graflare/ui/components/separator';
import { useSuspenseQuery } from '@tanstack/react-query';
import { History, RotateCcw } from 'lucide-react';
import { useCallback, useState } from 'react';

import { restoreDashboardVersion } from '../lib/api';
import { dashboardVersionsQueryOptions } from '../lib/query-options';
import { QueryBoundary } from './query-boundary';
import { VersionHistorySkeleton } from './skeletons/version-history-skeleton';

interface DashboardSettingsProps {
  open: boolean;
  onClose: () => void;
  dashboardId: string;
  title: string;
  description: string;
  tags: string[];
  onSave: (data: { title: string; description: string; tags: string[] }) => void;
  onRestore?: () => void;
}

type Tab = 'general' | 'versions';

export const DashboardSettings = ({ open, onClose, dashboardId, title, description, tags, onSave, onRestore }: DashboardSettingsProps) => {
  const [tab, setTab] = useState<Tab>('general');
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftDescription, setDraftDescription] = useState(description);
  const [draftTags, setDraftTags] = useState(tags.join(', '));

  const handleSave = useCallback(() => {
    onSave({
      title: draftTitle,
      description: draftDescription,
      tags: draftTags
        .split(',')
        .map(t => t.trim())
        .filter(Boolean),
    });
    onClose();
  }, [draftTitle, draftDescription, draftTags, onSave, onClose]);

  const handleTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setDraftTitle(e.target.value);
  }, []);

  const handleDescChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDraftDescription(e.target.value);
  }, []);

  const handleTagsChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setDraftTags(e.target.value);
  }, []);

  const handleOpenChange = useCallback((isOpen: boolean) => { if (!isOpen) onClose(); }, [onClose]);

  const showGeneral = useCallback(() => { setTab('general'); }, []);
  const showVersions = useCallback(() => { setTab('versions'); }, []);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className='max-w-lg'>
        <DialogHeader>
          <DialogTitle>Dashboard Settings</DialogTitle>
        </DialogHeader>

        <div className='flex gap-2 border-b pb-2'>
          <Button variant={tab === 'general' ? 'secondary' : 'ghost'} size='sm' onClick={showGeneral}>
            General
          </Button>
          <Button variant={tab === 'versions' ? 'secondary' : 'ghost'} size='sm' onClick={showVersions}>
            <History className='mr-1 h-3.5 w-3.5' />
            Version History
          </Button>
        </div>

        {tab === 'general' && (
          <div className='space-y-4'>
            <div className='space-y-2'>
              <Label htmlFor='settings-title'>Title</Label>
              <Input id='settings-title' value={draftTitle} onChange={handleTitleChange} />
            </div>

            <div className='space-y-2'>
              <Label htmlFor='settings-description'>Description</Label>
              <textarea
                id='settings-description'
                className='border-border bg-background w-full rounded-md border p-2 text-sm'
                rows={3}
                value={draftDescription}
                onChange={handleDescChange}
              />
            </div>

            <div className='space-y-2'>
              <Label htmlFor='settings-tags'>Tags (comma-separated)</Label>
              <Input id='settings-tags' value={draftTags} onChange={handleTagsChange} placeholder='tag1, tag2, tag3' />
            </div>

            <Separator />

            <div className='flex justify-end gap-2'>
              <Button variant='outline' onClick={onClose}>Cancel</Button>
              <Button onClick={handleSave}>Save</Button>
            </div>
          </div>
        )}

        {tab === 'versions' && (
          <QueryBoundary pendingFallback={<VersionHistorySkeleton />}>
            <VersionHistory dashboardId={dashboardId} onRestore={onRestore} onClose={onClose} />
          </QueryBoundary>
        )}
      </DialogContent>
    </Dialog>
  );
};

const VersionHistory = ({
  dashboardId,
  onRestore,
  onClose,
}: {
  dashboardId: string;
  onRestore?: () => void;
  onClose: () => void;
}) => {
  const { data: versions } = useSuspenseQuery(dashboardVersionsQueryOptions(dashboardId));

  const [restoring, setRestoring] = useState<number | null>(null);

  const handleRestore = useCallback((version: number) => {
    const run = async () => {
      setRestoring(version);
      try {
        await restoreDashboardVersion({ data: { dashboardId, version } });
        onRestore?.();
        onClose();
      } finally {
        setRestoring(null);
      }
    };
    void run();
  }, [dashboardId, onRestore, onClose]);

  if (versions.length === 0) {
    return <p className='text-muted-foreground py-4 text-center text-sm'>No version history available.</p>;
  }

  return (
    <div className='max-h-64 space-y-1 overflow-y-auto'>
      {versions.map(v => (
        <VersionRow key={v.id} version={v} restoring={restoring} onRestore={handleRestore} />
      ))}
    </div>
  );
};

const VersionRow = ({
  version,
  restoring,
  onRestore,
}: {
  version: { id: string; version: number; message: string; createdBy: string; createdAt: Date };
  restoring: number | null;
  onRestore: (version: number) => void;
}) => {
  const handleClick = useCallback(() => {
    onRestore(version.version);
  }, [onRestore, version.version]);

  return (
    <div className='flex items-center justify-between rounded-md border px-3 py-2'>
      <div>
        <span className='text-sm font-medium'>v{version.version}</span>
        {version.message && <span className='text-muted-foreground ml-2 text-xs'>{version.message}</span>}
        {version.createdBy && <span className='text-muted-foreground ml-2 text-xs'>by {version.createdBy}</span>}
      </div>
      <Button
        variant='ghost'
        size='xs'
        onClick={handleClick}
        disabled={restoring !== null}
      >
        <RotateCcw className='mr-1 h-3 w-3' />
        {restoring === version.version ? 'Restoring...' : 'Restore'}
      </Button>
    </div>
  );
};
