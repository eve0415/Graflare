import type { ServiceTokenMetadata } from '@graflare/shared/schemas/service-token';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, it } from 'vitest';

import { expectNoA11yViolations } from '../../../../tests/a11y';

import { ServiceTokenList } from './service-token-list';

const tokens: readonly ServiceTokenMetadata[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    clientId: 'client-abc123.access',
    name: 'ci-deploy-bot',
    createdAt: 1_700_000_000_000,
    expiresAt: 1_800_000_000_000,
  },
  { id: '22222222-2222-2222-2222-222222222222', clientId: 'client-def456.access', name: 'nightly-sync', createdAt: 1_700_000_000_000, expiresAt: null },
];

const noop = (): void => {};

afterEach(cleanup);

describe('service-token-list a11y', () => {
  it('has no axe violations (table headers, copy + revoke row actions)', async () => {
    const { container } = render(<ServiceTokenList tokens={tokens} revokingId={null} onRevoke={noop} />);
    await expectNoA11yViolations(container);
  });
});
