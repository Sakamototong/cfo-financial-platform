import { PartialType } from '@nestjs/mapped-types';
import { CreateCoaDto } from './create-coa.dto';

export class UpdateCoaDto extends PartialType(CreateCoaDto) {}
