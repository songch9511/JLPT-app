import { z } from 'zod'
import { invalidateEntitlement } from './entitlement'
import type { Config, Deps, Env } from './env'
import { ApiError, json, readJson } from './http'
import { hashId, safeEqual } from './identity'

const MAX_BODY = 64 * 1024

const Ids = z.array(z.string()).max(200).optional().catch(undefined)

// Fields per RevenueCat "Event Types and Fields". Everything is optional except id/type so a new
// event type or a missing field never makes us reject (and thus endlessly retry) a delivery.
const Payload = z.object({
  event: z.object({
    id: z.string().min(1).max(200),
    type: z.string().min(1).max(64),
    event_timestamp_ms: z.number().int().nonnegative().optional(),
    environment: z.string().optional(),
    app_user_id: z.string().optional().nullable(),
    original_app_user_id: z.string().optional().nullable(),
    aliases: Ids,
    transferred_from: Ids,
    transferred_to: Ids,
    entitlement_ids: z.array(z.string()).optional().nullable(),
    entitlement_id: z.string().optional().nullable(),
    cancel_reason: z.string().optional().nullable(),
  }),
})
type Event = z.infer<typeof Payload>['event']

type Action = 'active' | 'inactive' | 'stale'

const GRANT = new Set([
  'INITIAL_PURCHASE',
  'NON_RENEWING_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'PRODUCT_CHANGE',
  'TEMPORARY_ENTITLEMENT_GRANT',
])

function touchesOurEntitlement(e: Event, entitlementId: string): boolean {
  const ids = e.entitlement_ids ?? (e.entitlement_id ? [e.entitlement_id] : null)
  // When the event does not say, assume it might: "stale" only forces a re-check.
  return ids === null || ids.includes(entitlementId)
}

/** What each event means for the stored entitlement of each affected app user id. */
export function plan(e: Event, entitlementId: string): { ids: string[]; action: Action }[] {
  const owner = [e.app_user_id, e.original_app_user_id, ...(e.aliases ?? [])].filter(
    (s): s is string => typeof s === 'string' && s.length > 0,
  )
  if (e.type === 'TEST') return []
  if (e.type === 'TRANSFER') {
    // The purchase moved: the old owner loses it, the new owner gets re-verified against RevenueCat.
    return [
      { ids: e.transferred_from ?? [], action: 'inactive' },
      { ids: e.transferred_to ?? [], action: 'stale' },
    ]
  }
  if (!touchesOurEntitlement(e, entitlementId)) return []
  if (GRANT.has(e.type) && e.entitlement_ids?.includes(entitlementId)) return [{ ids: owner, action: 'active' }]
  // A refund of a non-subscription purchase arrives as CANCELLATION with cancel_reason CUSTOMER_SUPPORT.
  // (RevenueCat's sample events also list a "Refund" sample; REFUND is handled the same way in case
  // it is ever sent as its own type.)
  if (
    e.type === 'EXPIRATION' ||
    e.type === 'REFUND' ||
    (e.type === 'CANCELLATION' && e.cancel_reason === 'CUSTOMER_SUPPORT')
  )
    return [{ ids: owner, action: 'inactive' }]
  return [{ ids: owner, action: 'stale' }]
}

export async function handleWebhook(request: Request, env: Env, cfg: Config, deps: Deps): Promise<Response> {
  const expected = env.REVENUECAT_WEBHOOK_AUTH
  if (!expected) throw new ApiError('misconfigured')
  // RevenueCat sends the dashboard-configured value verbatim in the Authorization header.
  if (!(await safeEqual(request.headers.get('Authorization') ?? '', expected))) throw new ApiError('unauthorized')

  const parsed = Payload.safeParse(await readJson(request, MAX_BODY))
  if (!parsed.success) throw new ApiError('bad_request')
  const e = parsed.data.event
  const now = deps.now()

  if (e.environment === 'SANDBOX' && !cfg.acceptSandboxEvents) return json({ ok: true, ignored: 'sandbox' })

  // Idempotency: RevenueCat retries with the same event id. The id is recorded in the same batch
  // as the state change, so a failed attempt is not marked as done. (Re-applying an event is
  // harmless anyway: same timestamp, same state.)
  const seen = await env.DB.prepare('SELECT 1 AS x FROM webhook_events WHERE event_id = ?1').bind(e.id).first()
  if (seen) return json({ ok: true, duplicate: true })

  const eventMs = e.event_timestamp_ms ?? now
  const stmts: D1PreparedStatement[] = []
  const hashes: string[] = []
  for (const { ids, action } of plan(e, cfg.entitlementId)) {
    for (const id of new Set(ids)) {
      if (id.length > 200) continue
      const h = await hashId(env, 'user', id)
      hashes.push(h)
      // Older events never overwrite newer state (deliveries can arrive out of order).
      stmts.push(
        env.DB.prepare(
          `INSERT INTO entitlements (user_hash, state, source, last_event_ms, updated_at) VALUES (?1, ?2, 'webhook', ?3, ?4)
           ON CONFLICT (user_hash) DO UPDATE SET state = ?2, source = 'webhook', last_event_ms = ?3, updated_at = ?4
           WHERE excluded.last_event_ms >= entitlements.last_event_ms`,
        ).bind(h, action, eventMs, now),
      )
    }
  }
  stmts.push(
    env.DB.prepare('INSERT INTO webhook_events (event_id, received_at) VALUES (?1, ?2) ON CONFLICT (event_id) DO NOTHING').bind(
      e.id,
      now,
    ),
  )
  await env.DB.batch(stmts)
  await Promise.all(hashes.map((h) => invalidateEntitlement(env, h)))
  return json({ ok: true, updated: hashes.length })
}
