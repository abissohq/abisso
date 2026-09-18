import { z } from 'zod';

export const profileVersion = 'm0-session-start-v1';
export const uuid = z.uuid();
export const eventId = z.union([z.uuidv7(), z.string().regex(/^(?:evt_)?[0-7][0-9A-HJKMNP-TV-Z]{25}$/)]);
const opaqueId = z.union([uuid, z.string().regex(/^(?:cap|str|evt)_[0-9A-HJKMNP-TV-Z]{26}$/)]);
export const timestamp = z.iso.datetime({ offset: true, precision: undefined }).refine(value => {
  // PostgreSQL input has no year zero and requires offset magnitude below 16 hours.
  // Validation must preserve the original client string for canonical equivalence.
  const offset = /[+-](\d{2}):\d{2}$/.exec(value);
  return !value.startsWith('0000-') && (!offset || Number(offset[1]) < 16) && Number.isFinite(Date.parse(value));
});
const version = z.string().max(128).regex(/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/);
const provider = z.enum(['claude_code', 'codex', 'local_collector', 'abisso']);
const integer = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const sourceSchema = z.strictObject({
  source_id: uuid,
  provider,
  provider_version: version,
  adapter_name: z.enum(['synthetic_m0']),
  adapter_version: version,
  stream_id: opaqueId,
  source_sequence: integer.min(1),
});
export const capabilityNames = [
  'session.lifecycle', 'session.waiting_structured', 'session.activity_structured',
  'tool.boundaries', 'file.touch_metadata', 'check.results', 'usage.tokens',
  'cost.provider_reported', 'git.local_context', 'source.sequence',
] as const;
const capability = z.strictObject({
  name: z.enum(capabilityNames),
  status: z.enum(['available', 'unavailable', 'excluded', 'not_collected', 'unknown']),
  quality: z.enum(['direct', 'derived', 'none']),
  reason_code: z.enum(['unsupported', 'policy_excluded', 'not_collected', 'unknown']).nullable(),
  freshness_ms: integer,
});
export const capabilityEvent = z.strictObject({
  schema_version: z.literal('1.0'),
  event_id: eventId,
  event_kind: z.literal('capabilities.declared'),
  workspace_id: uuid,
  user_id: uuid,
  machine_id: uuid,
  source: sourceSchema,
  occurred_at: timestamp,
  observed_at: timestamp,
  received_at: z.null(),
  clock: z.strictObject({
    quality: z.enum(['synchronized', 'estimated', 'unsynchronized', 'unknown']),
    estimated_error_ms: integer.optional(),
  }),
  fact_class: z.literal('observed'),
  provenance: z.strictObject({
    method: z.enum(['provider_structured_event', 'provider_status_api', 'provider_local_state', 'process_observation', 'filesystem_metadata', 'git_command_metadata', 'collector_timer', 'server_derivation']),
    evidence_refs: z.array(eventId).max(32).optional(),
  }),
  confidence: z.null(),
  privacy: z.strictObject({ event_class: z.literal('operational_metadata'), policy_version: z.string().regex(/^[a-z0-9-]{1,64}$/) }),
  payload: z.strictObject({
    declaration_id: opaqueId,
    provider,
    capabilities: z.array(capability).min(1).max(10).refine(values => new Set(values.map(value => value.name)).size === values.length),
    valid_from: timestamp,
    valid_until: timestamp.optional(),
  }),
  extensions: z.strictObject({}),
});
export type CapabilityEvent = z.infer<typeof capabilityEvent>;
export type AcceptedCapabilityEvent = Omit<CapabilityEvent, 'received_at'> & { received_at: string };

export const batchWrapper = z.strictObject({
  request_id: z.uuidv7(),
  issued_at: timestamp,
  events: z.array(z.record(z.string(), z.unknown())).min(1).max(200),
});
export type Batch = z.infer<typeof batchWrapper>;
export type EventResult = { event_id: string; disposition: 'accepted' | 'duplicate' | 'rejected' | 'quarantined'; reason_code?: string };
export type Checkpoint = { source_id: string; stream_id: string; highest_durable_sequence: number };

export class RequestFailure extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}
