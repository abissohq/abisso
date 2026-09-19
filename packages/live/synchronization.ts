export type LiveSnapshot = { workspace_projection_revision: string; server_now: string; workstreams: unknown[] };
export type LiveInvalidation = { projection_type: string; entity_id: string; revision: string };

// ADR 0002: a ready stream establishes delivery before the first snapshot read.
// Every connection generation has its own reconciliation; old HTTP responses
// cannot publish after a reconnect, and revisions never move backwards.
export class LiveSynchronization<T extends LiveSnapshot> {
  private read: () => Promise<T>;
  private publish: (snapshot: T | null, synchronized: boolean) => void;
  private failed: () => void;
  private generation = 0;
  private pending = 0n;
  private displayed = -1n;
  private current: T | null = null;
  private running = false;
  private again = false;
  private connected = false;

  constructor(read: () => Promise<T>, publish: (snapshot: T | null, synchronized: boolean) => void,
    failed: () => void) { this.read = read; this.publish = publish; this.failed = failed; }

  ready() {
    this.generation++;
    this.connected = true;
    this.pending = 0n;
    this.running = false;
    this.publish(this.current, false);
    void this.reconcile(this.generation);
  }

  disconnected() {
    this.generation++;
    this.connected = false;
    this.running = false;
    this.publish(this.current, false);
  }

  invalidated(message: LiveInvalidation) {
    if (!this.connected) return;
    if (!/^[0-9]+$/.test(message.revision)) return;
    const revision = BigInt(message.revision);
    if (revision <= this.displayed) return;
    if (revision > this.pending) this.pending = revision;
    this.publish(this.current, false);
    if (this.running) this.again = true;
    else void this.reconcile(this.generation);
  }

  reread() {
    if (!this.connected) return;
    if (this.running) this.again = true;
    else void this.reconcile(this.generation);
  }

  private async reconcile(generation: number) {
    if (!this.connected) return;
    if (this.running) { this.again = true; return; }
    this.running = true;
    let staleReads = 0;
    try {
      do {
        this.again = false;
        const snapshot = await this.read();
        if (generation !== this.generation) return;
        const revision = BigInt(snapshot.workspace_projection_revision);
        if (revision >= this.displayed) {
          this.displayed = revision;
          this.current = snapshot;
        } else if (++staleReads >= 3) throw new Error('stale_snapshot');
        else this.again = true;
        if (revision < this.pending) this.again = true;
      } while (this.again && generation === this.generation);
      if (generation === this.generation && this.connected) this.publish(this.current, true);
    } catch {
      if (generation === this.generation) { this.publish(this.current, false); this.failed(); }
    } finally {
      if (generation === this.generation) this.running = false;
    }
  }
}
