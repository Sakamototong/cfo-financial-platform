export enum ObjectType {
  COA_ENTRY = 'coa_entry',
  BUDGET = 'budget',
  BUDGET_LINE = 'budget_line',
  STATEMENT = 'statement',
  SCENARIO = 'scenario',
  FORECAST = 'cash_flow_forecast',
}

export enum ChangeType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  RESTORE = 'restore',
}

export class CreateVersionDto {
  readonly object_type!: string;
  readonly object_id!: string;
  readonly version_label?: string;
  readonly snapshot_data!: any;
  readonly change_type!: string;
  readonly change_summary?: string;
  readonly changed_fields?: string[];
}

export class RestoreVersionDto {
  readonly version_number!: number;
  readonly restore_note?: string;
}

export class CompareVersionsDto {
  readonly version_from!: number;
  readonly version_to!: number;
  readonly save_comparison?: boolean;
  readonly notes?: string;
}

export class UpdatePolicyDto {
  readonly is_enabled?: boolean;
  readonly auto_snapshot_on_create?: boolean;
  readonly auto_snapshot_on_update?: boolean;
  readonly auto_snapshot_on_delete?: boolean;
  readonly max_versions_per_object?: number;
  readonly retention_days?: number;
}
