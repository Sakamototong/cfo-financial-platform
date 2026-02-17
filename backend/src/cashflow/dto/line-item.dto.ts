export class UpdateCashFlowLineItemDto {
  readonly operating_cash_inflow?: number;
  readonly operating_cash_outflow?: number;
  readonly investing_cash_inflow?: number;
  readonly investing_cash_outflow?: number;
  readonly financing_cash_inflow?: number;
  readonly financing_cash_outflow?: number;
  readonly notes?: string;
}

export class BulkUpdateLineItemsDto {
  readonly updates!: {
    week_number: number;
    data: UpdateCashFlowLineItemDto;
  }[];
}
