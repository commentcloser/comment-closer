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

/**
 * Relation field → related model, for every relation that can reach a model in
 * TOKEN_FIELDS. The query hook only ever fires for the TOP-LEVEL model, so a
 * relation-nested read (the common one: comment.findFirst({ include: {
 * connectedPage } })) has model='Comment' and would otherwise hand the caller a
 * raw enc:v1: envelope as its page token. Results are finite trees, so walking
 * these keys recursively terminates even though the graph has cycles.
 */
export const TOKEN_RELATIONS: Record<string, Record<string, string>> = {
  User: { accounts: 'Account', connectedPages: 'ConnectedPage', sessions: 'Session' },
  Account: { user: 'User' },
  Session: { user: 'User' },
  ConnectedPage: { user: 'User', comments: 'Comment', tiktokStats: 'TikTokAccountStats' },
  Comment: { connectedPage: 'ConnectedPage', actionLogs: 'CommentActionLog' },
  CommentActionLog: { comment: 'Comment' },
  TikTokAccountStats: { connectedPage: 'ConnectedPage' },
};

export const WRITE_OPS = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
]);
export const READ_OPS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
]);

/**
 * Operations whose result is a stored row and therefore needs decrypting. A
 * write's return value is a read of the row it just wrote, so it has to
 * round-trip back to plaintext like any other read — otherwise a caller that
 * uses the returned record's token gets an envelope. The *Many variants return
 * a { count } and are left alone.
 */
export const DECRYPT_OPS = new Set([
  ...READ_OPS,
  'create',
  'createManyAndReturn',
  'update',
  'updateManyAndReturn',
  'upsert',
  'delete',
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

function decryptRecord(model: string, record: unknown): unknown {
  if (!record || typeof record !== 'object') return record;
  const src = record as Record<string, unknown>;
  let out: Record<string, unknown> = src;

  const fields = TOKEN_FIELDS[model];
  if (fields) {
    for (const f of fields) {
      if (typeof src[f] === 'string') {
        if (out === src) out = { ...src };
        out[f] = decryptToken(src[f] as string);
      }
    }
  }

  const relations = TOKEN_RELATIONS[model];
  if (relations) {
    for (const key of Object.keys(relations)) {
      // Only walk relations that were actually included/selected.
      if (!(key in src) || src[key] == null || typeof src[key] !== 'object') continue;
      const decrypted = decryptValue(relations[key], src[key]);
      if (decrypted !== src[key]) {
        if (out === src) out = { ...src };
        out[key] = decrypted;
      }
    }
  }

  return out;
}

/** Decrypt a record or list of records of `model`, preserving identity if unchanged. */
function decryptValue(model: string, value: unknown): unknown {
  if (Array.isArray(value)) {
    let changed = false;
    const mapped = value.map((r) => {
      const d = decryptRecord(model, r);
      if (d !== r) changed = true;
      return d;
    });
    return changed ? mapped : value;
  }
  return decryptRecord(model, value);
}

/** Decrypt token fields in an operation's result (single, array, or null), including relations. */
export function decryptResult(model: string | undefined, result: unknown): unknown {
  if (!model || result == null) return result;
  if (!TOKEN_FIELDS[model] && !TOKEN_RELATIONS[model]) return result;
  return decryptValue(model, result);
}
