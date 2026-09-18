import { canonicalEvent } from '../contracts/session.ts';
import { createHash } from 'node:crypto';
import canonicalize from 'canonicalize';
import type pg from 'pg';
import { transaction } from '../database/database.ts';
import { batchWrapper, eventId, sourceSchema, RequestFailure } from '../contracts/capability.ts';
import type { Checkpoint, EventResult } from '../contracts/capability.ts';
import { authenticate } from './authentication.ts';
import { registeredSources } from './authority-repository.ts';
import { acceptedReferences, acceptEvent, durableCheckpoint, finalizeRequest, findDisposition, findRequest, saveDisposition, signalCollision } from './repository.ts';

export function digest(value: unknown) {
  return createHash('sha256').update(canonicalize(value)!).digest('hex');
}

export async function ingest(db: pg.Pool, authorization: string | undefined, input: unknown) {
  return transaction(db, async client => {
    const authority = await authenticate(client, authorization);
    const sources = await registeredSources(client, authority);
    const parsed = batchWrapper.safeParse(input);
    if (!parsed.success || parsed.data.events.some(event => !eventId.safeParse(event.event_id).success)) {
      throw new RequestFailure(400, 'malformed_wrapper');
    }
    const batch = parsed.data;
    const requestDigest = digest(input);
    const previousRequest = await findRequest(client, authority.machine_id, batch.request_id);
    if (previousRequest) {
      if (previousRequest.source_ids.some((id: string) => !sources.some(source => source.id === id && source.active))) throw new RequestFailure(403, 'inactive_authority');
      if (previousRequest.digest !== requestDigest) {
        await signalCollision(client, authority.machine_id, 'request_id_collision');
        return { status: 409, body: JSON.stringify({ error: 'request_id_collision' }) };
      }
      return { status: 200, body: previousRequest.response as string };
    }
    const now = new Date();
    if (Math.abs(now.getTime() - Date.parse(batch.issued_at)) > 5 * 60_000) throw new RequestFailure(400, 'request_expired');
    const results: EventResult[] = [];
    const streams = new Map<string, { source_id: string; stream_id: string }>();
    const usedSources = new Set<string>();
    // Capture eligible evidence once, before inserting any sibling ledger rows.
    const references = batch.events.flatMap(raw => {
      const parsed = canonicalEvent.safeParse(raw);
      return parsed.success ? parsed.data.provenance.evidence_refs ?? [] : [];
    });
    const declarations = (await client.query(`SELECT a.*, l.event FROM active_capability_declarations a JOIN canonical_event_ledger l USING (ledger_id) WHERE a.source_id = ANY($1::uuid[])`, [sources.map(source => source.id)])).rows;
    const preBatchReferences = await acceptedReferences(client, authority.workspace_id, references);
    for (const raw of batch.events) {
      const id = raw.event_id as string;
      const claimedSource = raw.source as Record<string, unknown> | undefined;
      const source = sources.find(source => source.id === claimedSource?.source_id && source.active);
      if (!source) {
        results.push({ event_id: id, disposition: 'rejected', reason_code: 'unauthorized_source' });
        continue;
      }
      usedSources.add(source.id);
      const validation = canonicalEvent.safeParse(raw);
      let reason: string | undefined;
      if (raw.workspace_id !== authority.workspace_id || raw.user_id !== authority.user_id || raw.machine_id !== authority.machine_id) reason = 'identity_mismatch';
      else if (raw.schema_version !== '1.0') reason = 'unknown_schema';
      else if (!['capabilities.declared', 'session.started'].includes(raw.event_kind as string)) reason = 'unknown_event_kind';
      else if (!validation.success) {
        const invalidTimestamp = validation.error.issues.some(issue =>
          issue.path[0] === 'occurred_at' || issue.path[0] === 'observed_at' ||
          (issue.path[0] === 'payload' && (issue.path[1] === 'valid_from' || issue.path[1] === 'valid_until')),
        );
        reason = invalidTimestamp ? 'timestamp_invalid' : 'invalid_field';
      }
      else {
        const event = validation.data;
        if (event.source.provider !== source.provider || event.source.adapter_name !== source.adapter_name || (event.event_kind === 'capabilities.declared' && event.payload.provider !== source.provider)) reason = 'identity_mismatch';
        else if (event.privacy.policy_version !== authority.policy_version) reason = 'privacy_policy_violation';
        else if ((Date.parse(event.occurred_at) > now.getTime() + 5 * 60_000 || Date.parse(event.observed_at) > now.getTime() + 5 * 60_000) && event.clock.quality !== 'unsynchronized') reason = 'timestamp_invalid';
        else if (event.event_kind === 'capabilities.declared' && (Date.parse(event.payload.valid_from) > now.getTime() || (event.payload.valid_until && Date.parse(event.payload.valid_until) <= Math.max(now.getTime(), Date.parse(event.payload.valid_from))))) reason = 'timestamp_invalid';
        else if (event.event_kind === 'session.started') {
          const declaration = declarations.find(row => row.source_id === source.id);
          if (!declaration || declaration.declaration_id !== event.capability_snapshot_id ||
              declaration.valid_from.getTime() > now.getTime() || (declaration.valid_until && declaration.valid_until.getTime() <= now.getTime()) ||
              !declaration.event.payload.capabilities.some((value: { name: string; status: string; quality: string }) => value.name === 'session.lifecycle' && value.status === 'available' && value.quality === 'direct')) reason = 'capability_unavailable';
        }
        if (!reason && event.provenance.evidence_refs?.length) {
          if (event.provenance.evidence_refs.some(ref => !preBatchReferences.has(ref))) reason = 'invalid_field';
        }
      }
      const eventDigest = digest(raw);
      const identity = { workspace_id: authority.workspace_id, source_id: source.id, event_id: id };
      const previous = await findDisposition(client, identity);
      const routing = sourceSchema.safeParse(raw.source);
      if (previous) {
        if (previous.digest !== eventDigest) {
          results.push({ event_id: id, disposition: 'rejected', reason_code: 'event_id_collision' });
          await signalCollision(client, authority.machine_id, 'event_id_collision');
        } else {
          results.push({ event_id: id, disposition: previous.disposition === 'accepted' ? 'duplicate' : previous.disposition, ...(previous.reason_code ? { reason_code: previous.reason_code } : {}) });
          if (previous.stream_id) streams.set(`${source.id}:${previous.stream_id}`, { source_id: source.id, stream_id: previous.stream_id });
        }
        continue;
      }
      let ledgerId: string | null = null;
      if (!reason && validation.success) {
        const event = { ...validation.data, received_at: now.toISOString() };
        ledgerId = await acceptEvent(client, event);
      }
      const disposition = ledgerId ? 'accepted' : 'rejected';
      await saveDisposition(client, { ...identity, digest: eventDigest, disposition, reason_code: reason ?? null, ledger_id: ledgerId, stream_id: routing.success ? routing.data.stream_id : null, source_sequence: routing.success ? routing.data.source_sequence : null });
      if (routing.success) streams.set(`${source.id}:${routing.data.stream_id}`, { source_id: source.id, stream_id: routing.data.stream_id });
      results.push({ event_id: id, disposition, ...(reason ? { reason_code: reason } : {}) });
    }
    const checkpoints: Checkpoint[] = [];
    for (const stream of streams.values()) {
      checkpoints.push(await durableCheckpoint(client, stream));
    }
    const body = JSON.stringify({ request_id: batch.request_id, results, checkpoints });
    await finalizeRequest(client, { machine_id: authority.machine_id, request_id: batch.request_id, digest: requestDigest, response: body, source_ids: [...usedSources] });
    return { status: 200, body };
  });
}
