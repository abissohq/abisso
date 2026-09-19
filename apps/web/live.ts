import { createElement as h, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LiveSynchronization } from '../../packages/live/synchronization.ts';

type Evidence = { latest_evidence_event_id: string; latest_observed_at: string; latest_received_at: string; latest_source_contact_at?: string; fresh_through_at?: string; freshness_status?: string; freshness_policy_version?: string; revision: string; ledger_watermark: string };
type Session = Evidence & { id: string; provider: string; state: string; started_at: string; progress_counter?: number; identity_provenance: { fact_class: string; source_id: string; event_id: string }; membership_provenance: { fact_class: string; resolver_version: string; confidence: { score: number; band: string } } };
type Workstream = Evidence & { id: string; label: string; state: string; created_at: string; identity_scheme_version: string; created_from_source_id: string; created_from_event_id: string; last_meaningful_update_at: null; repository: string; branch: string; cost: string; attention: string; sessions: Session[] };
type Snapshot = { workspace_projection_revision: string; server_now: string; workstreams: Workstream[]; browser_read_at?: number };
function fields(values: Record<string, string | null>) {
  return h('dl', null, ...Object.entries(values).flatMap(([key, value]) => [h('dt', { key: `${key}:name` }, key), h('dd', { key: `${key}:value` }, value === null ? 'null' : value)]));
}
function evidence(row: Evidence, freshness: string) {
  return fields({ 'Latest evidence': row.latest_evidence_event_id, 'Observed at': row.latest_observed_at, 'Received at': row.latest_received_at,
    'Source contact': row.latest_source_contact_at ?? null, 'Fresh through': row.fresh_through_at ?? null,
    'Evidence freshness': freshness, 'Freshness policy': row.freshness_policy_version ?? null,
    Revision: row.revision, 'Ledger watermark': row.ledger_watermark });
}
export function LiveView({ snapshot, now = typeof performance === 'undefined' ? Date.now() : performance.now() }: { snapshot: Snapshot; now?: number }) {
  const presentedFreshness = (row: Evidence) => row.freshness_status === 'Stale' || (row.fresh_through_at &&
    Date.parse(snapshot.server_now) + Math.max(0, now - (snapshot.browser_read_at ?? Date.parse(snapshot.server_now))) > Date.parse(row.fresh_through_at)) ? 'Stale' : row.freshness_status ?? 'Unknown';
  return h('section', null,
    h('p', null, `Workspace revision ${snapshot.workspace_projection_revision} · Read at ${snapshot.server_now}`),
    snapshot.workstreams.length === 0 ? h('p', null, 'No projected Workstreams yet.') : null,
    ...snapshot.workstreams.map(w => h('article', { key: w.id },
      h('h2', null, w.label), h('p', null, `${w.state} · Provisional Workstream · Evidence ${presentedFreshness(w)}`),
      fields({ ID: w.id, 'Created at': w.created_at, 'Identity scheme': w.identity_scheme_version, 'Founding source': w.created_from_source_id, 'Founding event': w.created_from_event_id,
        'Last meaningful update': w.last_meaningful_update_at, Repository: w.repository, Branch: w.branch, Cost: w.cost, Attention: w.attention }), evidence(w, presentedFreshness(w)),
      ...w.sessions.map(s => h('section', { key: s.id }, h('h3', null, `${s.provider} · ${s.state} · Evidence ${presentedFreshness(s)}`),
        fields({ 'Session ID': s.id, 'Started at': s.started_at, Identity: s.identity_provenance.fact_class, 'Identity source': s.identity_provenance.source_id, 'Identity evidence': s.identity_provenance.event_id,
          Membership: s.membership_provenance.fact_class, Resolver: s.membership_provenance.resolver_version, Confidence: `${s.membership_provenance.confidence.band} (${s.membership_provenance.confidence.score})`,
          'Observed progress counter': s.progress_counter === undefined ? null : String(s.progress_counter) }), evidence(s, presentedFreshness(s)))),
    )),
  );
}
function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState('');
  const [synchronized, setSynchronized] = useState(false);
  const [now, setNow] = useState(() => performance.now());
  const [sync] = useState(() => new LiveSynchronization<Snapshot>(async () => {
    const readStarted = performance.now();
    const response = await fetch('/v1/live', { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) throw new Error('live_unavailable');
    return { ...await response.json(), browser_read_at: readStarted };
  }, (value, ready) => { setSnapshot(value); setSynchronized(ready); if (ready) setError(''); }, () => setError('Live could not be synchronized.')));
  useEffect(() => {
    const stream = new EventSource('/v1/live/events');
    stream.addEventListener('stream.ready', () => sync.ready());
    stream.addEventListener('projection.invalidated', event => {
      try { sync.invalidated(JSON.parse((event as MessageEvent).data)); } catch { /* malformed hint */ }
    });
    stream.onerror = () => sync.disconnected();
    const tick = setInterval(() => setNow(performance.now()), 1000);
    return () => { clearInterval(tick); stream.close(); sync.disconnected(); };
  }, [sync]);
  return h('main', null, h('h1', null, 'Abisso Live'), h('p', null, 'Needs Attention not evaluated in M0'),
    h('a', { href: '/dev/login' }, 'Local synthetic sign in'), ' ', h('button', { onClick: () => sync.reread() }, 'Reread Live'),
    h('p', null, synchronized ? 'Live synchronized' : 'Live resynchronizing'),
    error ? h('p', { role: 'alert' }, error) : null, snapshot ? h(LiveView, { snapshot, now }) : null);
}
if (typeof document !== 'undefined') {
  const root = document.getElementById('root');
  if (root) createRoot(root).render(h(App));
  const form = document.getElementById('login') as HTMLFormElement | null;
  form?.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('button')!;
    button.disabled = true;
    try {
      const values = new URLSearchParams();
      for (const [key, value] of new FormData(form)) if (typeof value === 'string') values.append(key, value);
      const response = await fetch(form.action, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: values });
      if (!response.ok) throw new Error('login_failed');
      const result = await response.json();
      if (result.code) {
        const input = document.createElement('input'); input.type = 'hidden'; input.name = 'code'; input.value = result.code;
        form.append(input); form.action = '/dev/login/exchange'; button.textContent = 'Sign in to synthetic workspace';
      } else window.location.assign('/');
    } catch { document.getElementById('login-error')!.textContent = 'Sign in failed. Reload to begin again.'; }
    finally { button.disabled = false; }
  });
}
