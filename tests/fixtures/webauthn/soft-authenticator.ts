// Software WebAuthn authenticator for integration tests: ES256 key pair, attestation `none`
// registration responses and assertions with configurable UP/UV flags and signature counter.
// Output has the JSON shape @simplewebauthn/browser sends to the server.
import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto';

const FLAG_UP = 0x01;
const FLAG_UV = 0x04;
const FLAG_BE = 0x08;
const FLAG_BS = 0x10;
const FLAG_AT = 0x40;

export interface CeremonyOptions {
  /** The challenge from the server's options (base64url string). */
  challenge: string;
  origin: string;
  rpId: string;
  /** User presence flag; default true. */
  up?: boolean;
  /** User verification flag; default true. */
  uv?: boolean;
  /** Overrides the signature counter that is written (default: the authenticator's next value). */
  counter?: number;
}

export interface SoftRegistrationResponse {
  id: string;
  rawId: string;
  type: 'public-key';
  response: {
    clientDataJSON: string;
    attestationObject: string;
    transports: ('internal' | 'hybrid')[];
  };
  clientExtensionResults: Record<string, never>;
  authenticatorAttachment: 'platform';
}

export interface SoftAssertionResponse {
  id: string;
  rawId: string;
  type: 'public-key';
  response: {
    clientDataJSON: string;
    authenticatorData: string;
    signature: string;
    userHandle: string;
  };
  clientExtensionResults: Record<string, never>;
  authenticatorAttachment: 'platform';
}

function sha256(data: Buffer | string): Buffer {
  return createHash('sha256').update(data).digest();
}

function uint32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0);
  return buffer;
}

/** CBOR byte string / text string headers for lengths below 65536 (all that is needed here). */
function cborHead(major: number, length: number): Buffer {
  if (length < 24) return Buffer.from([(major << 5) | length]);
  if (length < 256) return Buffer.from([(major << 5) | 24, length]);
  return Buffer.from([(major << 5) | 25, length >> 8, length & 0xff]);
}

function cborText(text: string): Buffer {
  const bytes = Buffer.from(text, 'utf8');
  return Buffer.concat([cborHead(3, bytes.length), bytes]);
}

function cborBytes(bytes: Buffer): Buffer {
  return Buffer.concat([cborHead(2, bytes.length), bytes]);
}

/** COSE_Key for ES256 (kty EC2, alg -7, crv P-256), hand-encoded. */
function coseEs256(x: Buffer, y: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from([0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21, 0x58, 0x20]),
    x,
    Buffer.from([0x22, 0x58, 0x20]),
    y,
  ]);
}

export class SoftAuthenticator {
  readonly credentialId: Buffer;
  readonly userHandle: Buffer;
  /** COSE public key, as stored in `admin_passkey.public_key`. */
  readonly publicKeyCose: Buffer;
  /** Signature counter reported by the last ceremony. */
  counter = 0;
  /** Sets the "backed up" flags (a synced passkey). */
  backedUp = false;
  private readonly privateKey: KeyObject;

  constructor() {
    const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const jwk = publicKey.export({ format: 'jwk' });
    this.privateKey = privateKey;
    this.publicKeyCose = coseEs256(
      Buffer.from(jwk.x ?? '', 'base64url'),
      Buffer.from(jwk.y ?? '', 'base64url'),
    );
    this.credentialId = randomBytes(32);
    this.userHandle = randomBytes(32);
  }

  get id(): string {
    return this.credentialId.toString('base64url');
  }

  private flags(up: boolean, uv: boolean, attested: boolean): number {
    return (
      (up ? FLAG_UP : 0) |
      (uv ? FLAG_UV : 0) |
      (attested ? FLAG_AT : 0) |
      (this.backedUp ? FLAG_BE | FLAG_BS : 0)
    );
  }

  private clientData(type: string, options: CeremonyOptions): Buffer {
    return Buffer.from(
      JSON.stringify({
        type,
        challenge: options.challenge,
        origin: options.origin,
        crossOrigin: false,
      }),
    );
  }

  /** Attestation `none` registration response. */
  register(options: CeremonyOptions): SoftRegistrationResponse {
    this.counter = options.counter ?? this.counter + 1;
    const credentialIdLength = Buffer.alloc(2);
    credentialIdLength.writeUInt16BE(this.credentialId.length);
    const authData = Buffer.concat([
      sha256(options.rpId),
      Buffer.from([this.flags(options.up ?? true, options.uv ?? true, true)]),
      uint32(this.counter),
      Buffer.alloc(16), // AAGUID
      credentialIdLength,
      this.credentialId,
      this.publicKeyCose,
    ]);
    const attestationObject = Buffer.concat([
      Buffer.from([0xa3]),
      cborText('fmt'),
      cborText('none'),
      cborText('attStmt'),
      Buffer.from([0xa0]),
      cborText('authData'),
      cborBytes(authData),
    ]);
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key',
      response: {
        clientDataJSON: this.clientData('webauthn.create', options).toString('base64url'),
        attestationObject: attestationObject.toString('base64url'),
        transports: ['internal'],
      },
      clientExtensionResults: {},
      authenticatorAttachment: 'platform',
    };
  }

  /** Assertion for an authentication or re-check ceremony. */
  assert(options: CeremonyOptions): SoftAssertionResponse {
    this.counter = options.counter ?? this.counter + 1;
    const authenticatorData = Buffer.concat([
      sha256(options.rpId),
      Buffer.from([this.flags(options.up ?? true, options.uv ?? true, false)]),
      uint32(this.counter),
    ]);
    const clientDataJSON = this.clientData('webauthn.get', options);
    const signature = sign(
      'sha256',
      Buffer.concat([authenticatorData, sha256(clientDataJSON)]),
      this.privateKey,
    );
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key',
      response: {
        clientDataJSON: clientDataJSON.toString('base64url'),
        authenticatorData: authenticatorData.toString('base64url'),
        signature: signature.toString('base64url'),
        userHandle: this.userHandle.toString('base64url'),
      },
      clientExtensionResults: {},
      authenticatorAttachment: 'platform',
    };
  }
}
