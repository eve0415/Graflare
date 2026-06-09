import type { ServiceTokenCreateResult } from '@graflare/shared/schemas/service-token';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, it } from 'vitest';

import { expectNoA11yViolations } from '../../../../tests/a11y';

import { RevealSecretPanel } from './reveal-secret-panel';

const result: ServiceTokenCreateResult = {
  id: '11111111-1111-1111-1111-111111111111',
  clientId: 'client-abc123.access',
  name: 'ci-deploy-bot',
  createdAt: 1_700_000_000_000,
  expiresAt: null,
  clientSecret: 'super-secret-value-shown-once',
};

const noop = (): void => {};

afterEach(cleanup);

describe('reveal-secret-panel a11y', () => {
  it('has no axe violations (checkbox labelling, focusable warning, alert, copy fields)', async () => {
    const { container } = render(<RevealSecretPanel result={result} onDone={noop} />);
    await expectNoA11yViolations(container);
  });
});
