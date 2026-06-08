import { describe, expect, it } from 'vitest';

import { classifyError, extractDeniedField, isPermissionError } from './client';

describe('classifyError', () => {
  it('classifies permission-related messages', () => {
    expect(classifyError({ message: 'You do not have permission to access this resource' })).toBe('permission');
    expect(classifyError({ message: 'Unauthorized access' })).toBe('permission');
    expect(classifyError({ message: 'Access denied for this dataset' })).toBe('permission');
  });

  it('classifies HTTP 401/403 as permission errors', () => {
    expect(classifyError({ message: 'CF API returned 403' })).toBe('permission');
    expect(classifyError({ message: 'CF API returned 401' })).toBe('permission');
  });

  it('classifies authorization errors as permission', () => {
    expect(classifyError({ message: 'not authorized for that account' })).toBe('permission');
    expect(classifyError({ message: 'authorization denied' })).toBe('permission');
  });

  it('classifies validation errors', () => {
    expect(classifyError({ message: 'Validation error in query' })).toBe('validation');
    expect(classifyError({ message: "Cannot query field 'fooBar' on type 'Account'" })).toBe('validation');
    expect(classifyError({ message: 'Unknown field "badField"' })).toBe('validation');
  });

  it('classifies rate limit errors', () => {
    expect(classifyError({ message: 'Rate limit exceeded' })).toBe('rate_limit');
    expect(classifyError({ message: 'CF API returned 429' })).toBe('rate_limit');
  });

  it('classifies server errors', () => {
    expect(classifyError({ message: 'CF API returned 500' })).toBe('server');
    expect(classifyError({ message: 'CF API returned 502' })).toBe('server');
    expect(classifyError({ message: 'CF API returned 503' })).toBe('server');
  });

  it('classifies unknown errors', () => {
    expect(classifyError({ message: 'Internal server error' })).toBe('unknown');
    expect(classifyError({ message: 'Something went wrong' })).toBe('unknown');
    expect(classifyError({ message: 'Invalid query' })).toBe('unknown');
  });

  it('is case-insensitive', () => {
    expect(classifyError({ message: 'PERMISSION DENIED' })).toBe('permission');
    expect(classifyError({ message: 'Access Denied' })).toBe('permission');
    expect(classifyError({ message: 'RATE LIMIT reached' })).toBe('rate_limit');
  });
});

describe('isPermissionError', () => {
  it('detects permission errors', () => {
    expect(isPermissionError({ message: 'You do not have permission to access this resource' })).toBe(true);
    expect(isPermissionError({ message: 'Unauthorized access' })).toBe(true);
    expect(isPermissionError({ message: 'Access denied for this dataset' })).toBe(true);
  });

  it('detects HTTP 403 as permission error', () => {
    expect(isPermissionError({ message: 'CF API returned 403' })).toBe(true);
  });

  it('rejects non-permission errors', () => {
    expect(isPermissionError({ message: 'Internal server error' })).toBe(false);
    expect(isPermissionError({ message: 'Rate limit exceeded' })).toBe(false);
    expect(isPermissionError({ message: 'Invalid query' })).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isPermissionError({ message: 'PERMISSION DENIED' })).toBe(true);
    expect(isPermissionError({ message: 'Access Denied' })).toBe(true);
  });
});

describe('extractDeniedField', () => {
  it('extracts field name from CF permission error', () => {
    expect(extractDeniedField("does not have access to the field 'edgetimetofirstbytems'")).toBe('edgetimetofirstbytems');
  });

  it('extracts field from longer error messages', () => {
    expect(extractDeniedField("User does not have access to the field 'someMetric' on this account")).toBe('someMetric');
  });

  it('returns null for non-matching messages', () => {
    expect(extractDeniedField('You do not have permission to access this resource')).toBeNull();
    expect(extractDeniedField('Internal server error')).toBeNull();
  });
});
