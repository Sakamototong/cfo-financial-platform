import { Injectable } from '@nestjs/common';
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

@Injectable()
export class KmsService {
  private masterKey: Buffer;

  constructor() {
    const env = process.env.KMS_MASTER_KEY;
    if (env) {
      // Expect base64-encoded 32 bytes
      this.masterKey = Buffer.from(env, 'base64');
    } else {
      // Fallback to ephemeral key (not persistent) for local POC
      this.masterKey = randomBytes(32);
      console.warn('KMS_MASTER_KEY not set; using ephemeral master key');
    }
    if (this.masterKey.length !== 32) {
      throw new Error('KMS_MASTER_KEY must be 32 bytes (base64-encoded 32 bytes)');
    }
  }

  async encrypt(plaintext: string): Promise<string> {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.masterKey, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    // Format: base64(iv|tag|ciphertext)
    const out = Buffer.concat([iv, tag, ciphertext]).toString('base64');
    return out;
  }

  async decrypt(blob: string): Promise<string> {
    const data = Buffer.from(blob, 'base64');
    const iv = data.slice(0, 12);
    const tag = data.slice(12, 28);
    const ciphertext = data.slice(28);
    const decipher = createDecipheriv('aes-256-gcm', this.masterKey, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    return plain;
  }
}
