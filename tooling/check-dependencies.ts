import { readdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { createScanner, SyntaxKind } from 'typescript/unstable/ast';

// Import direction is checked at the source boundary, before a future module can
// accidentally give collector code a transitive route to server authority.
const root = resolve(process.argv[2] ?? '.');
const sourceRoots = ['apps', 'packages'];
const serverParts = ['apps/backend/', 'apps/worker/', 'packages/database/', 'packages/ingestion/', 'packages/processing/', 'packages/live/'];
const serverAuthority = [...serverParts, 'packages/browser/'];
const inPart = (path: string, part: string) => path === part.slice(0, -1) || path.startsWith(part);

function files(directory: string): string[] {
  try {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return files(path);
      return entry.isFile() && /\.[cm]?tsx?$/.test(entry.name) ? [path] : [];
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

function repoPath(path: string): string {
  return relative(root, path).split(sep).join('/');
}

function forbidden(from: string, to: string): boolean {
  if (from.startsWith('packages/contracts/')) return !inPart(to, 'packages/contracts/');
  if (['packages/collector-core/', 'packages/privacy/', 'apps/collector/', 'packages/collector/']
    .some(part => from.startsWith(part))) {
    return serverAuthority.some(part => inPart(to, part));
  }
  if (from.startsWith('packages/ingestion/') && inPart(to, 'packages/browser/')) return true;
  if (from.startsWith('packages/browser/') && inPart(to, 'packages/ingestion/')) return true;
  return false;
}

const failures: string[] = [];
const dependencies = new Map<string, { to: string; line: number }[]>();
for (const file of sourceRoots.flatMap(part => files(join(root, part)))) {
  const from = repoPath(file);
  const imports: { to: string; line: number }[] = [];
  dependencies.set(from, imports);
  const source = readFileSync(file, 'utf8');
  const scanner = createScanner(true, undefined, source);
  const tokens: { kind: SyntaxKind; value: string; start: number }[] = [];
  for (let kind = scanner.scan(); kind !== SyntaxKind.EndOfFile; kind = scanner.scan()) {
    tokens.push({ kind, value: scanner.getTokenValue(), start: scanner.getTokenStart() });
  }
  function inspect(index: number, origin: number) {
    const specifier = tokens[index];
    const line = source.slice(0, tokens[origin].start).split('\n').length;
    if (!specifier || specifier.kind !== SyntaxKind.StringLiteral) {
      failures.push(`${from}:${line}: nonliteral import cannot be checked`);
      return;
    }
    const value = specifier.value;
    if (!value.startsWith('.') && !isAbsolute(value)) return; // Node or declared external package.
    const target = resolve(dirname(file), value);
    const to = repoPath(target);
    if (to.startsWith('../') || isAbsolute(to)) {
      failures.push(`${from}:${line}: import escapes repository: ${value}`);
    } else imports.push({ to, line });
  }
  function fromClause(index: number): number | undefined {
    let braces = 0;
    for (let j = index; j < tokens.length; j++) {
      const kind = tokens[j].kind;
      if (kind === SyntaxKind.OpenBraceToken) braces++;
      else if (kind === SyntaxKind.CloseBraceToken) braces--;
      else if (braces === 0 && kind === SyntaxKind.FromKeyword) return j + 1;
      else if (braces === 0 && kind === SyntaxKind.SemicolonToken) return;
    }
  }
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if ((token.kind === SyntaxKind.ImportKeyword || token.value === 'require') && tokens[i + 1]?.kind === SyntaxKind.OpenParenToken) {
      inspect(i + 2, i);
      continue;
    }
    if (token.kind !== SyntaxKind.ImportKeyword && token.kind !== SyntaxKind.ExportKeyword) continue;
    if (tokens[i + 1]?.kind === SyntaxKind.StringLiteral) {
      inspect(i + 1, i);
      continue;
    }
    const first = tokens[i + 1];
    const startsReExport = first?.kind === SyntaxKind.AsteriskToken
      || first?.kind === SyntaxKind.OpenBraceToken
      || (first?.value === 'type' && [SyntaxKind.AsteriskToken, SyntaxKind.OpenBraceToken].includes(tokens[i + 2]?.kind));
    if (token.kind === SyntaxKind.ExportKeyword && !startsReExport) continue;
    const specifier = fromClause(i + 1);
    if (specifier !== undefined) inspect(specifier, i);
  }
}

function sourceFile(path: string): string | undefined {
  const candidates = [path, `${path}.ts`, `${path}.tsx`, `${path}/index.ts`,
    path.replace(/\.js$/, '.ts'), path.replace(/\.jsx$/, '.tsx'),
    path.replace(/\.mjs$/, '.mts'), path.replace(/\.cjs$/, '.cts')];
  return candidates.find(candidate => dependencies.has(candidate));
}

for (const origin of dependencies.keys()) {
  const visited = new Set([origin]);
  const queue = [{ at: origin, path: [origin], line: 0 }];
  while (queue.length) {
    const current = queue.shift()!;
    for (const edge of dependencies.get(current.at) ?? []) {
      const line = current.line || edge.line;
      if (forbidden(origin, edge.to)) {
        failures.push(`${origin}:${line}: forbidden dependency path ${[...current.path, edge.to].join(' -> ')}`);
        continue;
      }
      const next = sourceFile(edge.to);
      if (next && !visited.has(next)) {
        visited.add(next);
        queue.push({ at: next, path: [...current.path, next], line });
      }
    }
  }
}

if (failures.length) {
  process.stderr.write(`${failures.join('\n')}\n`);
  process.exitCode = 1;
} else {
  console.log('Dependency direction passed.');
}
