import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createKeychainStore } from '../packages/collector/keychain.ts';

const valid = {
  installation_id: randomUUID(), machine_id: randomUUID(), workspace_id: randomUUID(), user_id: randomUUID(),
  refresh_token: randomBytes(32).toString('base64url'), scope: 'telemetry:write machine:self',
};

function storedRecord(raw: string, marker: string = valid.installation_id) {
  return createKeychainStore(input => input.operation === 'read' ? raw : marker);
}

test('stored enrollment rejects uppercase UUID fields', () => {
  for (const field of ['installation_id', 'machine_id', 'workspace_id', 'user_id'] as const) {
    const record = { ...valid, [field]: valid[field].toUpperCase() };
    const marker = field === 'installation_id' ? record.installation_id : valid.installation_id;
    assert.throws(() => storedRecord(JSON.stringify(record), marker).read(), /keychain_invalid/, field);
  }
});

test('stored enrollment rejects a noncanonical installation marker', () => {
  assert.throws(() => storedRecord(JSON.stringify(valid), valid.installation_id.toUpperCase()).read(), /keychain_invalid/);
  assert.throws(() => storedRecord(JSON.stringify(valid), valid.installation_id.toUpperCase()).installationId(), /keychain_invalid/);
});

test('stored enrollment rejects reordered JSON fields', () => {
  const reordered = { machine_id: valid.machine_id, installation_id: valid.installation_id,
    workspace_id: valid.workspace_id, user_id: valid.user_id, refresh_token: valid.refresh_token, scope: valid.scope };
  assert.throws(() => storedRecord(JSON.stringify(reordered)).read(), /keychain_invalid/);
});

test('stored enrollment rejects whitespace and alternate JSON serialization', () => {
  const canonical = JSON.stringify(valid);
  for (const raw of [` ${canonical}`, `${canonical} `, `\n${canonical}`, canonical.replace('telemetry:write', '\\u0074elemetry:write')]) {
    assert.throws(() => storedRecord(raw).read(), /keychain_invalid/);
  }
});

test('stored enrollment rejects noncanonical base64url refresh token pad bits', () => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const last = valid.refresh_token.at(-1)!;
  const noncanonical = valid.refresh_token.slice(0, -1) + alphabet[alphabet.indexOf(last) + 1];
  assert.equal(noncanonical.length, 43);
  assert(Buffer.from(noncanonical, 'base64url').equals(Buffer.from(valid.refresh_token, 'base64url')));
  assert.throws(() => storedRecord(JSON.stringify({ ...valid, refresh_token: noncanonical })).read(), /keychain_invalid/);
});

test('stored enrollment rejects refresh tokens that do not decode to 32 bytes', () => {
  for (const length of [31, 33]) {
    const record = { ...valid, refresh_token: Buffer.alloc(length, 0x42).toString('base64url') };
    assert.throws(() => storedRecord(JSON.stringify(record)).read(), /keychain_invalid/, `${length} bytes`);
  }
});

test('writer persists the fixed field order and reader accepts it', () => {
  const reorderedInput = { scope: valid.scope, refresh_token: valid.refresh_token, user_id: valid.user_id,
    workspace_id: valid.workspace_id, machine_id: valid.machine_id, installation_id: valid.installation_id };
  let raw = 'absent';
  const store = createKeychainStore(input => {
    if (input.operation === 'read') return raw;
    if (input.operation === 'write') { raw = input.value!; return 'stored'; }
    return valid.installation_id;
  });
  store.write(reorderedInput);
  assert.equal(raw === JSON.stringify(valid), true, 'writer did not use the fixed field order');
  assert.deepEqual(store.read(), valid);
});
