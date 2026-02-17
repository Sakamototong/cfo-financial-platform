export class CreateBudgetDto {
  budget_name!: string;
  fiscal_year!: number;
  budget_type!: 'annual' | 'revised' | 'supplemental';
  description?: string;
  created_by?: string;
}
