/**
 * Pure argument/result transforms that apply token encryption (SEC-3) to the
 * Prisma models holding provider tokens. Kept separate from prisma.ts so the
 * error-prone shape handling (upsert create/update, createMany arrays, atomic
 * { set } updates, partial selects, arrays vs single results) is unit-testable
 * without a live database. prisma.ts wires these into a $extends query hook.
 *
 * Because encryptToken/decryptToken are no-ops until TOKEN_ENCRYPTION_KEY is set
 * and pass legacy plaintext through, these transforms are byte-for-byte
 * behaviour-preserving until an operator opts in.
 */

import { encryptToken, decryptToken } from './tokenCrypto';

/** Model name → token fields to encrypt at rest. */
export const TOKEN_FIELDS: Record<string, string[]> = {
  Account: ['access_token', 'refresh_token'],
  ConnectedPage: ['pageAccessToken'],
};

export const WRITE_OPS = new Set(['create', 'createMany', 'update', 'updateMany', 'upsert']);
export const READ_OPS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
]);

function encryptFieldValue(value: unknown): unknown {
  if (typeof value === 'string') return encryptToken(value);
  // Atomic string update: { set: '...' }
  if (
    value &&
    typeof value === 'object' &&
    'set' in (value as Record<string, unknown>) &&
    typeof (value as { set: unknown }).set === 'string'
  ) {
    return { ...(value as object), set: encryptToken((value as { set: string }).set) };
  }
  return value;
}

function encryptDataObject(fields: string[], data: unknown): unknown {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const src = data as Record<string, unknown>;
  let out: Record<string, unknown> = src;
  for (const f of fields) {
    if (f in src && src[f] != null) {
      if (out === src) out = { ...src };
      out[f] = encryptFieldValue(src[f]);
    }
  }
  return out;
}

/** Encrypt token fields inside a write operation's args (create/update/upsert/…). */
export function encryptWriteArgs(model: string | undefined, operation: string, args: unknown): unknown {
  const fields = model ? TOKEN_FIELDS[model] : undefined;
  if (!fields || !args || typeof args !== 'object') return args;
  const a = { ...(args as Record<string, unknown>) };

  if (operation === 'upsert') {
    if (a.create) a.create = encryptDataObject(fields, a.create);
    if (a.update) a.update = encryptDataObject(fields, a.update);
    return a;
  }

  if (a.data != null) {
    a.data = Array.isArray(a.data)
      ? a.data.map((d) => encryptDataObject(fields, d))
      : encryptDataObject(fields, a.data);
  }
  return a;
}

function decryptRecord(fields: string[], record: unknown): unknown {
  if (!record || typeof record !== 'object') return record;
  const src = record as Record<string, unknown>;
  let out: Record<string, unknown> = src;
  for (const f of fields) {
    if (typeof src[f] === 'string') {
      if (out === src) out = { ...src };
      out[f] = decryptToken(src[f] as string);
    }
  }
  return out;
}

/** Decrypt token fields in a read operation's result (single, array, or null). */
export function decryptResult(model: string | undefined, result: unknown): unknown {
  const fields = model ? TOKEN_FIELDS[model] : undefined;
  if (!fields || result == null) return result;
  if (Array.isArray(result)) return result.map((r) => decryptRecord(fields, r));
  return decryptRecord(fields, result);
}
