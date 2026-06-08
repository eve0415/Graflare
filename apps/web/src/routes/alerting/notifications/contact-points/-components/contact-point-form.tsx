import type { ContactPoint, CreateContactPoint } from '@graflare/shared/schemas/contact-point';

import { Button, buttonVariants } from '@graflare/ui/components/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@graflare/ui/components/card';
import { Input } from '@graflare/ui/components/input';
import { Label } from '@graflare/ui/components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@graflare/ui/components/select';
import { Link } from '@tanstack/react-router';
import { Plus, Trash2 } from 'lucide-react';
import { useCallback, useState } from 'react';

type ContactPointType = 'email' | 'webhook' | 'slack' | 'discord';
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

interface SlackForm {
  type: 'slack';
  webhookUrl: string;
  channel: string;
  username: string;
}

interface DiscordForm {
  type: 'discord';
  webhookUrl: string;
  username: string;
  avatarUrl: string;
}

export interface FormState {
  name: string;
  settings: EmailForm | WebhookForm | SlackForm | DiscordForm;
}

const isContactPointType = (v: string): v is ContactPointType => v === 'email' || v === 'webhook' || v === 'slack' || v === 'discord';

const isWebhookMethod = (v: string): v is WebhookMethod => v === 'POST' || v === 'PUT';

const CONTACT_POINT_TYPE_OPTIONS = [
  { value: 'email', label: 'Email' },
  { value: 'webhook', label: 'Webhook' },
  { value: 'slack', label: 'Slack' },
  { value: 'discord', label: 'Discord' },
] as const;

const WEBHOOK_METHOD_OPTIONS = [
  { value: 'POST', label: 'POST' },
  { value: 'PUT', label: 'PUT' },
] as const;

export const defaultContactPointForm: FormState = {
  name: '',
  settings: { type: 'email', addresses: [''] },
};

/** Maps a loaded contact point into form state, keeping settings exactly as returned (the stored secret is the '******' sentinel when set). */
export const contactPointToForm = (cp: Pick<ContactPoint, 'name' | 'settings'>): FormState => {
  const { settings } = cp;
  switch (settings.type) {
    case 'email':
      return { name: cp.name, settings: { type: 'email', addresses: settings.addresses.length > 0 ? settings.addresses : [''] } };
    case 'webhook':
      return {
        name: cp.name,
        settings: { type: 'webhook', url: settings.url, method: settings.method, username: settings.username, password: settings.password },
      };
    case 'slack':
      return { name: cp.name, settings: { type: 'slack', webhookUrl: settings.webhookUrl, channel: settings.channel, username: settings.username } };
    case 'discord':
      return { name: cp.name, settings: { type: 'discord', webhookUrl: settings.webhookUrl, username: settings.username, avatarUrl: settings.avatarUrl } };
  }
};

/** Initial empty form settings for a freshly-selected type. Exhaustive — a new type is a compile error here. */
const defaultSettingsFor = (type: ContactPointType): FormState['settings'] => {
  switch (type) {
    case 'email':
      return { type: 'email', addresses: [''] };
    case 'webhook':
      return { type: 'webhook', url: '', method: 'POST', username: '', password: '' };
    case 'slack':
      return { type: 'slack', webhookUrl: '', channel: '', username: '' };
    case 'discord':
      return { type: 'discord', webhookUrl: '', username: '', avatarUrl: '' };
  }
};

/** Maps the discriminated form settings to the API payload. Exhaustive — a new type is a compile error here. */
const formSettingsToPayload = (settings: FormState['settings']): CreateContactPoint['settings'] => {
  switch (settings.type) {
    case 'email':
      return { type: 'email', addresses: settings.addresses.filter(a => a.trim() !== '') };
    case 'webhook':
      return { type: 'webhook', url: settings.url, method: settings.method, username: settings.username, password: settings.password };
    case 'slack':
      return { type: 'slack', webhookUrl: settings.webhookUrl, channel: settings.channel, username: settings.username };
    case 'discord':
      return { type: 'discord', webhookUrl: settings.webhookUrl, username: settings.username, avatarUrl: settings.avatarUrl };
  }
};

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

interface Props {
  initialForm: FormState;
  submitLabel: string;
  onSubmit: (data: CreateContactPoint) => Promise<void>;
}

