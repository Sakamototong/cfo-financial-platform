export class UpdateBudgetDto {
  budget_name?: string;
  description?: string;
  status?: 'draft' | 'submitted' | 'approved' | 'rejected' | 'locked';
  notes?: string;
}
