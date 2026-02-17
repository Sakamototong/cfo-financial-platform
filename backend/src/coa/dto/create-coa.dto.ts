export enum AccountType {
  ASSET = 'asset',
  LIABILITY = 'liability',
  EQUITY = 'equity',
  REVENUE = 'revenue',
  EXPENSE = 'expense'
}

export enum NormalBalance {
  DEBIT = 'debit',
  CREDIT = 'credit'
}

export class CreateCoaDto {
  account_code!: string;
  account_name!: string;
  account_type!: AccountType;
  parent_account_code?: string;
  normal_balance!: NormalBalance;
  description?: string;
  level?: number;
  sort_order?: number;
  is_active?: boolean;
}
