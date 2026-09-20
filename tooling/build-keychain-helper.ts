import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../packages/collector/keychain.swift', import.meta.url));
const output = fileURLToPath(new URL('../apps/collector/dist/keychain-helper', import.meta.url));
mkdirSync(fileURLToPath(new URL('../apps/collector/dist/', import.meta.url)), { recursive: true, mode: 0o700 });
const built = spawnSync('/usr/bin/xcrun', ['swiftc', source, '-o', output], { stdio: 'inherit' });
if (built.status !== 0) process.exit(built.status ?? 1);
chmodSync(output, 0o700);
