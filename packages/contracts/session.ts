import { z } from 'zod';
import type { AcceptedCapabilityEvent } from './capability.ts';
import { capabilityEvent, uuid } from './capability.ts';

const sessionId = z.union([uuid, z.string().regex(/^ses_[0-9A-HJKMNP-TV-Z]{26}$/)]);
const reference = z.union([uuid, z.string().regex(/^(?:repo|wt)_[0-9A-HJKMNP-TV-Z]{26}$/)]);
export const sessionStartedEvent = capabilityEvent.extend({
  event_kind: z.literal('session.started'),
  session_id: sessionId,
  capability_snapshot_id: capabilityEvent.shape.payload.shape.declaration_id,
  payload: z.strictObject({
    lifecycle_state: z.literal('active'),
    start_reason: z.enum(['new_session', 'resumed_session', 'unknown']),
    provider_mode: z.enum(['interactive', 'non_interactive', 'unknown']).optional(),
    worktree_ref: reference.optional(),
    repo_ref: reference.optional(),
  }),
});
export const sessionActivityEvent = sessionStartedEvent.extend({
  event_kind: z.literal('session.activity'),
  payload: z.strictObject({
    activity_class: z.literal('heartbeat'),
    progress_counter: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    availability: z.literal('available'),
  }),
});
export const sessionCompletedEvent = sessionStartedEvent.extend({
  event_kind: z.literal('session.completed'),
  payload: z.strictObject({
    result: z.literal('completed'),
    duration_ms: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
    output_artifact_count: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
  }),
});
export const canonicalEvent = z.discriminatedUnion('event_kind', [capabilityEvent, sessionStartedEvent, sessionActivityEvent, sessionCompletedEvent]);
export type SessionStartedEvent = z.infer<typeof sessionStartedEvent>;
export type SessionActivityEvent = z.infer<typeof sessionActivityEvent>;
export type AcceptedEvent = AcceptedCapabilityEvent | AcceptedSessionStartedEvent | AcceptedSessionActivityEvent | AcceptedSessionCompletedEvent;
export type AcceptedSessionStartedEvent = Omit<SessionStartedEvent, 'received_at'> & { received_at: string };
export type AcceptedSessionActivityEvent = Omit<SessionActivityEvent, 'received_at'> & { received_at: string };
export type SessionCompletedEvent = z.infer<typeof sessionCompletedEvent>;
export type AcceptedSessionCompletedEvent = Omit<SessionCompletedEvent, 'received_at'> & { received_at: string };
