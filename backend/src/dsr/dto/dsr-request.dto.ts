import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum DsrRequestType {
  ACCESS = 'access',
  DELETE = 'delete',
  PORTABILITY = 'portability',
  RECTIFY = 'rectify',
  RESTRICT = 'restrict',
}

export enum DsrRequestStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
}

export class CreateDsrRequestDto {
  @ApiProperty({
    enum: DsrRequestType,
    description: 'Type of data subject request',
    example: 'access',
  })
  request_type!: DsrRequestType;

  @ApiProperty({
    description: 'Email of the person making the request',
    example: 'john@example.com',
  })
  requester_email!: string;

  @ApiPropertyOptional({
    description: 'Full name of requester',
    example: 'John Doe',
  })
  requester_name?: string;

  @ApiPropertyOptional({
    description: 'Reason for the request',
    example: 'I want to exercise my GDPR rights to access my personal data',
  })
  request_reason?: string;

  @ApiPropertyOptional({
    description: 'Specific scope of data requested',
    example: { tables: ['users', 'transactions'], date_range: { from: '2024-01-01', to: '2024-12-31' } },
  })
  request_scope?: any;
}

export class UpdateDsrRequestDto {
  @ApiPropertyOptional({
    enum: DsrRequestStatus,
    description: 'New status for the request',
  })
  status?: DsrRequestStatus;

  @ApiPropertyOptional({
    description: 'Reason for rejection (if status = rejected)',
  })
  rejection_reason?: string;

  @ApiPropertyOptional({
    description: 'Notes for audit log',
  })
  notes?: string;
}

export class ApproveDsrRequestDto {
  @ApiProperty({
    description: 'Approval decision',
    example: true,
  })
  approved!: boolean;

  @ApiPropertyOptional({
    description: 'Notes/reason for decision',
  })
  notes?: string;

  @ApiPropertyOptional({
    description: 'Rejection reason if not approved',
  })
  rejection_reason?: string;
}

export class ProcessDsrRequestDto {
  @ApiPropertyOptional({
    description: 'Processing notes',
  })
  notes?: string;
}
