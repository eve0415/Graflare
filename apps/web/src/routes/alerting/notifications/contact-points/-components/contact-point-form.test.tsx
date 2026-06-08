import type { CreateContactPoint } from '@graflare/shared/schemas/contact-point';
import type { ReactNode } from 'react';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ContactPointForm, contactPointToForm } from './contact-point-form';

// The form's Cancel button is a TanStack <Link>, which needs a RouterProvider.
// This is a focused component test, so stub Link with a plain element.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

afterEach(() => {
  cleanup();
});

const formOf = (el: Element): HTMLFormElement => {
  const form = el.closest('form');
  if (form === null) throw new Error('no enclosing form');
  return form;
};

const submitFor = async (initial: ReturnType<typeof contactPointToForm>, edit: (() => void) | null): Promise<CreateContactPoint> => {
  const onSubmit = vi.fn<(data: CreateContactPoint) => Promise<void>>(() => Promise.resolve());
  render(<ContactPointForm initialForm={initial} submitLabel='Create' onSubmit={onSubmit} />);
  edit?.();
  fireEvent.submit(formOf(screen.getByText('Create')));
  await waitFor(() => {
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
  const [arg] = onSubmit.mock.calls[0] ?? [];
  if (arg === undefined) throw new Error('onSubmit not called');
  return arg;
};

describe('contact-point-form slack/discord', () => {
  it('renders slack fields when initialized as slack', () => {
    const initial = contactPointToForm({ name: 'S', settings: { type: 'slack', webhookUrl: 'https://hooks.slack.com/x', channel: '#ops', username: 'Bot' } });
    const onSubmit = vi.fn<(data: CreateContactPoint) => Promise<void>>(() => Promise.resolve());
    render(<ContactPointForm initialForm={initial} submitLabel='Create' onSubmit={onSubmit} />);

    expect(screen.getByLabelText('Webhook URL')).toBeDefined();
    expect(screen.getByLabelText('Channel (optional)')).toBeDefined();
  });

  it('renders discord fields when initialized as discord', () => {
    const initial = contactPointToForm({
      name: 'D',
      settings: { type: 'discord', webhookUrl: 'https://discord.com/api/webhooks/x', username: 'Bot', avatarUrl: 'https://a/b.png' },
    });
    const onSubmit = vi.fn<(data: CreateContactPoint) => Promise<void>>(() => Promise.resolve());
    render(<ContactPointForm initialForm={initial} submitLabel='Create' onSubmit={onSubmit} />);

    expect(screen.getByLabelText('Webhook URL')).toBeDefined();
    expect(screen.getByLabelText('Avatar URL (optional)')).toBeDefined();
  });

  it('submits the slack settings object built from the fields', async () => {
    const initial = contactPointToForm({ name: 'S', settings: { type: 'slack', webhookUrl: '', channel: '', username: '' } });
    const data = await submitFor(initial, () => {
      fireEvent.change(screen.getByLabelText('Webhook URL'), { target: { value: 'https://hooks.slack.com/services/new' } });
      fireEvent.change(screen.getByLabelText('Channel (optional)'), { target: { value: '#alerts' } });
      fireEvent.change(screen.getByLabelText('Username (optional)'), { target: { value: 'Graflare' } });
    });

    expect(data.type).toBe('slack');
    expect(data.settings).toEqual({ type: 'slack', webhookUrl: 'https://hooks.slack.com/services/new', channel: '#alerts', username: 'Graflare' });
  });

  it('submits the discord settings object built from the fields', async () => {
    const initial = contactPointToForm({ name: 'D', settings: { type: 'discord', webhookUrl: '', username: '', avatarUrl: '' } });
    const data = await submitFor(initial, () => {
      fireEvent.change(screen.getByLabelText('Webhook URL'), { target: { value: 'https://discord.com/api/webhooks/new' } });
      fireEvent.change(screen.getByLabelText('Username (optional)'), { target: { value: 'Graflare' } });
      fireEvent.change(screen.getByLabelText('Avatar URL (optional)'), { target: { value: 'https://a/b.png' } });
    });

    expect(data.type).toBe('discord');
    expect(data.settings).toEqual({ type: 'discord', webhookUrl: 'https://discord.com/api/webhooks/new', username: 'Graflare', avatarUrl: 'https://a/b.png' });
  });

  it('gates per-type fields: an email form shows neither the slack nor discord secret field', () => {
    const initial = contactPointToForm({ name: 'E', settings: { type: 'email', addresses: ['a@b.com'] } });
    const onSubmit = vi.fn<(data: CreateContactPoint) => Promise<void>>(() => Promise.resolve());
    render(<ContactPointForm initialForm={initial} submitLabel='Create' onSubmit={onSubmit} />);

    expect(screen.queryByLabelText('Webhook URL')).toBeNull();
    expect(screen.getByText('Email Addresses')).toBeDefined();
  });

  // A <fieldset>+<legend> exposes a `group` role named by the (sr-only) legend, so
  // assistive tech conveys that these inputs belong to the chosen channel. The form
  // seeds its type from `initialForm` only on mount, so each case is its own render.
  it.each([
    [contactPointToForm({ name: 'E', settings: { type: 'email', addresses: ['a@b.com'] } }), 'Email settings'],
    [contactPointToForm({ name: 'W', settings: { type: 'webhook', url: '', method: 'POST', username: '', password: '' } }), 'Webhook settings'],
    [contactPointToForm({ name: 'S', settings: { type: 'slack', webhookUrl: '', channel: '', username: '' } }), 'Slack settings'],
    [contactPointToForm({ name: 'D', settings: { type: 'discord', webhookUrl: '', username: '', avatarUrl: '' } }), 'Discord settings'],
  ])('groups the %o settings block under a labelled fieldset', (initial, legend) => {
    const onSubmit = vi.fn<(data: CreateContactPoint) => Promise<void>>(() => Promise.resolve());
    render(<ContactPointForm initialForm={initial} submitLabel='Create' onSubmit={onSubmit} />);
    expect(screen.getByRole('group', { name: legend })).toBeDefined();
  });

  it('shows the redaction hint for the slack secret only in edit mode', () => {
    const initial = contactPointToForm({ name: 'S', settings: { type: 'slack', webhookUrl: '******', channel: '', username: '' } });
    const onSubmit = vi.fn<(data: CreateContactPoint) => Promise<void>>(() => Promise.resolve());
    const { rerender } = render(<ContactPointForm initialForm={initial} submitLabel='Create' onSubmit={onSubmit} />);
    expect(screen.queryByText('Leave as ****** to keep the current URL.')).toBeNull();

    rerender(<ContactPointForm initialForm={initial} submitLabel='Save Changes' onSubmit={onSubmit} />);
    expect(screen.getByText('Leave as ****** to keep the current URL.')).toBeDefined();
  });
});
