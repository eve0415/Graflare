import type { Annotation, CreateAnnotation } from '@graflare/shared/schemas/annotation';

import { Badge } from '@graflare/ui/components/badge';
import { Button } from '@graflare/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@graflare/ui/components/dialog';
import { Separator } from '@graflare/ui/components/separator';
import { useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useCallback, useState } from 'react';

import { createAnnotation, deleteAnnotation } from '../-api';

import { AnnotationForm } from './annotation-form';

interface AnnotationsDialogProps {
  open: boolean;
  onClose: () => void;
  dashboardId: string;
  // The same windowed list the chart overlay reads — passed in so there's a single
  // subscription/source of truth. Mutations invalidate the prefix below to refetch it.
  annotations: readonly Annotation[];
}

// Auto-generated alert annotations carry a `newState`; user-created ones don't.
const isAlertAnnotation = (a: Annotation): boolean => a.newState !== undefined;

const AnnotationRow = ({ annotation, deleting, onDelete }: { annotation: Annotation; deleting: boolean; onDelete: (id: string) => void }) => {
  const handleDelete = useCallback(() => {
    onDelete(annotation.id);
  }, [onDelete, annotation.id]);

  const when = new Date(annotation.time).toLocaleString();
  const alert = isAlertAnnotation(annotation);

  return (
    <div className='flex items-start justify-between gap-2 rounded-md border px-3 py-2'>
      <div className='min-w-0 space-y-1'>
        <div className='flex items-center gap-2'>
          {alert && <Badge variant='secondary'>Alert</Badge>}
          <span className='truncate text-sm font-medium'>{annotation.text === '' ? '(no description)' : annotation.text}</span>
        </div>
        <div className='text-muted-foreground text-xs'>{when}</div>
        {annotation.tags.length > 0 && (
          <div className='flex flex-wrap gap-1'>
            {annotation.tags.map((t, i) => (
              <Badge key={i} variant='outline' className='text-xs'>
                {t}
              </Badge>
            ))}
          </div>
        )}
      </div>
      <Button variant='ghost' size='xs' onClick={handleDelete} disabled={deleting} aria-label={`Delete annotation: ${annotation.text || when}`}>
        <Trash2 className='h-3 w-3' />
      </Button>
    </div>
  );
};

export const AnnotationsDialog = ({ open, onClose, dashboardId, annotations }: AnnotationsDialogProps) => {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Invalidate the whole `['annotations', dashboardId, …]` prefix so the active
  // windowed query (overlay + this list) refetches regardless of its from/to bounds.
  const invalidate = useCallback(() => queryClient.invalidateQueries({ queryKey: ['annotations', dashboardId] }), [queryClient, dashboardId]);

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) onClose();
    },
    [onClose],
  );

  const handleCreate = useCallback(
    (payload: CreateAnnotation) => {
      const run = async () => {
        setCreating(true);
        try {
          await createAnnotation({ data: payload });
          await invalidate();
        } finally {
          setCreating(false);
        }
      };
      void run();
    },
    [invalidate],
  );

  const handleDelete = useCallback(
    (id: string) => {
      const run = async () => {
        setDeletingId(id);
        try {
          await deleteAnnotation({ data: { id } });
          await invalidate();
        } finally {
          setDeletingId(null);
        }
      };
      void run();
    },
    [invalidate],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className='max-w-lg'>
        <DialogHeader>
          <DialogTitle>Annotations</DialogTitle>
          <DialogDescription>Mark an event on the timeline. Annotations in the current time range appear below.</DialogDescription>
        </DialogHeader>

        <AnnotationForm dashboardId={dashboardId} onSubmit={handleCreate} submitting={creating} />

        <Separator />

        <div className='space-y-1'>
          <h3 className='text-sm font-medium'>In this time range</h3>
          {annotations.length === 0 ? (
            <p className='text-muted-foreground py-2 text-center text-sm'>No annotations in the current time range.</p>
          ) : (
            <div className='max-h-64 space-y-1 overflow-y-auto'>
              {annotations.map(a => (
                <AnnotationRow key={a.id} annotation={a} deleting={deletingId === a.id} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
