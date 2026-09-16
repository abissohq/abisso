import type { AcceptedCapabilityEvent } from '../contracts/capability.ts';

export const projectorVersion = 'm0-capabilities-v1';

export function projectCapability(ledgerId: string, event: AcceptedCapabilityEvent) {
  if (event.event_kind !== 'capabilities.declared') throw new Error('unsupported_projection');
  return {
    source_id: event.source.source_id,
    declaration_id: event.payload.declaration_id,
    ledger_id: ledgerId,
    projector_version: projectorVersion,
  };
}
