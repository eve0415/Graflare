import { getRequest } from '@tanstack/react-start/server';

export const getAccessJwt = (): string => {
  if (import.meta.env.DEV) return '';
  const jwt = getRequest().headers.get('CF-Access-JWT-Assertion');
  if (!jwt) throw new Error('Missing Access JWT');
  return jwt;
};
