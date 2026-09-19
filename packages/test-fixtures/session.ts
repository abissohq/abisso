import { v7 } from 'uuid';
import { capabilityBatch } from './capability.ts';
import type { SessionActivityEvent, SessionStartedEvent } from '../contracts/session.ts';
export function sessionStartBatch(declaration: string, sequence = 2) {
  const base = capabilityBatch(sequence);
  const { payload: _, ...envelope } = base.events[0];
  const event: SessionStartedEvent = { ...envelope, event_kind: 'session.started', session_id: v7(), capability_snapshot_id: declaration, payload: { lifecycle_state: 'active', start_reason: 'new_session' } };
  return { ...base, events: [event] };
}
export function heartbeatBatch(start: SessionStartedEvent, sequence = start.source.source_sequence + 1, progressCounter = 7) {
  const now = new Date().toISOString();
  const event: SessionActivityEvent = { ...start, event_id: v7(), event_kind: 'session.activity',
    source: { ...start.source, source_sequence: sequence }, occurred_at: now, observed_at: now,
    payload: { activity_class: 'heartbeat', progress_counter: progressCounter, availability: 'available' } };
  return { request_id: v7(), issued_at: now, events: [event] };
}
