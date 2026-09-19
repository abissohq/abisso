import pg from 'pg';
import type { ServerResponse } from 'node:http';
import { projectionInvalidationChannel } from './realtime-channel.ts';

type Invalidation = { schema: string; workspace_id: string; projection_type: 'workstream'; entity_id: string; revision: string };
type Subscription = { workspace: string; authorize: () => Promise<unknown> };

export class Realtime {
  private db: pg.Pool;
  private listener: pg.Client | null = null;
  private streams = new Map<ServerResponse, Subscription>();
  private reconnect: NodeJS.Timeout | null = null;
  private stopped = false;
  constructor(db: pg.Pool) { this.db = db; }

  start() { void this.connect(); }
  get ready() { return this.listener !== null; }

  subscribe(response: ServerResponse, workspace: string, authorize: () => Promise<unknown>) {
    if (!this.ready) return false;
    this.streams.set(response, { workspace, authorize });
    response.on('close', () => this.streams.delete(response));
    response.write('event: stream.ready\ndata: {}\n\n');
    return true;
  }

  private async connect() {
    if (this.stopped || this.listener) return;
    const applicationName = this.db.options.application_name ? `${this.db.options.application_name}_realtime` : 'abisso_realtime';
    const listener = new pg.Client({ ...this.db.options, application_name: applicationName });
    let schema: string | null = null;
    let lost = false;
    const disconnect = () => {
      if (lost) return;
      lost = true;
      if (this.listener === listener) this.listener = null;
      for (const response of this.streams.keys()) response.end();
      this.streams.clear();
      void listener.end().catch(() => {});
      if (!this.stopped) {
        this.reconnect = setTimeout(() => { this.reconnect = null; void this.connect(); }, 250);
        this.reconnect.unref();
      }
    };
    listener.on('error', disconnect);
    listener.on('end', disconnect);
    listener.on('notification', message => {
      if (message.channel !== projectionInvalidationChannel) return;
      let value: Invalidation;
      try { value = JSON.parse(message.payload ?? ''); } catch { return; }
      if (value.schema !== schema || value.projection_type !== 'workstream' || !/^[0-9]+$/.test(value.revision)) return;
      const data = JSON.stringify({ projection_type: value.projection_type, entity_id: value.entity_id, revision: value.revision });
      for (const [response, subscription] of this.streams) if (subscription.workspace === value.workspace_id) {
        void subscription.authorize().then(() => {
          if (!response.destroyed && this.streams.has(response)) response.write(`event: projection.invalidated\ndata: ${data}\n\n`);
        }).catch(() => response.end());
      }
    });
    try {
      await listener.connect();
      schema = (await listener.query<{ schema: string }>('SELECT current_schema() AS schema')).rows[0].schema;
      await listener.query(`LISTEN ${projectionInvalidationChannel}`);
      if (this.stopped || lost) { disconnect(); return; }
      this.listener = listener;
    } catch { disconnect(); }
  }

  async stop() {
    this.stopped = true;
    if (this.reconnect) clearTimeout(this.reconnect);
    for (const response of this.streams.keys()) response.end();
    this.streams.clear();
    const listener = this.listener;
    this.listener = null;
    if (listener) await listener.end().catch(() => {});
  }
}
