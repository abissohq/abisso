import { RequestFailure } from './capability.ts';
import { syntheticNamespace, syntheticExtensionBytes } from './quarantine.ts';

export const limits = { wireBytes: 512 * 1024, decodedBytes: 1024 * 1024, eventBytes: 64 * 1024 };

type ParserPolicy = {
  invalidCode: string;
  limitCode: string;
  limitStatus?: number;
  maxDepth?: number;
  maxStringBytes?: number;
  maxObjectKeys?: number;
  maxArrayItems?: number;
  inspectValue?: (value: unknown, path: string[], sourceBytes: number) => void;
};

// Recursive descent retains decoded property names until duplicate detection.
// JSON.parse alone loses both duplicate keys and their original spelling.
function parseUniqueJson(text: string, policy: ParserPolicy): unknown {
  let cursor = 0;
  const fail = (): never => { throw new RequestFailure(400, policy.invalidCode); };
  const limit = (): never => { throw new RequestFailure(policy.limitStatus ?? 413, policy.limitCode); };
  const whitespace = () => { while (/^[\x20\t\r\n]$/.test(text[cursor] ?? '\0')) cursor++; };
  function string(): string {
    const start = cursor++;
    while (cursor < text.length) {
      if (text[cursor] === '\\') { cursor += 2; continue; }
      if (text[cursor++] === '"') {
        let result: string;
        try { result = JSON.parse(text.slice(start, cursor)); } catch { return fail(); }
        if (!result.isWellFormed() || result.includes('\0')) fail();
        if (policy.maxStringBytes !== undefined && Buffer.byteLength(result) > policy.maxStringBytes) limit();
        return result;
      }
    }
    return fail();
  }
  function value(depth: number, path: string[]): unknown {
    if (policy.maxDepth !== undefined && depth > policy.maxDepth) limit();
    whitespace();
    const start = cursor;
    let result: unknown;
    const character = text[cursor];
    if (character === '"') result = string();
    else if (character === '{') {
      cursor++;
      const object: Record<string, unknown> = Object.create(null);
      whitespace();
      let count = 0;
      if (text[cursor] !== '}') {
        while (true) {
          whitespace();
          if (text[cursor] !== '"') fail();
          const key = string();
          if (Object.hasOwn(object, key)) fail();
          if (policy.maxObjectKeys !== undefined && ++count > policy.maxObjectKeys) limit();
          whitespace();
          if (text[cursor++] !== ':') fail();
          object[key] = value(depth + 1, [...path, key]);
          whitespace();
          if (text[cursor] !== ',') break;
          cursor++;
        }
      }
      if (text[cursor++] !== '}') fail();
      result = object;
    } else if (character === '[') {
      cursor++;
      const array: unknown[] = [];
      whitespace();
      if (text[cursor] !== ']') {
        while (true) {
          if (policy.maxArrayItems !== undefined && array.length === policy.maxArrayItems) limit();
          array.push(value(depth + 1, [...path, String(array.length)]));
          whitespace();
          if (text[cursor] !== ',') break;
          cursor++;
        }
      }
      if (text[cursor++] !== ']') fail();
      result = array;
    } else {
      const literal = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(cursor))?.[0];
      if (!literal) return fail();
      cursor += literal.length;
      result = JSON.parse(literal);
      if (typeof result === 'number' && (!Number.isFinite(result) || (Number.isInteger(result) && !Number.isSafeInteger(result)))) fail();
    }
    policy.inspectValue?.(result, path, Buffer.byteLength(text.slice(start, cursor)));
    return result;
  }
  const result = value(0, []);
  whitespace();
  if (cursor !== text.length) fail();
  return result;
}

export function parseJsonWithUniqueKeys(text: string, invalidCode: string): unknown {
  return parseUniqueJson(text, { invalidCode, limitCode: invalidCode, limitStatus: 400, maxDepth: 64 });
}

export function parseCanonicalJson(text: string): unknown {
  return parseUniqueJson(text, {
    invalidCode: 'invalid_json',
    limitCode: 'hard_limit',
    maxDepth: 10,
    maxStringBytes: 128,
    maxObjectKeys: 64,
    maxArrayItems: 200,
    inspectValue(result, path, sourceBytes) {
      const payloadIndex = path.indexOf('payload');
      if (payloadIndex >= 0 && path.length - payloadIndex > 4) throw new RequestFailure(413, 'hard_limit');
      if (path.length === 2 && path[0] === 'events' && sourceBytes > limits.eventBytes) {
        throw new RequestFailure(413, 'hard_limit');
      }
      if (path.length === 3 && path[0] === 'events' && path[2] === 'extensions' &&
          result !== null && typeof result === 'object' && Object.hasOwn(result, syntheticNamespace) &&
          sourceBytes > syntheticExtensionBytes) {
        throw new RequestFailure(413, 'hard_limit');
      }
    },
  });
}
