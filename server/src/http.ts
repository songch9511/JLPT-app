/** Error codes the client can branch on. `message` is Korean text the app may show as-is. */
export type ErrorCode =
  | 'bad_request'
  | 'invalid_user'
  | 'unauthorized'
  | 'forbidden_origin'
  | 'not_entitled'
  | 'quota_exceeded'
  | 'rate_limited'
  | 'service_busy'
  | 'upstream_unavailable'
  | 'generation_failed'
  | 'payload_too_large'
  | 'unsupported_media_type'
  | 'not_found'
  | 'method_not_allowed'
  | 'misconfigured'
  | 'internal'

const MESSAGES: Record<ErrorCode, [number, string]> = {
  bad_request: [400, '요청 형식이 올바르지 않아요.'],
  invalid_user: [401, '사용자 정보를 확인하지 못했어요. 앱을 다시 열어 주세요.'],
  unauthorized: [401, '인증에 실패했어요.'],
  forbidden_origin: [403, '허용되지 않은 출처의 요청이에요.'],
  not_entitled: [403, '루마 플러스에서 쓸 수 있는 기능이에요.'],
  quota_exceeded: [429, '오늘 쓸 수 있는 횟수를 다 썼어요. 내일 다시 만들 수 있어요.'],
  rate_limited: [429, '요청이 너무 잦아요. 잠시 후 다시 시도해 주세요.'],
  service_busy: [503, '지금은 이야기를 만들 수 없어요. 잠시 후 다시 시도해 주세요.'],
  upstream_unavailable: [503, '구매 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.'],
  generation_failed: [502, '이야기를 만들지 못했어요. 다시 시도해 주세요.'],
  payload_too_large: [413, '요청이 너무 커요.'],
  unsupported_media_type: [415, 'JSON으로 보내 주세요.'],
  not_found: [404, '없는 경로예요.'],
  method_not_allowed: [405, '지원하지 않는 메서드예요.'],
  misconfigured: [503, '서버 설정을 확인하고 있어요. 잠시 후 다시 시도해 주세요.'],
  internal: [500, '서버 오류가 났어요. 잠시 후 다시 시도해 주세요.'],
}

export class ApiError extends Error {
  readonly status: number
  constructor(
    readonly code: ErrorCode,
    readonly retryAfter?: number,
    /** extra non-sensitive fields for the client (e.g. the quota) */
    readonly extra?: Record<string, unknown>,
  ) {
    super(code)
    this.status = MESSAGES[code][0]
  }
}

const SECURITY_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...SECURITY_HEADERS, ...headers } })
}

export function errorResponse(e: ApiError): Response {
  const [status, message] = MESSAGES[e.code]
  const headers: Record<string, string> = {}
  if (e.retryAfter !== undefined) headers['Retry-After'] = String(Math.max(1, Math.ceil(e.retryAfter)))
  return json({ error: { code: e.code, message, ...(e.extra ?? {}) } }, status, headers)
}

export function emptyResponse(status: number, headers: Record<string, string> = {}): Response {
  const h: Record<string, string> = { ...SECURITY_HEADERS, ...headers }
  delete h['Content-Type']
  return new Response(null, { status, headers: h })
}

// ---- CORS ----

const CORS_MAX_AGE = '600'

/** null: no Origin header (native code, curl, server-to-server). CORS does not apply. */
export function checkOrigin(request: Request, allowed: Set<string>): { origin: string | null; ok: boolean } {
  const origin = request.headers.get('Origin')
  if (origin === null) return { origin: null, ok: true }
  return { origin, ok: allowed.has(origin) }
}

export function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin) return {}
  return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
}

export function preflight(origin: string): Response {
  return emptyResponse(204, {
    ...corsHeaders(origin),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': CORS_MAX_AGE,
  })
}

export function withHeaders(res: Response, headers: Record<string, string>): Response {
  if (!Object.keys(headers).length) return res
  const out = new Response(res.body, res)
  for (const [k, v] of Object.entries(headers)) out.headers.set(k, v)
  return out
}

// ---- body ----

/** Reads at most `maxBytes` of the body, without trusting Content-Length. */
export async function readJson(request: Request, maxBytes: number): Promise<unknown> {
  const type = request.headers.get('Content-Type') ?? ''
  if (!/^application\/json\s*(;|$)/i.test(type)) throw new ApiError('unsupported_media_type')
  const declared = Number(request.headers.get('Content-Length') ?? '0')
  if (declared > maxBytes) throw new ApiError('payload_too_large')
  if (!request.body) throw new ApiError('bad_request')
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      await reader.cancel().catch(() => {})
      throw new ApiError('payload_too_large')
    }
    chunks.push(value)
  }
  const buf = new Uint8Array(size)
  let off = 0
  for (const c of chunks) {
    buf.set(c, off)
    off += c.byteLength
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(buf))
  } catch {
    throw new ApiError('bad_request')
  }
}

// ---- logging ----

/**
 * The only logger. It takes a fixed, closed set of fields so study content (word ids, words,
 * stories) and raw identifiers cannot end up in logs by accident.
 */
export interface LogFields {
  route: string
  status: number
  ms: number
  code?: ErrorCode | 'ok'
  /** first 8 hex chars of the peppered user hash (never the raw app user id) */
  user?: string
  inputTokens?: number
  outputTokens?: number
  costMicros?: number
  event?: string
  detail?: string
}

export function log(f: LogFields): void {
  console.log(JSON.stringify(f))
}