export const ContactPointForm = ({ initialForm, submitLabel, onSubmit }: Props) => {
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormState>(initialForm);

  const isEdit = submitLabel === 'Save Changes';
  const title = isEdit ? 'Edit Contact Point' : 'New Contact Point';

  const handleSubmit = useCallback(
    (e: React.SyntheticEvent) => {
      e.preventDefault();
      const run = async () => {
        setSubmitting(true);
        try {
          await onSubmit({ name: form.name, type: form.settings.type, settings: formSettingsToPayload(form.settings) });
        } finally {
          setSubmitting(false);
        }
      };
      void run();
    },
    [form, onSubmit],
  );

  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setForm(prev => ({ ...prev, name: value }));
  }, []);

  const handleTypeChange = useCallback((value: string | null) => {
    if (value === null || !isContactPointType(value)) return;
    setForm(prev => ({ ...prev, settings: defaultSettingsFor(value) }));
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

  const handleSlackWebhookUrlChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setForm(prev => {
      if (prev.settings.type !== 'slack') return prev;
      return { ...prev, settings: { ...prev.settings, webhookUrl: value } };
    });
  }, []);

  const handleSlackChannelChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setForm(prev => {
      if (prev.settings.type !== 'slack') return prev;
      return { ...prev, settings: { ...prev.settings, channel: value } };
    });
  }, []);

  const handleSlackUsernameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setForm(prev => {
      if (prev.settings.type !== 'slack') return prev;
      return { ...prev, settings: { ...prev.settings, username: value } };
    });
  }, []);

  const handleDiscordWebhookUrlChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setForm(prev => {
      if (prev.settings.type !== 'discord') return prev;
      return { ...prev, settings: { ...prev.settings, webhookUrl: value } };
    });
  }, []);

  const handleDiscordUsernameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setForm(prev => {
      if (prev.settings.type !== 'discord') return prev;
      return { ...prev, settings: { ...prev.settings, username: value } };
    });
  }, []);

  const handleDiscordAvatarUrlChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setForm(prev => {
      if (prev.settings.type !== 'discord') return prev;
      return { ...prev, settings: { ...prev.settings, avatarUrl: value } };
    });
  }, []);

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
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
                {isEdit && <p className='text-muted-foreground text-xs'>Leave as ****** to keep the current password.</p>}
              </div>
            </>
          )}

          {form.settings.type === 'slack' && (
            <>
              <div className='space-y-2'>
                <Label htmlFor='slackWebhookUrl'>Webhook URL</Label>
                <Input
                  id='slackWebhookUrl'
                  type='text'
                  value={form.settings.webhookUrl}
                  onChange={handleSlackWebhookUrlChange}
                  placeholder='https://hooks.slack.com/services/...'
                  required
                />
                {isEdit && <p className='text-muted-foreground text-xs'>Leave as ****** to keep the current URL.</p>}
              </div>
              <div className='space-y-2'>
                <Label htmlFor='slackChannel'>Channel (optional)</Label>
                <Input id='slackChannel' value={form.settings.channel} onChange={handleSlackChannelChange} placeholder='#alerts' />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='slackUsername'>Username (optional)</Label>
                <Input id='slackUsername' value={form.settings.username} onChange={handleSlackUsernameChange} placeholder='Graflare' />
              </div>
            </>
          )}

          {form.settings.type === 'discord' && (
            <>
              <div className='space-y-2'>
                <Label htmlFor='discordWebhookUrl'>Webhook URL</Label>
                <Input
                  id='discordWebhookUrl'
                  type='text'
                  value={form.settings.webhookUrl}
                  onChange={handleDiscordWebhookUrlChange}
                  placeholder='https://discord.com/api/webhooks/...'
                  required
                />
                {isEdit && <p className='text-muted-foreground text-xs'>Leave as ****** to keep the current URL.</p>}
              </div>
              <div className='space-y-2'>
                <Label htmlFor='discordUsername'>Username (optional)</Label>
                <Input id='discordUsername' value={form.settings.username} onChange={handleDiscordUsernameChange} placeholder='Graflare' />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='discordAvatarUrl'>Avatar URL (optional)</Label>
                <Input id='discordAvatarUrl' type='text' value={form.settings.avatarUrl} onChange={handleDiscordAvatarUrlChange} placeholder='https://...' />
              </div>
            </>
          )}
        </CardContent>
        <CardFooter className='flex gap-2'>
          <Button type='submit' disabled={submitting || form.name.trim() === ''}>
            {submitting ? 'Saving...' : submitLabel}
          </Button>
          <Link to='/alerting/notifications/contact-points' className={buttonVariants({ variant: 'outline' })}>
            Cancel
          </Link>
        </CardFooter>
      </Card>
    </form>
  );
};
