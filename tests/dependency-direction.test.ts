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

test('long export-from declaration cannot bypass the contracts boundary', () => {
  const specifiers = Array.from({ length: 110 }, (_, index) => `value as value${index}`).join(',\n');
  const root = fixture({
    'packages/contracts/exports.ts': `export {\n${specifiers}\n} from '../database/secret.ts';`,
    'packages/database/secret.ts': 'export const value = 1;',
  });
  const result = check(root);
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(result.stderr, /contracts\/exports.ts.*database\/secret.ts/);
});

test('collector cannot reach database through a NodeNext .mts intermediate', () => {
  const root = fixture({
    'apps/collector/main.mts': "import '../../packages/domain/bridge.mjs';",
    'packages/domain/bridge.mts': "import '../database/database.mjs';",
    'packages/database/database.mts': 'export {};',
  });
  const result = check(root);
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(result.stderr, /collector\/main.mts.*domain\/bridge.mts.*database\/database.mjs/);
});

test('NodeNext and JavaScript runtime extensions resolve through intermediate source files', () => {
  for (const [runtimeExtension, sourceExtension] of [
    ['.cjs', '.cts'], ['.js', '.ts'], ['.jsx', '.tsx'],
  ]) {
    const root = fixture({
      'apps/collector/main.ts': `require('../../packages/domain/bridge${runtimeExtension}');`,
      [`packages/domain/bridge${sourceExtension}`]: "import '../database/database.ts';",
      'packages/database/database.ts': 'export {};',
    });
    const result = check(root);
    assert.notEqual(result.status, 0, `${runtimeExtension}: ${result.stdout}`);
    assert.match(result.stderr, new RegExp(`domain/bridge\\${sourceExtension}.*database/database.ts`));
  }
});

test('extensionless index imports still resolve transitively', () => {
  const root = fixture({
    'apps/collector/main.ts': "import '../../packages/domain/bridge';",
    'packages/domain/bridge/index.ts': "import '../../database/database.ts';",
    'packages/database/database.ts': 'export {};',
  });
  const result = check(root);
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(result.stderr, /domain\/bridge\/index.ts.*database\/database.ts/);
});

test('type and star re-exports expose forbidden dependencies', () => {
  for (const declaration of [
    "export type { Secret } from '../database/secret.ts';",
    "export * from '../database/secret.ts';",
  ]) {
    const root = fixture({
      'packages/contracts/exports.ts': declaration,
      'packages/database/secret.ts': 'export type Secret = string;',
    });
    const result = check(root);
    assert.notEqual(result.status, 0, result.stdout);
    assert.match(result.stderr, /contracts\/exports.ts.*database\/secret.ts/);
  }
});
