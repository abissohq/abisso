import { closeSync, constants, fstatSync, ftruncateSync, openSync, readSync, renameSync, statSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import type { Status } from './ipc.ts';

const codes = ['collector_ready', 'collector_start_failed', 'collector_cleanup_failed', 'collector_crashed', 'ipc_rejected'] as const;
export type DiagnosticCode = typeof codes[number];
const names = ['diagnostics.0.log', 'diagnostics.1.log'] as const;
const allowedStatus = { version: 1, state: 'inactive', enrollment: 'unenrolled', collection: 'stopped' } as const;
const maximumLogBytes = 32 * 1024;
export const MAX_DIAGNOSTIC_EXPORT_BYTES = 128 * 1024;
const retentionMs = 7 * 86_400_000;

type RecordShape = { code: DiagnosticCode; hour: number; count?: number; queue_age_s?: number; queue_bytes?: number; duration_ms?: number };

function bounded(value: unknown, maximum: number): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.min(Math.floor(value), maximum) : undefined;
}

function safeRecord(code: DiagnosticCode, hour: unknown, values: Record<string, unknown> = {}): RecordShape {
  if (!codes.includes(code)) throw new Error('invalid_diagnostic_code');
  if (!Number.isInteger(hour) || (hour as number) < 0 || (hour as number) > 1_000_000) throw new Error('invalid_diagnostic_hour');
  const result: RecordShape = { code, hour: hour as number };
  for (const [field, maximum] of Object.entries({ count: 1_000_000, queue_age_s: 2_592_000, queue_bytes: 1_000_000_000, duration_ms: 60_000 })) {
    const value = bounded(values[field], maximum);
    if (value !== undefined) Object.assign(result, { [field]: value });
  }
  return result;
}

function validateLogFd(fd: number): void {
  const info = fstatSync(fd);
  if (!info.isFile() || info.uid !== process.getuid?.() || (info.mode & 0o777) !== 0o600) throw new Error('diagnostic_read_failed');
  if (info.size > maximumLogBytes) throw new Error('diagnostic_scan_failed');
}

