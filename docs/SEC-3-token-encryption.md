# SEC-3 — Provider token encryption at rest

Meta/TikTok access & refresh tokens grant full comment read/manage (and more) on
real customer accounts. They were stored in plaintext, so any DB-read compromise
(leaked connection string, a debug-route regression, injection) would hand over
live posting ability on every connected customer. This change encrypts those
token columns at rest with AES-256-GCM.

## What shipped (no operator action required)

- `lib/tokenCrypto.ts` — AES-256-GCM `encryptToken` / `decryptToken` with a
  versioned `enc:v1:` envelope. Unit-tested (`lib/tokenCrypto.test.ts`).
- `lib/tokenCryptoFields.ts` — pure Prisma arg/result transforms for the token
  columns. Unit-tested (`lib/tokenCryptoFields.test.ts`).
- `lib/prisma.ts` — a `$extends` query hook that runs those transforms on every
  read/write, so a write path can never diverge from a read path.

Encrypted columns: `Account.access_token`, `Account.refresh_token`,
`ConnectedPage.pageAccessToken`.

### Why this is safe to merge before the key exists

The whole layer is **inert until `TOKEN_ENCRYPTION_KEY` is set**:

- `encryptToken` returns its input unchanged when the key is unset, so writes are
  byte-for-byte identical to today.
- `decryptToken` passes through any value not in the `enc:v1:` envelope, so
  legacy plaintext rows keep working even after the key is set — **no big-bang
  data migration is required**.
- `encryptToken` won't double-encrypt an already-enveloped value.

## Operator steps to turn it on

Do these **after SEC-1** (rotate the exposed secrets first, so the encryption
key isn't derived from a still-leaked value).

1. Generate a strong key and set it in Vercel prod (and preview, to test):

   ```bash
   # any long random string works; it's SHA-256'd to a 32-byte AES key
   openssl rand -base64 48
   ```

   Set `TOKEN_ENCRYPTION_KEY=<that value>` in the Vercel project env, then
   redeploy. From this point, **newly written** tokens are encrypted; existing
   plaintext rows keep being read fine (backward-compatible).

2. (Optional) Re-encrypt existing rows so nothing plaintext remains. A one-off
   script can read each `Account` / `ConnectedPage`, then write the same value
   back through the extension (the write path encrypts it). Because the read
   already returns plaintext and the write re-encrypts, a no-value-change update
   per row is sufficient. Run it against prod once, off-peak.

3. Verify on preview before relying on it: connect a Facebook/TikTok account,
   confirm posting/refresh still works, and confirm the stored columns now begin
   with `enc:v1:` in the DB.

## Caveats

- **Raw SQL bypasses the extension.** `$queryRaw`/`$executeRaw` are not covered.
  No raw query currently reads or writes a token column — keep it that way, or
  transform manually with `encryptToken`/`decryptToken`.
- **Rollback after encrypting.** If you unset the key after rows were written
  encrypted, those rows can no longer be decrypted (reads throw). Recover by
  re-setting the key, or by forcing affected users to reconnect. Prefer rotating
  the key deliberately over unsetting it.
