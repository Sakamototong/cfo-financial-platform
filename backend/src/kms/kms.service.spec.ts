import { KmsService } from './kms.service';

describe('KmsService', () => {
  let service: KmsService;

  beforeEach(() => {
    // Use exactly 32-byte base64 key
    process.env.KMS_MASTER_KEY = 'AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA=';
    service = new KmsService();
  });

  describe('encrypt and decrypt', () => {
    it('should encrypt and decrypt data correctly', async () => {
      const plaintext = 'sensitive-password-123';
      const encrypted = await service.encrypt(plaintext);
      expect(encrypted).toBeDefined();
      expect(encrypted).not.toBe(plaintext);
      
      const decrypted = await service.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertext for same plaintext (IV randomness)', async () => {
      const plaintext = 'test-data';
      const encrypted1 = await service.encrypt(plaintext);
      const encrypted2 = await service.encrypt(plaintext);
      expect(encrypted1).not.toBe(encrypted2);
      
      const decrypted1 = await service.decrypt(encrypted1);
      const decrypted2 = await service.decrypt(encrypted2);
      expect(decrypted1).toBe(plaintext);
      expect(decrypted2).toBe(plaintext);
    });

    it('should handle empty string', async () => {
      const plaintext = '';
      const encrypted = await service.encrypt(plaintext);
      const decrypted = await service.decrypt(encrypted);
      expect(decrypted).toBe('');
    });
  });
});
