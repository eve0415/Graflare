import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, it } from 'vitest';

import { expectNoA11yViolations } from '../../../../tests/a11y';

import { CreateTokenForm } from './create-token-form';

const noop = (): void => {};

afterEach(cleanup);

describe('create-token-form a11y', () => {
  it('has no axe violations (labelled name + duration controls)', async () => {
    const { container } = render(<CreateTokenForm onSubmit={noop} submitting={false} />);
    await expectNoA11yViolations(container);
  });

  it('has no axe violations while showing an inline error', async () => {
    const { container } = render(<CreateTokenForm onSubmit={noop} submitting={false} error='Could not create the token. Check the name and try again.' />);
    await expectNoA11yViolations(container);
  });
});
