export class ImportTransactionDto {
  transaction_date!: string;
  description?: string;
  amount!: number;
  account_code?: string;
  department?: string;
  cost_center?: string;
  transaction_type?: string;
  category?: string;
  document_number?: string;
  reference_number?: string;
  vendor_customer?: string;
  custom_fields?: any;
}

export class ProcessImportDto {
  template_id!: string;
  file_data!: any[]; // Array of rows from CSV/Excel
  auto_approve?: boolean;
}

export class UpdateTransactionDto {
  account_code?: string;
  department?: string;
  cost_center?: string;
  transaction_type?: string;
  category?: string;
  status?: string;
}
