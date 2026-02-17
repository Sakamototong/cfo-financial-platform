export class CreateCashFlowForecastDto {
  readonly forecast_name!: string;
  readonly start_date!: string; // ISO date string
  readonly weeks?: number; // Default 13
  readonly beginning_cash?: number; // Default 0
  readonly notes?: string;
  readonly created_by?: string;
}

export class UpdateCashFlowForecastDto {
  readonly forecast_name?: string;
  readonly beginning_cash?: number;
  readonly status?: 'draft' | 'active' | 'archived';
  readonly notes?: string;
}
