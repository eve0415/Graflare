import { Button } from '@graflare/ui/components/button';
import { Input } from '@graflare/ui/components/input';
import { Label } from '@graflare/ui/components/label';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useCallback, useState } from 'react';

import { createDashboard } from './-api';

const NewDashboardPage = () => {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (title.trim() === '') return;

      const run = async () => {
        setSubmitting(true);
        try {
          const result = await createDashboard({ data: { title: title.trim() } });
          if (result !== null) {
            await navigate({ to: '/dashboards/$id', params: { id: result.id } });
          }
        } finally {
          setSubmitting(false);
        }
      };
      void run();
    },
    [title, navigate],
  );

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
  }, []);

  return (
    <div className='mx-auto max-w-lg space-y-6'>
      <h1 className='text-2xl font-semibold tracking-tight'>New Dashboard</h1>

      <form onSubmit={handleSubmit} className='space-y-4'>
        <div className='space-y-2'>
          <Label htmlFor='title'>Title</Label>
          <Input id='title' placeholder='My Dashboard' value={title} onChange={handleChange} required />
        </div>
        <Button type='submit' disabled={submitting || title.trim() === ''}>
          {submitting ? 'Creating...' : 'Create Dashboard'}
        </Button>
      </form>
    </div>
  );
};

export const Route = createFileRoute('/dashboards/new')({
  component: NewDashboardPage,
});
