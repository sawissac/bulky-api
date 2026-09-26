import type { ApiCall } from '@/lib/types';

/**
 * Fixture data for the component gallery at `/mocks/components`.
 *
 * Nothing here is imported by the app itself — these values exist only so
 * presentational components can be rendered outside a run.
 */

export const MOCK_JSON = {
  id: 'usr_8f21c',
  name: 'Ada Lovelace',
  active: true,
  score: 98.6,
  deletedAt: null,
  roles: ['admin', 'editor'],
  profile: {
    email: 'ada@example.com',
    address: { city: 'London', zip: 'NW1 6XE' },
    tags: [{ key: 'plan', value: 'pro' }],
  },
};

export const MOCK_REQ_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock',
  'X-Request-Id': 'req_01HZX9K2QF',
};

export const MOCK_RES_HEADERS: Record<string, string> = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-ratelimit-remaining': '4998',
};

/** A completed 200 call — the default subject for the tab components. */
export const MOCK_CALL: ApiCall = {
  idx: 0,
  method: 'POST',
  url: 'https://api.example.com/v1/users?expand=profile',
  urlExpr: '`${BASE_URL}/v1/users?expand=profile`',
  status: 'success',
  statusCode: 200,
  response: MOCK_JSON,
  responseHeaders: MOCK_RES_HEADERS,
  requestBody: { name: 'Ada Lovelace', roles: ['admin'] },
  requestHeaders: MOCK_REQ_HEADERS,
  authInfo: { type: 'Bearer Token', token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock' },
  duration: 342,
  error: null,
  timestamp: '2026-08-24T10:12:04.221Z',
  cache: false,
};

/** A failed call — drives the error tone of StatusTab / CallCard / StatusPill. */
export const MOCK_CALL_ERROR: ApiCall = {
  ...MOCK_CALL,
  idx: 1,
  method: 'DELETE',
  url: 'https://api.example.com/v1/users/usr_missing',
  urlExpr: '`${BASE_URL}/v1/users/${id}`',
  status: 'error',
  statusCode: 404,
  response: { error: 'not_found', message: 'No user with that id' },
  requestBody: null,
  authInfo: null,
  duration: 2410,
  error: 'Request failed with status 404',
};

/** A streaming call — RespTab switches to its SSE view when `isSse` is set. */
export const MOCK_CALL_SSE: ApiCall = {
  ...MOCK_CALL,
  idx: 2,
  method: 'SSE',
  url: 'https://api.example.com/v1/chat/stream',
  urlExpr: '`${BASE_URL}/v1/chat/stream`',
  statusCode: 200,
  response: 'data: {"delta":"Hel"}\n\ndata: {"delta":"lo"}\n\ndata: [DONE]\n\n',
  isSse: true,
  duration: 1180,
  sseEvents: [
    { type: 'message', data: '{"delta":"Hel"}', id: '1', ts: 1_756_000_000_000 },
    { type: 'message', data: '{"delta":"lo"}', id: '2', ts: 1_756_000_000_120 },
    { type: 'done', data: '[DONE]', id: '3', ts: 1_756_000_000_300 },
  ],
};

/** A cached call — CallCard renders its cache badge from this. */
export const MOCK_CALL_CACHED: ApiCall = {
  ...MOCK_CALL,
  idx: 3,
  method: 'GET',
  url: 'https://api.example.com/v1/users/usr_8f21c',
  urlExpr: '`${BASE_URL}/v1/users/${id}`',
  duration: 4,
  cache: true,
  note: 'served from cache',
};

export const MOCK_CALLS: ApiCall[] = [MOCK_CALL, MOCK_CALL_CACHED, MOCK_CALL_ERROR, MOCK_CALL_SSE];

/** A finished `api.wait(1500)` step — WaitDivider's resting state. */
export const MOCK_WAIT: ApiCall = {
  ...MOCK_CALL,
  idx: 4,
  method: 'WAIT',
  url: '1500',
  urlExpr: '1500',
  statusCode: null,
  response: null,
  responseHeaders: {},
  requestBody: null,
  requestHeaders: {},
  authInfo: null,
  duration: 1503,
  timestamp: '2026-08-24T10:12:04.563Z',
  note: 'give the export job time to finish',
};

/** An `api.wait(60000)` still running — stamped when the gallery loads, so
 *  its bar and countdown move for the first minute on the page. */
export const MOCK_WAIT_RUNNING: ApiCall = {
  ...MOCK_WAIT,
  idx: 5,
  url: '60000',
  urlExpr: '60000',
  status: 'pending',
  duration: 0,
  timestamp: new Date().toISOString(),
  note: undefined,
};

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD', 'SSE', 'PGSQL', 'DOCS'];

export const STATUS_CODES: (number | null)[] = [null, 200, 201, 301, 400, 404, 429, 500];
