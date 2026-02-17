export class CreateBudgetLineItemDto {
  account_code!: string;
  department?: string;
  cost_center?: string;
  january?: number;
  february?: number;
  march?: number;
  april?: number;
  may?: number;
  june?: number;
  july?: number;
  august?: number;
  september?: number;
  october?: number;
  november?: number;
  december?: number;
  notes?: string;
}

export class UpdateBudgetLineItemDto {
  [key: string]: number | string | undefined;
  january?: number;
  february?: number;
  march?: number;
  april?: number;
  may?: number;
  june?: number;
  july?: number;
  august?: number;
  september?: number;
  october?: number;
  november?: number;
  december?: number;
  notes?: string;
}
