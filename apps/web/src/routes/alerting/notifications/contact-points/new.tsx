import { Button } from '@graflare/ui/components/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@graflare/ui/components/card';
import { Input } from '@graflare/ui/components/input';
import { Label } from '@graflare/ui/components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@graflare/ui/components/select';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Plus, Trash2 } from 'lucide-react';
import { useCallback, useState } from 'react';

import { createContactPoint } from '../../-api';

type ContactPointType = 'email' | 'webhook';
type WebhookMethod = 'POST' | 'PUT';

interface EmailForm {
  type: 'email';
  addresses: string[];
}

interface WebhookForm {
  type: 'webhook';
  url: string;
  method: WebhookMethod;
  username: string;
  password: string;
}

interface FormState {
  name: string;
  settings: EmailForm | WebhookForm;
}

const isContactPointType = (v: string): v is ContactPointType => v === 'email' || v === 'webhook';

const isWebhookMethod = (v: string): v is WebhookMethod => v === 'POST' || v === 'PUT';

const CONTACT_POINT_TYPE_OPTIONS = [
  { value: 'email', label: 'Email' },
  { value: 'webhook', label: 'Webhook' },
] as const;

const WEBHOOK_METHOD_OPTIONS = [
  { value: 'POST', label: 'POST' },
  { value: 'PUT', label: 'PUT' },
] as const;

const AddressRow = ({
  index,
  value,
  canRemove,
  onChange,
  onRemove,
}: {
  index: number;
  value: string;
  canRemove: boolean;
  onChange: (index: number, value: string) => void;
  onRemove: (index: number) => void;
}) => {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(index, e.target.value);
    },
    [index, onChange],
  );
  const handleRemove = useCallback(() => {
    onRemove(index);
  }, [index, onRemove]);

  return (
    <div className='flex items-center gap-2'>
      <Input type='email' value={value} onChange={handleChange} placeholder='user@example.com' className='flex-1' />
      {canRemove && (
        <Button type='button' variant='ghost' size='xs' onClick={handleRemove}>
          <Trash2 className='h-3 w-3' />
        </Button>
      )}
    </div>
  );
};

