import { v7 } from 'uuid';
import { synthetic } from '../database/bootstrap.ts';
import type { CapabilityEvent } from '../contracts/capability.ts';

export function capabilityBatch(sequence = 1) {
  const now = new Date().toISOString();
  const event: CapabilityEvent = {
    schema_version: '1.0', event_id: v7(), event_kind: 'capabilities.declared',
    workspace_id: synthetic.workspace, user_id: synthetic.user, machine_id: synthetic.machine,
    source: { source_id: synthetic.source, provider: 'abisso', provider_version: '0.1.0', adapter_name: 'synthetic_m0', adapter_version: '0.1.0', stream_id: synthetic.stream, source_sequence: sequence },
    occurred_at: now, observed_at: now, received_at: null,
    clock: { quality: 'synchronized', estimated_error_ms: 0 },
    fact_class: 'observed', provenance: { method: 'provider_local_state', evidence_refs: [] }, confidence: null,
    privacy: { event_class: 'operational_metadata', policy_version: synthetic.policy },
    payload: {
      declaration_id: v7(), provider: 'abisso', valid_from: now,
      capabilities: [
        { name: 'session.lifecycle', status: 'available', quality: 'direct', reason_code: null, freshness_ms: 0 },
        { name: 'session.activity_structured', status: 'available', quality: 'direct', reason_code: null, freshness_ms: 0 },
      ],
    },
    extensions: {},
  };
  return { request_id: v7(), issued_at: now, events: [event] };
}
