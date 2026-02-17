export class CreateImportTemplateDto {
  template_name!: string;
  template_type!: string;
  description?: string;
  file_format?: string;
  column_mappings!: any;
  validation_rules?: any;
  transformation_rules?: any;
  sample_data?: any;
}

export class UpdateImportTemplateDto {
  template_name?: string;
  description?: string;
  column_mappings?: any;
  validation_rules?: any;
  transformation_rules?: any;
  is_active?: boolean;
}
