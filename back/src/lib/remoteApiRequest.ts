/**
 * Transparent client for JSON requests to a remote backend service.
 * Copy-friendly: zero dependencies (global fetch), config comes from envs.
 *
 *   remoteApiRequest({
 *     urlEnv: 'TOTP_BACK_URL',
 *     method: 'POST',
 *     path: '/tokens/5/verify',
 *     params: { code: '123456' },
 *   });
 *
 * Env convention derived from urlEnv (e.g. 'TOTP_BACK_URL'):
 *   <URL_ENV>          base URL of the remote service  = getConfig         Values
 *   <URL_ENV>_USER     optional service-account email  (POST {base}/auth/login)
 *   <URL_ENV>_PASSWORD optional service-account password
 *
 * If both user + password are set, the module transparently logs the user in,
 * caches the JWT, and re-logs-in once when a cached token is rejected (401).
 *
 * HTTP statuses are returned as-is ({ status, data }) so the caller decides.
 * Transport/timeout failures throw RemoteApiError with code:
 *   REMOTE_UNREACHABLE   connection/timeout/DNS/abort
 *   REMOTE_SERVER_ERROR  login/token problems, non-JSON server replies
 */
import { logger } from './logger.js';

export type RemoteApiMethod = 'GET' | 'POST';

export interface RemoteApiOptions {
  /** Name of the env var holding the remote base URL (e.g. 'TOTP_BACK_URL'). */
  urlEnv: string;
  method: RemoteApiMethod;
  /** Request path relative to the base URL (e.g. '/tokens/5/verify'). */
  path: string;
  /** JSON body for POST requests. */
  params?: Record<string, unknown>;
  /** Timeout in ms. Default 10_000. */
  timeout?: number;
}

export interface RemoteApiResult<T = unknown> {
  status: number;
  data: T;
}

export type RemoteApiErrorCode = 'REMOTE_UNREACHABLE' | 'REMOTE_SERVER_ERROR';

export class RemoteApiError extends Error {
  readonly code: RemoteApiErrorCode;
  readonly status: number | undefined;

  constructor(code: RemoteApiErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'RemoteApiError';
    this.code = code;
    this.status = status;
  }
}

const JWT_LIFETIME_MS = 6 * 24 * 60 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 10_000;

interface EnvConfig {
  base: string;
  user?: string;
  password?: string;
}

/** Token cache per base urlEnv. */
const authCache = new Map<string, { token: string; expiresAt: number }>();

function readConfig(urlEnv: string): EnvConfig {
  const raw = process.env[urlEnv];
  if (!raw) {
    throw new RemoteApiError('REMOTE_UNREACHABLE', `Remote base URL env "${urlEnv}" is not configured`);
  }
  const prefix = urlEnv.replace(/_URL$/, '');
  const user = process.env[`${prefix}_USER`];
  const password = process.env[`${prefix}_PASSWORD`];
  return { base: raw.replace(/\/+$/, ''), user, password };
}

function describe(urlEnv: string): string {
  return urlEnv.replace(/_URL$/, '');
}

async function login(config: EnvConfig, urlEnv: string): Promise<string> {
  const { base, user, password } = config;
  if (!user || !password) return '';
  const service = describe(urlEnv);
  try {
    const res = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: user, password }),
    });
    if (!res.ok) {
      const msg = `remote login failed for ${service} (status ${res.status})`;
      logger.error(`[remote] ${msg}`);
      throw new RemoteApiError('REMOTE_SERVER_ERROR', msg, res.status);
    }
    const body = (await res.json().catch(() => ({}))) as { token?: string };
    if (!body.token) throw new RemoteApiError('REMOTE_SERVER_ERROR', `remote login returned no token (${service})`);
    authCache.set(urlEnv, { token: body.token, expiresAt: Date.now() + JWT_LIFETIME_MS });
    logger.log(`[remote] login OK for ${service}`);
    return body.token;
  } catch (error) {
    if (error instanceof RemoteApiError) throw error;
    const msg = `remote login failed for ${service}: ${(error as Error).message}`;
    logger.error(`[remote] ${msg}`);
    throw new RemoteApiError('REMOTE_UNREACHABLE', msg);
  }
}

async function getToken(config: EnvConfig, urlEnv: string): Promise<string> {
  if (!config.user || !config.password) return '';
  const cached = authCache.get(urlEnv);
  if (cached && cached.expiresAt > Date.now()) return cached.token;
  authCache.delete(urlEnv);
  return login(config, urlEnv);
}

async function send(config: EnvConfig, token: string, options: RemoteApiOptions): Promise<RemoteApiResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout ?? DEFAULT_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(`${config.base}${options.path}`, {
      method: options.method,
      headers,
      body: options.params !== undefined ? JSON.stringify(options.params) : undefined,
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => undefined)) as unknown;
    return { status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

export async function remoteApiRequest<T = unknown>(options: RemoteApiOptions): Promise<RemoteApiResult<T>> {
  const config = readConfig(options.urlEnv);
  const service = describe(options.urlEnv);

  const cached = config.user && config.password ? authCache.get(options.urlEnv) : undefined;
  const useCached = !!cached && cached.expiresAt > Date.now();
  const token = useCached ? (cached!.token) : await getToken(config, options.urlEnv);

  let result: RemoteApiResult;
  try {
    result = await send(config, token, options);
    if (result.status === 401 && useCached) {
      // cached token rejected -> fresh login and one retry
      authCache.delete(options.urlEnv);
      const fresh = await login(config, options.urlEnv);
      result = await send(config, fresh, options);
    }
    if (result.status >= 500) {
      logger.error(`[remote] ${service} replied ${result.status} for ${options.method} ${options.path}`);
    }
    return result as RemoteApiResult<T>;
  } catch (error) {
    if (error instanceof RemoteApiError) throw error;
    const abort = (error as Error).name === 'AbortError';
    const msg = abort
      ? `remote request timed out (${service} ${options.method} ${options.path})`
      : `remote request failed (${service} ${options.method} ${options.path}): ${(error as Error).message}`;
    logger.error(`[remote] ${msg}`);
    throw new RemoteApiError('REMOTE_UNREACHABLE', msg);
  }
}