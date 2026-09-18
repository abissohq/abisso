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
export const canonicalEvent = z.discriminatedUnion('event_kind', [capabilityEvent, sessionStartedEvent]);
export type SessionStartedEvent = z.infer<typeof sessionStartedEvent>;
export type AcceptedEvent = AcceptedCapabilityEvent | AcceptedSessionStartedEvent;
export type AcceptedSessionStartedEvent = Omit<SessionStartedEvent, 'received_at'> & { received_at: string };
