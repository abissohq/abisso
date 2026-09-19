import assert from 'node:assert/strict';

export type Invalidation = { event: string; data: { projection_type?: string; entity_id?: string; revision?: string } };
type Session = { id: string; state: string; latest_evidence_event_id: string; freshness_status: string; fresh_through_at: string;
  revision: string; ledger_watermark: string; progress_counter?: number };
type Workstream = { id: string; state: string; revision: string; freshness_status: string; sessions: Session[]; last_meaningful_update_at: string | null; attention: string };
export type Snapshot = { workspace_projection_revision: string; workstreams: Workstream[] };

export function parseSseFrame(frame: string): Invalidation {
  const event = /^event: (.+)$/m.exec(frame)?.[1];
  const data = /^data: (.+)$/m.exec(frame)?.[1];
  assert.ok(event && data, 'SSE event and data required');
  return { event, data: JSON.parse(data) };
}

export function assertTransition(hint: Invalidation, snapshot: Snapshot, previousRevision: string,
  workstreamId: string, sessionId: string, evidenceEventId: string, state: 'Starting' | 'Running') {
  assert.equal(hint.event, 'projection.invalidated');
  assert.equal(hint.data.projection_type, 'workstream');
  assert.equal(hint.data.entity_id, workstreamId);
  assert.match(hint.data.revision ?? '', /^[0-9]+$/);
  assert.ok(BigInt(hint.data.revision!) > BigInt(previousRevision), 'transition requires a new projection revision');
  assert.equal(snapshot.workspace_projection_revision, hint.data.revision);
  const row = snapshot.workstreams.find(value => value.id === workstreamId);
  assert.ok(row, 'expected Workstream missing');
  assert.equal(row.revision, hint.data.revision);
  assert.equal(row.state, 'Active');
  const session = row.sessions.find(value => value.id === sessionId);
  assert.ok(session, 'expected Session missing');
  assert.equal(session.state, state);
  assert.equal(session.latest_evidence_event_id, evidenceEventId);
  return { row, session };
}

export function assertStaleRunning(snapshot: Snapshot, running: Snapshot, workstreamId: string, sessionId: string, evidenceEventId: string) {
  assert.equal(snapshot.workspace_projection_revision, running.workspace_projection_revision);
  const row = snapshot.workstreams.find(value => value.id === workstreamId);
  const priorRow = running.workstreams.find(value => value.id === workstreamId);
  assert.ok(row, 'expected Workstream missing');
  assert.ok(priorRow, 'prior Workstream missing');
  const session = row.sessions.find(value => value.id === sessionId);
  const priorSession = priorRow.sessions.find(value => value.id === sessionId);
  assert.ok(session, 'expected Session missing');
  assert.ok(priorSession, 'prior Session missing');
  assert.equal(row.revision, priorRow.revision);
  assert.equal(session.revision, priorSession.revision);
  assert.equal(session.ledger_watermark, priorSession.ledger_watermark);
  assert.equal(session.progress_counter, priorSession.progress_counter);
  assert.equal(row.freshness_status, 'Stale');
  assert.equal(session.freshness_status, 'Stale');
  assert.equal(session.state, 'Running');
  assert.equal(row.state, 'Active');
  assert.equal(session.latest_evidence_event_id, evidenceEventId);
  assert.equal(row.last_meaningful_update_at, null);
  assert.equal(row.attention, 'not_evaluated');
}

export function assertSafeFixture(value: unknown, path = 'fixture'): void {
  if (Array.isArray(value)) { value.forEach((item, index) => assertSafeFixture(item, `${path}[${index}]`)); return; }
  if (value === null || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert.doesNotMatch(key, /^(?:prompt|message_body|message_content|command|terminal_transcript|output|clipboard|keystrokes|screenshot|file_content|raw_source|secret)$/i, `forbidden fixture field at ${path}`);
    if (key === 'event_class') assert.ok(['operational_metadata', 'pseudonymous_identifier'].includes(String(child)), `forbidden fixture class at ${path}`);
    assertSafeFixture(child, `${path}.${key}`);
  }
}
