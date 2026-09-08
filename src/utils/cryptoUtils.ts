import crypto from "crypto";

const ALGORITHM = "aes-256-cbc";
const SALT = Buffer.from("salt"); // must match spx-service

/**
 * Encrypt the config payload with a key derived from the caller's X-Meta-Time.
 * Mirrors vehere-ui/src/utils/cryptoUtils.ts so the transport is identical.
 */
export function encryptJSON(data: unknown, passphrase: string): { iv: string; data: string } {
  const iv = crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(passphrase, SALT, 100000, 32, "sha256");
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final()]);
  return { iv: iv.toString("hex"), data: encrypted.toString("hex") };
}

export function decryptJSON(payload: string, ivHex: string, passphrase: string): unknown {
  const key = crypto.pbkdf2Sync(passphrase, SALT, 100000, 32, "sha256");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload, "hex")),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString("utf8"));
}
