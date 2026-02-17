import { ApiProperty } from '@nestjs/swagger';

export class TransferOwnershipDto {
  @ApiProperty({ description: 'Email of the new owner' })
  new_owner_email!: string;

  @ApiProperty({ required: false, description: 'Reason for transfer' })
  reason?: string;
}

export class AcceptOwnershipDto {
  @ApiProperty({ description: 'Transfer request ID' })
  transfer_request_id!: string;

  @ApiProperty({ required: false, description: 'Acceptance message' })
  message?: string;
}

export class RejectOwnershipDto {
  @ApiProperty({ description: 'Transfer request ID' })
  transfer_request_id!: string;

  @ApiProperty({ required: false, description: 'Rejection reason' })
  reason?: string;
}
