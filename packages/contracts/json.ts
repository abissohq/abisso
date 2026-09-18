import { RequestFailure } from './capability.ts';
import { syntheticNamespace, syntheticExtensionBytes } from './quarantine.ts';

export const limits = { wireBytes: 512 * 1024, decodedBytes: 1024 * 1024, eventBytes: 64 * 1024 };

// Bounded recursive descent retains duplicate keys until they have been checked.
// JSON.parse alone loses both duplicate keys and their original spelling.
export function parseCanonicalJson(text: string): unknown {
  let cursor = 0;
  const fail = (): never => { throw new RequestFailure(400, 'invalid_json'); };
  const limit = (): never => { throw new RequestFailure(413, 'hard_limit'); };
  const whitespace = () => { while (/[\x20\t\r\n]/.test(text[cursor] ?? '\0')) cursor++; };
  function string(): string {
    const start = cursor++;
    while (cursor < text.length) {
      if (text[cursor] === '\\') { cursor += 2; continue; }
      if (text[cursor++] === '"') {
        let result: string;
        try { result = JSON.parse(text.slice(start, cursor)); } catch { return fail(); }
        if (!result.isWellFormed() || result.includes('\0')) fail();
        if (Buffer.byteLength(result) > 128) limit();
        return result;
      }
    }
    return fail();
  }
  function value(depth: number, path: string[]): unknown {
    if (depth > 10) limit();
    // payload itself is the first object level below payload's parent.
    const payloadIndex = path.indexOf('payload');
    if (payloadIndex >= 0 && path.length - payloadIndex > 4) limit();
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
          if (++count > 64) limit();
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
          if (array.length === 200) limit();
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
    if (path.length === 2 && path[0] === 'events' && Buffer.byteLength(text.slice(start, cursor)) > limits.eventBytes) limit();
    if (path.length === 3 && path[0] === 'events' && path[2] === 'extensions' &&
        result !== null && typeof result === 'object' && Object.hasOwn(result, syntheticNamespace) &&
        Buffer.byteLength(text.slice(start, cursor)) > syntheticExtensionBytes) limit();
    return result;
  }
  const result = value(0, []);
  whitespace();
  if (cursor !== text.length) fail();
  return result;
}
