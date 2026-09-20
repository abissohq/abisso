import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';

const roots: string[] = [];
after(() => roots.forEach(root => rmSync(root, { recursive: true, force: true })));

function fixture(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), 'abisso-boundaries-'));
  roots.push(root);
  for (const [path, source] of Object.entries(files)) {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, source);
  }
  return root;
}

function check(root?: string) {
  return spawnSync(process.execPath, ['tooling/check-dependencies.ts', ...(root ? [root] : [])], {
    cwd: process.cwd(), encoding: 'utf8',
  });
}

test('current repository obeys dependency direction', () => {
  const result = check();
  assert.equal(result.status, 0, result.stderr);
});

test('allowed contract imports and commented imports remain green', () => {
  const root = fixture({
    'packages/contracts/event.ts': "import './value.ts';\n// import '../database/database.ts';",
    'packages/contracts/value.ts': 'export const value = 1;',
  });
  const result = check(root);
  assert.equal(result.status, 0, result.stderr);
});

test('contracts and local privacy cannot reach browser, backend or database', () => {
  for (const origin of ['packages/contracts/event.ts', 'packages/collector-core/privacy.ts']) {
    for (const target of ['apps/backend/api.ts', 'packages/browser/authentication.ts', 'packages/database/database.ts']) {
      const root = fixture({ [origin]: '', [target]: 'export {};' });
      writeFileSync(join(root, origin), `import '${join(root, target)}';`);
      const result = check(root);
      assert.notEqual(result.status, 0, `${origin} -> ${target}`);
      assert.match(result.stderr, /forbidden dependency/);
    }
  }
});

test('collector cannot import server storage or projectors, including re-exports', () => {
  const root = fixture({
    'apps/collector/main.ts': "export { projectSessionStart } from '../../packages/processing/sessions.ts';",
    'packages/processing/sessions.ts': 'export const projectSessionStart = 1;',
  });
  const result = check(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /apps\/collector\/main.ts.*packages\/processing\/sessions.ts/);
});

test('collector cannot reach server storage through an intermediate module', () => {
  const root = fixture({
    'apps/collector/main.ts': "import '../../packages/domain/bridge.ts';",
    'packages/domain/bridge.ts': "import '../database/database.ts';",
    'packages/database/database.ts': 'export {};',
  });
  const result = check(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /apps\/collector\/main.ts.*packages\/database\/database.ts/);
});

test('machine ingestion and browser authority cannot import one another', () => {
  for (const [origin, target] of [
    ['packages/ingestion/authentication.ts', 'packages/browser/authentication.ts'],
    ['packages/browser/authentication.ts', 'packages/ingestion/authentication.ts'],
  ]) {
    const root = fixture({ [origin]: '', [target]: 'export {};' });
    writeFileSync(join(root, origin), `import '${join(root, target)}';`);
    const result = check(root);
    assert.notEqual(result.status, 0, `${origin} -> ${target}`);
  }
});

test('type-only and dynamic imports cannot bypass the boundary', () => {
  const root = fixture({
    'packages/contracts/types.ts': "import type { Secret } from '../database/secret.ts';",
    'packages/database/secret.ts': 'export type Secret = string;',
    'apps/collector/main.ts': "void import('../../packages/database/database.ts');",
    'packages/database/database.ts': 'export {};',
  });
  const result = check(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /contracts\/types.ts/);
  assert.match(result.stderr, /collector\/main.ts/);
});
