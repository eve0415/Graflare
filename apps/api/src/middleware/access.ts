import type { AppEnv } from '../index';
import type { Context, MiddlewareHandler } from 'hono';

export interface AccessJwtPayload {
  email: string;
  name?: string;
  sub: string;
  iss: string;
  aud: string[];
  exp: number;
  iat: number;
}

interface JwtHeader {
  kid: string;
  alg: string;
}

interface AccessJwk {
  kid: string;
  jwk: JsonWebKey;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const requireString = (value: unknown, field: string): string => {
  if (typeof value !== 'string') {
    throw new TypeError(`Expected string for ${field}`);
  }
  return value;
};

const requireNumber = (value: unknown, field: string): number => {
  if (typeof value !== 'number') {
    throw new TypeError(`Expected number for ${field}`);
  }
  return value;
};

const requireStringArray = (value: unknown, field: string): string[] => {
  if (!Array.isArray(value)) {
    throw new TypeError(`Expected array for ${field}`);
  }
  return value.map((item, index) => requireString(item, `${field}[${index}]`));
};

const parseJwtHeader = (raw: unknown): JwtHeader => {
  if (!isRecord(raw)) {
    throw new Error('Invalid JWT header');
  }
  return {
    kid: requireString(raw.kid, 'kid'),
    alg: requireString(raw.alg, 'alg'),
  };
};

const parseAccessJwtPayload = (raw: unknown): AccessJwtPayload => {
  if (!isRecord(raw)) {
    throw new Error('Invalid JWT payload');
  }
  return {
    email: requireString(raw.email, 'email'),
    sub: requireString(raw.sub, 'sub'),
    iss: requireString(raw.iss, 'iss'),
    aud: requireStringArray(raw.aud, 'aud'),
    exp: requireNumber(raw.exp, 'exp'),
    iat: requireNumber(raw.iat, 'iat'),
    ...(typeof raw.name === 'string' && { name: raw.name }),
  };
};

const parseAccessJwk = (raw: unknown): AccessJwk => {
  if (!isRecord(raw)) {
    throw new Error('Invalid JWK');
  }
  const jwk: JsonWebKey = {
    kty: requireString(raw.kty, 'kty'),
    n: requireString(raw.n, 'n'),
    e: requireString(raw.e, 'e'),
    alg: requireString(raw.alg, 'alg'),
    use: requireString(raw.use, 'use'),
  };
  return { kid: requireString(raw.kid, 'kid'), jwk };
};

const parseCertsResponse = (raw: unknown): AccessJwk[] => {
  if (!isRecord(raw)) {
    throw new Error('Invalid certs response');
  }
  if (!Array.isArray(raw.keys)) {
    throw new TypeError('Invalid certs response: keys');
  }
  return raw.keys.map(parseAccessJwk);
};

let cachedKeys: { keys: Map<string, CryptoKey>; expiresAt: number } | null = null;

const getPublicKeys = async (teamDomain: string): Promise<Map<string, CryptoKey>> => {
  if (cachedKeys && Date.now() < cachedKeys.expiresAt) {
    return cachedKeys.keys;
  }

  const res = await fetch(`https://${teamDomain}.cloudflareaccess.com/cdn-cgi/access/certs`);
  if (!res.ok) {
    throw new Error(`Failed to fetch Access certs: ${res.status}`);
  }

  const jwks = parseCertsResponse(await res.json());

  const imported = await Promise.all(
    jwks.map(async ({ kid, jwk }) => {
      const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
      return [kid, key] as const;
    }),
  );

  const keys = new Map<string, CryptoKey>(imported);

  cachedKeys = { keys, expiresAt: Date.now() + 5 * 60 * 1000 };
  return keys;
};

const base64UrlToString = (segment: string): string => atob(segment.replaceAll('-', '+').replaceAll('_', '/'));

const decodeJwtPayload = (token: string): { header: JwtHeader; payload: AccessJwtPayload } => {
  const parts = token.split('.');
  const [headerPart, payloadPart] = parts;
  if (parts.length !== 3 || headerPart === undefined || payloadPart === undefined) {
    throw new Error('Invalid JWT format');
  }

  const header = parseJwtHeader(JSON.parse(base64UrlToString(headerPart)));
  const payload = parseAccessJwtPayload(JSON.parse(base64UrlToString(payloadPart)));

  return { header, payload };
};

export const verifyJwt = async (token: string, teamDomain: string, expectedAud?: string): Promise<AccessJwtPayload> => {
  const { header, payload } = decodeJwtPayload(token);

  if (payload.exp < Date.now() / 1000) {
    throw new Error('Token expired');
  }

  const expectedIss = `https://${teamDomain}.cloudflareaccess.com`;
  if (payload.iss !== expectedIss) {
    throw new Error('Bad issuer');
  }

  if (expectedAud !== undefined && !payload.aud.includes(expectedAud)) {
    throw new Error('Bad audience');
  }

  const keys = await getPublicKeys(teamDomain);
  const key = keys.get(header.kid);
  if (!key) {
    throw new Error('Unknown signing key');
  }

  const parts = token.split('.');
  const [headerPart, payloadPart, signaturePart] = parts;
  if (headerPart === undefined || payloadPart === undefined || signaturePart === undefined) {
    throw new Error('Invalid JWT format');
  }

  const data = new TextEncoder().encode(`${headerPart}.${payloadPart}`);
  const signature = Uint8Array.from(base64UrlToString(signaturePart), c => c.codePointAt(0) ?? 0);

  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, data);

  if (!valid) {
    throw new Error('Invalid signature');
  }

  return payload;
};

export const accessMiddleware = (): MiddlewareHandler<AppEnv> => async (c: Context<AppEnv>, next) => {
  const jwt = c.req.header('CF-Access-JWT-Assertion');
  if (jwt === undefined) {
    return c.json({ error: 'Missing Access JWT' }, 401);
  }

  let payload: AccessJwtPayload;
  try {
    payload = await verifyJwt(jwt, c.env.ACCESS_TEAM_DOMAIN, c.env.ACCESS_AUD);
  } catch {
    return c.json({ error: 'Invalid Access JWT' }, 401);
  }

  c.set('user', {
    email: payload.email,
    name: payload.name ?? payload.email,
  });

  return next();
};
