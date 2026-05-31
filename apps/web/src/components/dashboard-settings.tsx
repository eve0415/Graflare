import { Button } from '@graflare/ui/components/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@graflare/ui/components/dialog';
import { Input } from '@graflare/ui/components/input';
import { Label } from '@graflare/ui/components/label';
import { Separator } from '@graflare/ui/components/separator';
import { useCallback, useState } from 'react';

interface DashboardSettingsProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  tags: string[];
  onSave: (data: { title: string; description: string; tags: string[] }) => void;
}

export const DashboardSettings = ({ open, onClose, title, description, tags, onSave }: DashboardSettingsProps) => {
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

  return (
    <Dialog open={open} onOpenChange={isOpen => { if (!isOpen) onClose(); }}>
      <DialogContent className='max-w-md'>
        <DialogHeader>
          <DialogTitle>Dashboard Settings</DialogTitle>
        </DialogHeader>

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
      </DialogContent>
    </Dialog>
  );
};
