import { v7 } from 'uuid';
import { capabilityBatch } from './capability.ts';
import type { SessionStartedEvent } from '../contracts/session.ts';
export function sessionStartBatch(declaration: string, sequence = 2) {
  const base = capabilityBatch(sequence);
  const { payload: _, ...envelope } = base.events[0];
  const event: SessionStartedEvent = { ...envelope, event_kind: 'session.started', session_id: v7(), capability_snapshot_id: declaration, payload: { lifecycle_state: 'active', start_reason: 'new_session' } };
  return { ...base, events: [event] };
}
