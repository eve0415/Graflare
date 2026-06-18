import type { AlertForPayload } from './webhook-payload';

import { alertBody, alertSummary, alertTitle, isFiring } from './alert-summary';

/** Discord embed colors as decimal ints — red for firing, green for resolved. */
const DISCORD_COLOR_FIRING = 0xd3_2f_2f; // 13_840_175
const DISCORD_COLOR_RESOLVED = 0x38_8e_3c; // 3_706_428

/** Discord hard limits. */
const MAX_CONTENT = 2000;
const MAX_EMBEDS = 10;
/** Reserve room for a trailing summary embed when there are more alerts than fit. */
const EMBED_BUDGET = MAX_EMBEDS - 1;

export interface DiscordField {
  name: string;
  value: string;
  inline: boolean;
}

export interface DiscordEmbed {
  title: string;
  description: string;
  color: number;
  fields: DiscordField[];
}

export interface DiscordPayload {
  content: string;
  embeds: DiscordEmbed[];
  /** Username override — present only when set. */
  username?: string;
  /** Avatar override — present only when set. */
  avatar_url?: string;
}

export interface DiscordPayloadOptions {
  username?: string;
  avatarUrl?: string;
}

const truncate = (s: string, max: number): string => (s.length <= max ? s : `${s.slice(0, Math.max(0, max - 1))}…`);

/** Discord rejects empty field name/value, so drop labels with an empty side. */
const labelFields = (labels: Record<string, string>): DiscordField[] =>
  Object.entries(labels)
    .filter(([name, value]) => name.length > 0 && value.length > 0)
    .map(([name, value]) => ({ name, value, inline: true }));

export const buildDiscordPayload = (alerts: AlertForPayload[], receiver: string, externalURL: string, opts: DiscordPayloadOptions = {}): DiscordPayload => {
  const { hasFiring, statusWord, counts } = alertSummary(alerts);
  const content = truncate(`**[${statusWord}] ${receiver}** — ${counts}${externalURL.length > 0 ? `\n${externalURL}` : ''}`, MAX_CONTENT);

  const embeds: DiscordEmbed[] = alerts.slice(0, EMBED_BUDGET).map(alert => ({
    title: truncate(alertTitle(alert), 256),
    description: truncate(alertBody(alert), 4096),
    color: isFiring(alert.state) ? DISCORD_COLOR_FIRING : DISCORD_COLOR_RESOLVED,
    fields: labelFields(alert.labels),
  }));

  if (alerts.length > EMBED_BUDGET) {
    embeds.push({
      title: `+${alerts.length - EMBED_BUDGET} more alerts`,
      description: '',
      color: hasFiring ? DISCORD_COLOR_FIRING : DISCORD_COLOR_RESOLVED,
      fields: [],
    });
  }

  const payload: DiscordPayload = { content, embeds };
  if (opts.username !== undefined && opts.username.length > 0) payload.username = opts.username;
  if (opts.avatarUrl !== undefined && opts.avatarUrl.length > 0) payload.avatar_url = opts.avatarUrl;
  return payload;
};
