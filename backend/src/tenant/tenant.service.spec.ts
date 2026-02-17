import { Test, TestingModule } from '@nestjs/testing';
import { TenantService } from './tenant.service';
import { KmsService } from '../kms/kms.service';
import { DatabaseService } from '../database/database.service';
import { LoggerService } from '../logger/logger.service';

describe('TenantService', () => {
  let service: TenantService;
  let kmsService: jest.Mocked<KmsService>;
  let dbService: jest.Mocked<DatabaseService>;
  let loggerService: jest.Mocked<LoggerService>;

  beforeEach(async () => {
    const mockKms = {
      encrypt: jest.fn().mockImplementation((data: string) => Promise.resolve(`encrypted_${data}`)),
      decrypt: jest.fn().mockImplementation((data: string) => Promise.resolve(data.replace('encrypted_', '')))
    };

    const mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 })
    };

    const mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantService,
        { provide: KmsService, useValue: mockKms },
        { provide: DatabaseService, useValue: mockDb },
        { provide: LoggerService, useValue: mockLogger }
      ]
    }).compile();

    service = module.get<TenantService>(TenantService);
    kmsService = module.get(KmsService);
    dbService = module.get(DatabaseService);
    loggerService = module.get(LoggerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getTenant', () => {
    it('should return null when tenant not found', async () => {
      dbService.query.mockResolvedValue({ rows: [], rowCount: 0 } as any);
      const result = await service.getTenant('non-existent-id');
      expect(result).toBeNull();
    });
  });
});