const NewContactPointPage = () => {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormState>({
    name: '',
    settings: { type: 'email', addresses: [''] },
  });

  const handleSubmit = useCallback(
    (e: React.SyntheticEvent) => {
      e.preventDefault();
      const run = async () => {
        setSubmitting(true);
        try {
          const { settings } = form;
          await createContactPoint({
            data: {
              name: form.name,
              type: settings.type,
              settings:
                settings.type === 'email'
                  ? { type: 'email', addresses: settings.addresses.filter(a => a.trim() !== '') }
                  : { type: 'webhook', url: settings.url, method: settings.method, username: settings.username, password: settings.password },
            },
          });
          await navigate({ to: '/alerting/notifications/contact-points' });
        } finally {
          setSubmitting(false);
        }
      };
      void run();
    },
    [form, navigate],
  );

  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setForm(prev => ({ ...prev, name: value }));
  }, []);

  const handleTypeChange = useCallback((value: string | null) => {
    if (value !== null && isContactPointType(value)) {
      if (value === 'email') {
        setForm(prev => ({ ...prev, settings: { type: 'email', addresses: [''] } }));
      } else {
        setForm(prev => ({ ...prev, settings: { type: 'webhook', url: '', method: 'POST', username: '', password: '' } }));
      }
    }
  }, []);

  const handleAddAddress = useCallback(() => {
    setForm(prev => {
      if (prev.settings.type !== 'email') return prev;
      return { ...prev, settings: { ...prev.settings, addresses: [...prev.settings.addresses, ''] } };
    });
  }, []);

  const handleRemoveAddress = useCallback((index: number) => {
    setForm(prev => {
      if (prev.settings.type !== 'email') return prev;
      return { ...prev, settings: { ...prev.settings, addresses: prev.settings.addresses.filter((_, i) => i !== index) } };
    });
  }, []);

  const handleAddressChange = useCallback((index: number, value: string) => {
    setForm(prev => {
      if (prev.settings.type !== 'email') return prev;
      return {
        ...prev,
        settings: {
          ...prev.settings,
          addresses: prev.settings.addresses.map((a, i) => (i === index ? value : a)),
        },
      };
    });
  }, []);

  const handleWebhookUrlChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setForm(prev => {
      if (prev.settings.type !== 'webhook') return prev;
      return { ...prev, settings: { ...prev.settings, url: value } };
    });
  }, []);

  const handleWebhookMethodChange = useCallback((value: string | null) => {
    if (value !== null && isWebhookMethod(value)) {
      setForm(prev => {
        if (prev.settings.type !== 'webhook') return prev;
        return { ...prev, settings: { ...prev.settings, method: value } };
      });
    }
  }, []);

  const handleWebhookUsernameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setForm(prev => {
      if (prev.settings.type !== 'webhook') return prev;
      return { ...prev, settings: { ...prev.settings, username: value } };
    });
  }, []);

  const handleWebhookPasswordChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setForm(prev => {
      if (prev.settings.type !== 'webhook') return prev;
      return { ...prev, settings: { ...prev.settings, password: value } };
    });
  }, []);

  const handleCancel = useCallback(() => {
    void navigate({ to: '/alerting/notifications/contact-points' });
  }, [navigate]);

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>New Contact Point</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='space-y-2'>
            <Label htmlFor='name'>Name</Label>
            <Input id='name' value={form.name} onChange={handleNameChange} placeholder='My contact point' required />
          </div>

          <div className='space-y-2'>
            <Label htmlFor='type'>Type</Label>
            <Select value={form.settings.type} onValueChange={handleTypeChange} items={CONTACT_POINT_TYPE_OPTIONS}>
              <SelectTrigger id='type'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTACT_POINT_TYPE_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {form.settings.type === 'email' && (
            <div className='space-y-3'>
              <div className='flex items-center justify-between'>
                <Label>Email Addresses</Label>
                <Button type='button' variant='outline' size='sm' onClick={handleAddAddress}>
                  <Plus className='mr-1 h-3 w-3' />
                  Add Address
                </Button>
              </div>
              {form.settings.addresses.map((addr, i) => (
                <AddressRow
                  key={i}
                  index={i}
                  value={addr}
                  canRemove={form.settings.type === 'email' && form.settings.addresses.length > 1}
                  onChange={handleAddressChange}
                  onRemove={handleRemoveAddress}
                />
              ))}
            </div>
          )}

          {form.settings.type === 'webhook' && (
            <>
              <div className='space-y-2'>
                <Label htmlFor='webhookUrl'>URL</Label>
                <Input
                  id='webhookUrl'
                  type='url'
                  value={form.settings.url}
                  onChange={handleWebhookUrlChange}
                  placeholder='https://hooks.example.com/alert'
                  required
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='webhookMethod'>Method</Label>
                <Select value={form.settings.method} onValueChange={handleWebhookMethodChange} items={WEBHOOK_METHOD_OPTIONS}>
                  <SelectTrigger id='webhookMethod'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WEBHOOK_METHOD_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className='space-y-2'>
                <Label htmlFor='webhookUsername'>Username (optional)</Label>
                <Input id='webhookUsername' value={form.settings.username} onChange={handleWebhookUsernameChange} />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='webhookPassword'>Password (optional)</Label>
                <Input id='webhookPassword' type='password' value={form.settings.password} onChange={handleWebhookPasswordChange} />
              </div>
            </>
          )}
        </CardContent>
        <CardFooter className='flex gap-2'>
          <Button type='submit' disabled={submitting || form.name.trim() === ''}>
            {submitting ? 'Creating...' : 'Create Contact Point'}
          </Button>
          <Button type='button' variant='outline' onClick={handleCancel}>
            Cancel
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
};

export const Route = createFileRoute('/alerting/notifications/contact-points/new')({
  component: NewContactPointPage,
});