function readOpenedLog(fd: number): RecordShape[] {
  validateLogFd(fd);
  const buffer = Buffer.allocUnsafe(maximumLogBytes + 1);
  let bytes = 0;
  while (bytes < buffer.length) {
    const count = readSync(fd, buffer, bytes, buffer.length - bytes, null);
    if (!count) break;
    bytes += count;
  }
  if (bytes > maximumLogBytes) throw new Error('diagnostic_scan_failed');
  const data = buffer.toString('utf8', 0, bytes);
  if (data && !data.endsWith('\n')) throw new Error('diagnostic_scan_failed');
  return data ? data.slice(0, -1).split('\n').map(line => {
    let parsed: unknown;
    try { parsed = JSON.parse(line); } catch { throw new Error('diagnostic_scan_failed'); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('diagnostic_scan_failed');
    const value = parsed as Record<string, unknown>;
    const cleaned = safeRecord(value.code as DiagnosticCode, value.hour, value);
    if (line !== JSON.stringify(cleaned)) throw new Error('diagnostic_scan_failed');
    return cleaned;
  }) : [];
}

function readLog(directory: string, name: string): RecordShape[] {
  let fd: number;
  try { fd = openSync(join(directory, name), constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw new Error('diagnostic_read_failed'); }
  try { return readOpenedLog(fd); }
  finally { closeSync(fd); }
}

export function pruneDiagnosticLogs(directory: string, maxAgeMs = retentionMs, maxBytes = maximumLogBytes): void {
  if (!Number.isInteger(maxBytes) || maxBytes < 128 || maxBytes > maximumLogBytes) throw new Error('invalid_diagnostic_limits');
  const cutoffHour = Math.floor((Date.now() - maxAgeMs) / 3_600_000);
  for (const name of names) {
    const path = join(directory, name);
    let fd: number;
    try { fd = openSync(path, constants.O_RDWR | constants.O_NONBLOCK | constants.O_NOFOLLOW); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw new Error('diagnostic_read_failed'); }
    try {
      const rows = readOpenedLog(fd);
      const retained = rows.filter(row => row.hour >= cutoffHour);
      if (retained.length === rows.length) continue;
      const content = retained.map(row => JSON.stringify(row) + '\n').join('');
      if (Buffer.byteLength(content) > maxBytes) throw new Error('diagnostic_write_failed');
      validateLogFd(fd);
      ftruncateSync(fd, 0);
      if (content) writeSync(fd, content, 0, 'utf8');
    }
    finally { closeSync(fd); }
  }
}

export function createDiagnosticLog(directory: string, options: { maxBytes?: number; maxAgeMs?: number } = {}) {
  const maxBytes = options.maxBytes ?? maximumLogBytes;
  const maxAgeMs = options.maxAgeMs ?? retentionMs;
  if (!Number.isInteger(maxBytes) || maxBytes < 128 || maxBytes > maximumLogBytes || !Number.isInteger(maxAgeMs) || maxAgeMs < 1) throw new Error('invalid_diagnostic_limits');
  pruneDiagnosticLogs(directory, maxAgeMs, maxBytes);
  return {
    prune: () => pruneDiagnosticLogs(directory, maxAgeMs, maxBytes),
    record(code: DiagnosticCode, values: Record<string, unknown> = {}): void {
      pruneDiagnosticLogs(directory, maxAgeMs, maxBytes);
      const line = `${JSON.stringify(safeRecord(code, Math.floor(Date.now() / 3_600_000), values))}\n`;
      const lineBytes = Buffer.byteLength(line);
      if (lineBytes > maxBytes) throw new Error('diagnostic_write_failed');
      const path = join(directory, names[0]);
      let rotate = false;
      try {
        const info = statSync(path);
        rotate = !info.isFile() || info.size + lineBytes > maxBytes || Date.now() - info.mtimeMs > maxAgeMs;
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('diagnostic_write_failed'); }
      if (rotate) {
        try { renameSync(path, join(directory, names[1])); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('diagnostic_write_failed'); }
      }
      const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | constants.O_NOFOLLOW, 0o600);
      try {
        const info = fstatSync(fd);
        if (!info.isFile() || info.uid !== process.getuid?.() || (info.mode & 0o777) !== 0o600
          || info.size + lineBytes > maxBytes) throw new Error('diagnostic_write_failed');
        writeSync(fd, line);
      } finally { closeSync(fd); }
    },
  };
}

export function scanDiagnostics(content: string): boolean {
  if (Buffer.byteLength(content) > MAX_DIAGNOSTIC_EXPORT_BYTES) return false;
  if (/(?:sk-[a-z0-9-]{8,}|bearer\s+\S+|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\/users\/|refs\/heads\/|session[_-]|prompt\s*:|aws_secret_access_key|-----begin)/i.test(content)) return false;
  try {
    const bundle: unknown = JSON.parse(content);
    if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) return false;
    const value = bundle as Record<string, unknown>;
    if (Object.keys(value).join(',') !== 'format_version,status,logs' || value.format_version !== 1) return false;
    if (JSON.stringify(value.status) !== JSON.stringify(allowedStatus) || !Array.isArray(value.logs)) return false;
    return value.logs.every((item: unknown) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
      const row = item as Record<string, unknown>;
      try { return JSON.stringify(row) === JSON.stringify(safeRecord(row.code as DiagnosticCode, row.hour, row)); }
      catch { return false; }
    });
  } catch { return false; }
}

export function exportDiagnostics(directory: string, status: Status): string {
  if (JSON.stringify(status) !== JSON.stringify(allowedStatus)) throw new Error('diagnostic_scan_failed');
  pruneDiagnosticLogs(directory);
  const content = JSON.stringify({ format_version: 1, status, logs: [...readLog(directory, names[1]), ...readLog(directory, names[0])] });
  if (!scanDiagnostics(content)) throw new Error('diagnostic_scan_failed');
  return content;
}
