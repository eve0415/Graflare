interface AlertEmailData {
  ruleName: string;
  state: 'Firing' | 'Resolved';
  labels: Record<string, string>;
  value: string;
  startsAt: string;
  dashboardURL?: string;
  externalURL: string;
}

export function renderAlertEmailHtml(alerts: AlertEmailData[]): string {
  const hasFiring = alerts.some(a => a.state === 'Firing');
  const statusColor = hasFiring ? '#dc2626' : '#16a34a';
  const statusText = hasFiring ? 'FIRING' : 'RESOLVED';

  const alertRows = alerts
    .map(a => {
      const color = a.state === 'Firing' ? '#dc2626' : '#16a34a';
      const labelPills = Object.entries(a.labels)
        .map(([k, v]) => `<span style="background:#f1f5f9;padding:2px 6px;border-radius:4px;font-size:12px;">${escapeHtml(k)}=${escapeHtml(v)}</span>`)
        .join(' ');
      const dashboardLink = a.dashboardURL ? `<a href="${escapeHtml(a.dashboardURL)}" style="color:#2563eb;">View Dashboard</a>` : '';

      return `<tr>
        <td style="padding:12px;border-bottom:1px solid #e2e8f0;">
          <div style="font-weight:600;">${escapeHtml(a.ruleName)}</div>
          <div style="margin-top:4px;">${labelPills}</div>
          <div style="margin-top:4px;font-size:13px;color:#64748b;">Value: ${escapeHtml(a.value)} | Since: ${escapeHtml(a.startsAt)}</div>
          ${dashboardLink}
        </td>
        <td style="padding:12px;border-bottom:1px solid #e2e8f0;text-align:center;">
          <span style="color:${color};font-weight:700;">${a.state.toUpperCase()}</span>
        </td>
      </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:20px;background:#f8fafc;">
  <div style="max-width:600px;margin:0 auto;background:white;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="background:${statusColor};color:white;padding:16px 20px;">
      <h1 style="margin:0;font-size:18px;">[${statusText}] Graflare Alert</h1>
    </div>
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="background:#f8fafc;">
          <th style="padding:8px 12px;text-align:left;font-size:13px;color:#64748b;">Alert</th>
          <th style="padding:8px 12px;text-align:center;font-size:13px;color:#64748b;">State</th>
        </tr>
      </thead>
      <tbody>${alertRows}</tbody>
    </table>
    <div style="padding:12px 20px;font-size:12px;color:#94a3b8;border-top:1px solid #e2e8f0;">
      Sent by <a href="${escapeHtml(alerts[0]?.externalURL ?? '')}" style="color:#2563eb;">Graflare</a>
    </div>
  </div>
</body>
</html>`;
}

export function renderAlertEmailText(alerts: AlertEmailData[]): string {
  const hasFiring = alerts.some(a => a.state === 'Firing');
  const lines = [`[${hasFiring ? 'FIRING' : 'RESOLVED'}] Graflare Alert`, ''];

  for (const a of alerts) {
    lines.push(`${a.state.toUpperCase()}: ${a.ruleName}`);
    lines.push(`  Labels: ${Object.entries(a.labels).map(([k, v]) => `${k}=${v}`).join(', ')}`);
    lines.push(`  Value: ${a.value} | Since: ${a.startsAt}`);
    if (a.dashboardURL) lines.push(`  Dashboard: ${a.dashboardURL}`);
    lines.push('');
  }

  return lines.join('\n');
}

function escapeHtml(s: string): string {
  return s.replaceAll(/&/g, '&amp;').replaceAll(/</g, '&lt;').replaceAll(/>/g, '&gt;').replaceAll(/"/g, '&quot;');
}
