// Generates tests/fixtures/webauthn/admin-keys.json: three fixed ES256 passkey key pairs
// (a, b, c) used by signInAsAdmin in tests/e2e/fixtures.ts. Run once with
// `pnpm exec tsx tests/fixtures/webauthn/make-admin-keys.ts` and commit the result.
// All values are standard base64.
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'admin-keys.json');

function b64urlToBuffer(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}

// COSE_Key for ES256 (kty EC2, alg -7, crv P-256), CBOR encoded by hand (RFC 9052).
function coseEs256(x: Buffer, y: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from([0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21, 0x58, 0x20]),
    x,
    Buffer.from([0x22, 0x58, 0x20]),
    y,
  ]);
}

const keys: Record<string, Record<string, string>> = {};
for (const name of ['a', 'b', 'c']) {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = publicKey.export({ format: 'jwk' });
  keys[name] = {
    privateKeyPkcs8: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
    publicKeyCose: coseEs256(b64urlToBuffer(jwk.x ?? ''), b64urlToBuffer(jwk.y ?? '')).toString(
      'base64',
    ),
    credentialId: randomBytes(32).toString('base64'),
    userHandle: randomBytes(32).toString('base64'),
  };
}

writeFileSync(OUT, `${JSON.stringify(keys, null, 2)}\n`);
console.log(`Wrote ${OUT}`);
