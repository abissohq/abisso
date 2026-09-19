import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertSafeFixture, assertStaleRunning, assertTransition, parseSseFrame, type Snapshot } from '../tooling/m0-evidence.ts';

const snapshot: Snapshot = { workspace_projection_revision: '2', workstreams: [{
  id: 'workstream', revision: '2', state: 'Active', freshness_status: 'Stale',
  last_meaningful_update_at: null, attention: 'not_evaluated',
  sessions: [{ id: 'session', state: 'Running', latest_evidence_event_id: 'heartbeat', freshness_status: 'Stale', fresh_through_at: '2026-09-19T00:00:00.000Z', revision: '2', ledger_watermark: '3', progress_counter: 7 }],
}] };
const hint = parseSseFrame('event: projection.invalidated\ndata: {"projection_type":"workstream","entity_id":"workstream","revision":"2"}');

test('transition evidence rejects buffered and unrelated invalidations', () => {
  assertTransition(hint, snapshot, '1', 'workstream', 'session', 'heartbeat', 'Running');
  assert.throws(() => assertTransition(hint, snapshot, '2', 'workstream', 'session', 'heartbeat', 'Running'));
  assert.throws(() => assertTransition({ ...hint, data: { ...hint.data, entity_id: 'other' } }, snapshot, '1', 'workstream', 'session', 'heartbeat', 'Running'));
  assert.throws(() => assertTransition(hint, { ...snapshot, workspace_projection_revision: '3' }, '1', 'workstream', 'session', 'heartbeat', 'Running'));
  assert.throws(() => assertTransition(hint, snapshot, '1', 'workstream', 'session', 'wrong-heartbeat', 'Running'));
});

test('stale marker requires unchanged Running lifecycle and no inferred progress', () => {
  assertStaleRunning(snapshot, snapshot, 'workstream', 'session', 'heartbeat');
  assert.throws(() => assertStaleRunning({ ...snapshot, workstreams: [{ ...snapshot.workstreams[0], sessions: [{ ...snapshot.workstreams[0].sessions[0], state: 'Lost' }] }] }, snapshot, 'workstream', 'session', 'heartbeat'));
  assert.throws(() => assertStaleRunning({ ...snapshot, workstreams: [{ ...snapshot.workstreams[0], last_meaningful_update_at: 'later' }] }, snapshot, 'workstream', 'session', 'heartbeat'));
  assert.throws(() => assertStaleRunning({ ...snapshot, workstreams: [{ ...snapshot.workstreams[0], sessions: [{ ...snapshot.workstreams[0].sessions[0], progress_counter: 8 }] }] }, snapshot, 'workstream', 'session', 'heartbeat'));
});

test('accepted fixture scan recursively rejects forbidden fields and classes', () => {
  assertSafeFixture({ payload: { lifecycle_state: 'active' }, privacy: { event_class: 'operational_metadata' } });
  assert.throws(() => assertSafeFixture({ payload: { nested: [{ prompt: 'sentinel' }] } }));
  assert.throws(() => assertSafeFixture({ privacy: { event_class: 'raw_content' } }));
});
