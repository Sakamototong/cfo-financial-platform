import React, { useState, useEffect, useRef } from 'react';
import api from '../api/client';

interface Template {
  id: string;
  template_name: string;
  template_type: string;
  description: string;
  file_format: string;
  column_mappings: any;
}

interface ImportLog {
  id: string;
  template_id: string;
  template_name: string;
  file_name: string;
  status: string;
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  imported_rows: number;
  started_at: string;
  completed_at: string;
}

interface Transaction {
  id: string;
  transaction_date: string;
  description: string;
  amount: string;
  account_code: string;
  account_name?: string;
  vendor_customer: string;
  department: string;
  category: string;
  document_number: string;
  status: string;
  validation_status: string;
}

const ETLImport: React.FC = () => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [importLogs, setImportLogs] = useState<ImportLog[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedTransactions, setSelectedTransactions] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'upload' | 'review' | 'history'>('upload');
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fallback templates when API is not available
  const FALLBACK_TEMPLATES: Template[] = [
    {
      id: 'quickbooks',
      template_name: 'QuickBooks Transaction Export',
      template_type: 'quickbooks',
      description: 'Standard QuickBooks transaction export format (Transaction List by Date)',
      file_format: 'csv',
      column_mappings: {
        date: { source_column: 'Date', type: 'date', format: 'MM/DD/YYYY', required: true },
        memo: { source_column: 'Memo/Description', type: 'string', target: 'description' },
        name: { source_column: 'Name', type: 'string', target: 'vendor_customer' },
        amount: { source_column: 'Amount', type: 'number', required: true },
        account: { source_column: 'Account', type: 'string', target: 'account_code' },
        num: { source_column: 'Num', type: 'string' },
        transaction_type: { source_column: 'Transaction Type', type: 'string' },
      },
    },
    {
      id: 'xero',
      template_name: 'Xero Bank Statement',
      template_type: 'xero',
      description: 'Xero bank statement export format',
      file_format: 'csv',
      column_mappings: {
        date: { source_column: 'Date', type: 'date', format: 'DD/MM/YYYY', required: true },
        description: { source_column: 'Description', type: 'string' },
        payee: { source_column: 'Payee', type: 'string', target: 'vendor_customer' },
        amount: { source_column: 'Amount', type: 'number', required: true },
        account_code: { source_column: 'Account Code', type: 'string' },
        reference: { source_column: 'Reference', type: 'string', target: 'reference_number' },
      },
    },
    {
      id: 'thai_accounting',
      template_name: 'Thai Accounting Software Export',
      template_type: 'thai_accounting',
      description: 'รูปแบบการ export จากโปรแกรมบัญชีไทย (Express, MYOB, Smart)',
      file_format: 'csv',
      column_mappings: {
        date: { source_column: 'วันที่', type: 'date', format: 'DD/MM/YYYY', required: true },
        document_no: { source_column: 'เลขที่เอกสาร', type: 'string', target: 'document_number' },
        description: { source_column: 'รายการ', type: 'string' },
        account_code: { source_column: 'รหัสบัญชี', type: 'string' },
        account_name: { source_column: 'ชื่อบัญชี', type: 'string' },
        debit: { source_column: 'เดบิต', type: 'number' },
        credit: { source_column: 'เครดิต', type: 'number' },
        reference: { source_column: 'อ้างอิง', type: 'string', target: 'reference_number' },
      },
    },
    {
      id: 'custom',
      template_name: 'Generic Transaction Import',
      template_type: 'custom',
      description: 'Generic CSV format - configure your own column mapping',
      file_format: 'csv',
      column_mappings: {
        date: { source_column: 'Date', type: 'date', required: true },
        description: { source_column: 'Description', type: 'string' },
        amount: { source_column: 'Amount', type: 'number', required: true },
        account_code: { source_column: 'Account', type: 'string' },
        reference: { source_column: 'Reference', type: 'string', target: 'reference_number' },
      },
    },
  ];

  useEffect(() => { loadTemplates(); loadImportLogs(); }, []);
  useEffect(() => { if (selectedLogId) { loadTransactions(selectedLogId); } else { loadTransactions(); } }, [selectedLogId]);

  const loadTemplates = async () => {
    try {
      const response = await api.get('/etl/templates');
      if (response.data && response.data.length > 0) {
        setTemplates(response.data);
        setSelectedTemplate(response.data[0]);
        return;
      }
    } catch (error) { console.error('Error loading templates from API, using fallback:', error); }
    // Fallback to embedded templates
    setTemplates(FALLBACK_TEMPLATES);
    setSelectedTemplate(FALLBACK_TEMPLATES[0]);
  };

  const loadImportLogs = async () => {
    try { const response = await api.get('/etl/imports'); setImportLogs(response.data); }
    catch (error) { console.error('Error loading import logs:', error); }
  };

  const loadTransactions = async (logId?: string) => {
    try {
      const url = logId ? `/etl/transactions?log_id=${logId}` : '/etl/transactions';
      const response = await api.get(url);
      setTransactions(response.data);
    } catch (error) { console.error('Error loading transactions:', error); }
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) setFile(droppedFile);
  };
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) setFile(e.target.files[0]);
  };

  const parseCSV = (text: string): any[] => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length === 0) return [];
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const row: any = {};
      headers.forEach((header, index) => { row[header] = values[index] || ''; });
      rows.push(row);
    }
    return rows;
  };

  const handleUpload = async () => {
    if (!file || !selectedTemplate) {
      alert('กรุณาเลือกไฟล์และ template');
      return;
    }
    setIsUploading(true); setUploadResult(null);
    try {
      const text = await file.text();
      const parsedData = parseCSV(text);
      const response = await api.post('/etl/import', {
        template_id: selectedTemplate.id, file_data: parsedData, auto_approve: false
      });
      setUploadResult(response.data);
      loadImportLogs();
      setActiveTab('review');
      setSelectedLogId(response.data.import_log_id);
    } catch (error: any) {
      console.error('Error uploading file:', error);
      alert('เกิดข้อผิดพลาดในการอัปโหลด: ' + (error.response?.data?.message || error.message));
    } finally { setIsUploading(false); }
  };

  const handleApprove = async (transactionIds: string[]) => {
    try {
      await api.post('/etl/transactions/approve', { transaction_ids: transactionIds });
      loadTransactions(selectedLogId || undefined);
      setSelectedTransactions([]);
      alert('อนุมัติธุรกรรมสำเร็จ');
    } catch (error) {
      console.error('Error approving:', error);
      alert('เกิดข้อผิดพลาดในการอนุมัติ');
    }
  };

  const handleDelete = async (transactionId: string) => {
    if (!confirm('คุณต้องการลบธุรกรรมนี้หรือไม่?')) return;
    try {
      await api.delete(`/etl/transactions/${transactionId}`);
      loadTransactions(selectedLogId || undefined);
      alert('ลบธุรกรรมสำเร็จ');
    } catch (error) {
      console.error('Error deleting:', error);
      alert('เกิดข้อผิดพลาดในการลบ');
    }
  };

  const toggleTransactionSelection = (id: string) => {
    setSelectedTransactions(prev => prev.includes(id) ? prev.filter(txId => txId !== id) : [...prev, id]);
  };
  const toggleSelectAll = () => {
    if (selectedTransactions.length === transactions.length) setSelectedTransactions([]);
    else setSelectedTransactions(transactions.map(tx => tx.id));
  };

  const getTemplateIcon = (type: string) => {
    switch (type) {
      case 'quickbooks': return 'bi-bar-chart';
      case 'xero': return 'bi-briefcase';
      case 'thai_accounting': return 'bi-flag';
      case 'custom': return 'bi-gear';
      default: return 'bi-file-earmark';
    }
  };

  // ===== Sample Data for Downloads =====
  const sampleDataMap: Record<string, { filename: string; content: string }> = {
    quickbooks: {
      filename: 'sample_quickbooks.csv',
      content: [
        'Transaction Type,Date,Num,Name,Memo/Description,Account,Split,Amount,Balance',
        'Invoice,01/15/2026,INV-1001,Acme Corp,IT Consulting Services - January,Accounts Receivable,Consulting Revenue,150000.00,150000.00',
        'Bill,01/18/2026,BILL-2001,Office Supply Co.,Office supplies and printer toner,Office Supplies,Accounts Payable,-8500.00,141500.00',
        'Payment,01/20/2026,CHK-3001,Landlord Co.,Monthly office rent - January,Rent Expense,Checking,-45000.00,96500.00',
        'Invoice,01/25/2026,INV-1002,Beta Industries,Software Development Phase 1,Accounts Receivable,Service Revenue,280000.00,376500.00',
        'Bill,01/28/2026,BILL-2002,Cloud Host Ltd,AWS hosting - January,Cloud Hosting,Accounts Payable,-12000.00,364500.00',
        'Payment,01/30/2026,CHK-3002,Thai Insurance Co,Business insurance premium,Insurance Expense,Checking,-18000.00,346500.00',
        'Invoice,02/01/2026,INV-1003,Gamma Solutions,Data Migration Project,Accounts Receivable,Consulting Revenue,95000.00,441500.00',
        'Bill,02/05/2026,BILL-2003,Power Company,Electricity bill - January,Utilities,Accounts Payable,-4200.00,437300.00',
      ].join('\n'),
    },
    xero: {
      filename: 'sample_xero_bank.csv',
      content: [
        'Date,Description,Reference,Check Number,Amount,Payee,Account Code',
        '15/01/2026,Consulting revenue from client,INV-1001,,150000.00,Acme Corp,4000',
        '18/01/2026,Office supplies purchase,BILL-2001,,-8500.00,Office Supply Co.,5100',
        '20/01/2026,Monthly office rent,CHK-3001,3001,-45000.00,Landlord Co.,5200',
        '25/01/2026,Software development payment,INV-1002,,280000.00,Beta Industries,4100',
        '28/01/2026,Cloud hosting charges,BILL-2002,,-12000.00,Cloud Host Ltd,5300',
        '30/01/2026,Insurance premium,CHK-3002,3002,-18000.00,Thai Insurance Co,5400',
        '01/02/2026,Data migration project,INV-1003,,95000.00,Gamma Solutions,4000',
        '05/02/2026,Electricity bill,BILL-2003,,-4200.00,Power Company,5500',
      ].join('\n'),
    },
    thai_accounting: {
      filename: 'sample_thai_accounting.csv',
      content: [
        'วันที่,เลขที่เอกสาร,รายการ,รหัสบัญชี,ชื่อบัญชี,เดบิต,เครดิต,อ้างอิง',
        '15/01/2569,JV-001,รายได้ค่าบริการที่ปรึกษา,4100,รายได้จากการให้บริการ,,150000.00,INV-1001',
        '15/01/2569,JV-001,รับชำระค่าบริการ,1100,ลูกหนี้การค้า,150000.00,,INV-1001',
        '18/01/2569,JV-002,ซื้อวัสดุสำนักงาน,5100,วัสดุสำนักงาน,8500.00,,BILL-2001',
        '18/01/2569,JV-002,บันทึกเจ้าหนี้,2100,เจ้าหนี้การค้า,,8500.00,BILL-2001',
        '20/01/2569,JV-003,ค่าเช่าสำนักงาน ม.ค.,5200,ค่าเช่าสำนักงาน,45000.00,,CHK-3001',
        '20/01/2569,JV-003,จ่ายค่าเช่า,1000,เงินฝากธนาคาร,,45000.00,CHK-3001',
        '25/01/2569,JV-004,รายได้พัฒนาซอฟต์แวร์,4200,รายได้จากพัฒนาซอฟต์แวร์,,280000.00,INV-1002',
        '25/01/2569,JV-004,รับชำระเงิน,1100,ลูกหนี้การค้า,280000.00,,INV-1002',
        '28/01/2569,JV-005,ค่า Cloud Hosting,5300,ค่าบริการคลาวด์,12000.00,,BILL-2002',
        '28/01/2569,JV-005,บันทึกเจ้าหนี้,2100,เจ้าหนี้การค้า,,12000.00,BILL-2002',
        '30/01/2569,JV-006,เบี้ยประกันภัย,5400,ค่าประกันภัย,18000.00,,CHK-3002',
        '30/01/2569,JV-006,จ่ายเบี้ยประกัน,1000,เงินฝากธนาคาร,,18000.00,CHK-3002',
      ].join('\n'),
    },
    custom: {
      filename: 'sample_generic.csv',
      content: [
        'Date,Description,Amount,Account,Reference',
        '2026-01-15,IT Consulting Services,150000.00,4100,INV-1001',
        '2026-01-18,Office Supplies Purchase,-8500.00,5100,BILL-2001',
        '2026-01-20,Monthly Office Rent,-45000.00,5200,CHK-3001',
        '2026-01-25,Software Development,280000.00,4200,INV-1002',
        '2026-01-28,Cloud Hosting Charges,-12000.00,5300,BILL-2002',
        '2026-01-30,Insurance Premium,-18000.00,5400,CHK-3002',
        '2026-02-01,Data Migration Project,95000.00,4000,INV-1003',
        '2026-02-05,Electricity Bill,-4200.00,5500,BILL-2003',
      ].join('\n'),
    },
  };

  const downloadSampleFile = (templateType: string) => {
    const sample = sampleDataMap[templateType];
    if (!sample) return;
    // Use BOM for Thai CSV so Excel opens correctly
    const bom = '﻿';
    const blob = new Blob([bom + sample.content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = sample.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { text: string; cls: string }> = {
      pending: { text: 'รอดำเนินการ', cls: 'text-bg-warning' },
      approved: { text: 'อนุมัติแล้ว', cls: 'text-bg-success' },
      rejected: { text: 'ปฏิเสธ', cls: 'text-bg-danger' },
      processing: { text: 'กำลังประมวลผล', cls: 'text-bg-info' },
      completed: { text: 'เสร็จสมบูรณ์', cls: 'text-bg-success' },
      failed: { text: 'ล้มเหลว', cls: 'text-bg-danger' },
      partially_completed: { text: 'เสร็จบางส่วน', cls: 'text-bg-warning' }
    };
    const badge = badges[status] || { text: status, cls: 'text-bg-secondary' };
    return <span className={`badge ${badge.cls}`}>{badge.text}</span>;
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const formatAmount = (amount: string | number) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
  };

  const pendingCount = transactions.filter(t => t.status === 'pending').length;

  return (
    <>
      {/* Page Header */}
      <div className="card mb-3">
        <div className="card-header">
          <h3 className="card-title"><i className="bi bi-box-arrow-in-down me-2"></i>Enhanced ETL Import</h3>
        </div>
        <div className="card-body py-2">
          <small className="text-muted">นำเข้าข้อมูลจาก QuickBooks, Xero, หรือโปรแกรมบัญชีไทย</small>
        </div>
      </div>

      {/* Tabs */}
      <ul className="nav nav-tabs mb-3">
        <li className="nav-item">
          <button className={`nav-link ${activeTab === 'upload' ? 'active' : ''}`} onClick={() => setActiveTab('upload')}>
            <i className="bi bi-upload me-1"></i>อัปโหลดไฟล์
          </button>
        </li>
        <li className="nav-item">
          <button className={`nav-link ${activeTab === 'review' ? 'active' : ''}`} onClick={() => setActiveTab('review')}>
            <i className="bi bi-check2-square me-1"></i>ตรวจสอบและอนุมัติ
            {pendingCount > 0 && <span className="badge text-bg-danger ms-1">{pendingCount}</span>}
          </button>
        </li>
        <li className="nav-item">
          <button className={`nav-link ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
            <i className="bi bi-clock-history me-1"></i>ประวัติการ Import
          </button>
        </li>
      </ul>

      {/* Upload Tab */}
      {activeTab === 'upload' && (
        <>
          {/* Template Selector */}
          <div className="card mb-3">
            <div className="card-header">
              <h3 className="card-title"><i className="bi bi-grid me-2"></i>เลือกรูปแบบไฟล์</h3>
            </div>
            <div className="card-body">
              <div className="row g-3">
                {templates.map(template => (
                  <div key={template.id} className="col-md-3 col-sm-6">
                    <div
                      className={`card h-100 ${selectedTemplate?.id === template.id ? 'border-primary shadow-sm' : ''}`}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedTemplate(template)}
                    >
                      <div className="card-body text-center">
                        <i className={`bi ${getTemplateIcon(template.template_type)} d-block mb-2`} style={{ fontSize: '2rem' }}></i>
                        <h6 className="card-title mb-1">{template.template_name}</h6>
                        <small className="text-muted">{template.description}</small>
                        {sampleDataMap[template.template_type] && (
                          <div className="mt-2">
                            <button
                              className="btn btn-outline-info btn-sm"
                              onClick={(e) => { e.stopPropagation(); downloadSampleFile(template.template_type); }}
                              title="ดาวน์โหลดไฟล์ตัวอย่าง"
                            >
                              <i className="bi bi-download me-1"></i>ตัวอย่าง
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Column Mapping */}
          {selectedTemplate && (
            <div className="card mb-3">
              <div className="card-header d-flex justify-content-between align-items-center">
                <h3 className="card-title mb-0"><i className="bi bi-arrow-left-right me-2"></i>Column Mapping</h3>
                {sampleDataMap[selectedTemplate.template_type] && (
                  <button
                    className="btn btn-info btn-sm"
                    onClick={() => downloadSampleFile(selectedTemplate.template_type)}
                  >
                    <i className="bi bi-download me-1"></i>ดาวน์โหลดไฟล์ตัวอย่าง
                  </button>
                )}
              </div>
              <div className="card-body">
                <p className="text-muted small mb-2">Template นี้จะจับคู่คอลัมน์ดังนี้:</p>
                <div className="table-responsive">
                  <table className="table table-sm table-bordered mb-0">
                    <thead className="table-light">
                      <tr><th>Source Column</th><th></th><th>Target</th><th>Required</th></tr>
                    </thead>
                    <tbody>
                      {Object.entries(selectedTemplate.column_mappings).slice(0, 5).map(([key, config]: [string, any]) => (
                        <tr key={key}>
                          <td><code>{config.source_column}</code></td>
                          <td className="text-center"><i className="bi bi-arrow-right"></i></td>
                          <td>{config.target || key}</td>
                          <td>{config.required ? <span className="badge text-bg-danger">Required</span> : <span className="badge text-bg-secondary">Optional</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {Object.keys(selectedTemplate.column_mappings).length > 5 && (
                  <small className="text-muted mt-2 d-block">+ {Object.keys(selectedTemplate.column_mappings).length - 5} คอลัมน์เพิ่มเติม</small>
                )}
              </div>
            </div>
          )}

          {/* Drop Zone */}
          <div className="card mb-3">
            <div
              className={`card-body text-center py-5 ${isDragging ? 'bg-light' : ''}`}
              style={{ border: '2px dashed #dee2e6', borderRadius: '0.375rem', cursor: 'pointer' }}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFileSelect} style={{ display: 'none' }} />
              {file ? (
                <>
                  <i className="bi bi-file-earmark-check d-block mb-2" style={{ fontSize: '2.5rem', color: '#198754' }}></i>
                  <h6>{file.name}</h6>
                  <small className="text-muted">{(file.size / 1024).toFixed(2)} KB</small>
                  <div className="mt-2">
                    <button className="btn btn-outline-secondary btn-sm" onClick={(e) => { e.stopPropagation(); setFile(null); }}>
                      <i className="bi bi-arrow-repeat me-1"></i>เปลี่ยนไฟล์
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <i className="bi bi-cloud-arrow-up d-block mb-2" style={{ fontSize: '2.5rem', color: '#6c757d' }}></i>
                  <h6>ลากไฟล์มาวางที่นี่</h6>
                  <small className="text-muted">หรือคลิกเพื่อเลือกไฟล์</small>
                  <div className="mt-1"><small className="text-muted">รองรับ: CSV, Excel (.xlsx, .xls)</small></div>
                </>
              )}
            </div>
          </div>

          {/* Upload Result */}
          {uploadResult && (
            <div className={`alert ${uploadResult.invalid_rows > 0 ? 'alert-warning' : 'alert-success'} mb-3`}>
              <h6><i className="bi bi-bar-chart me-1"></i>ผลการนำเข้า</h6>
              <div className="d-flex gap-3 mb-2">
                <span>ทั้งหมด: <strong>{uploadResult.total_rows}</strong></span>
                <span className="text-success">สำเร็จ: <strong>{uploadResult.valid_rows}</strong></span>
                {uploadResult.invalid_rows > 0 && <span className="text-danger">ไม่ผ่าน: <strong>{uploadResult.invalid_rows}</strong></span>}
              </div>
              {uploadResult.errors && uploadResult.errors.length > 0 && (
                <div>
                  <strong>ข้อผิดพลาด:</strong>
                  <ul className="mb-0 mt-1">{uploadResult.errors.map((err: string, idx: number) => <li key={idx}>{err}</li>)}</ul>
                </div>
              )}
            </div>
          )}

          {/* Upload Button */}
          <button className="btn btn-primary btn-lg" onClick={handleUpload} disabled={!file || !selectedTemplate || isUploading}>
            {isUploading ? (
              <><span className="spinner-border spinner-border-sm me-2"></span>กำลังประมวลผล...</>
            ) : (
              <><i className="bi bi-rocket-takeoff me-2"></i>เริ่มนำเข้าข้อมูล</>
            )}
          </button>
        </>
      )}

      {/* Review Tab */}
      {activeTab === 'review' && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title"><i className="bi bi-check2-square me-2"></i>ตรวจสอบและอนุมัติธุรกรรม</h3>
            {transactions.length > 0 && (
              <div className="card-tools d-flex gap-2">
                <button className="btn btn-outline-secondary btn-sm" onClick={toggleSelectAll}>
                  {selectedTransactions.length === transactions.length
                    ? <><i className="bi bi-x-square me-1"></i>ยกเลิกทั้งหมด</>
                    : <><i className="bi bi-check2-all me-1"></i>เลือกทั้งหมด</>}
                </button>
                {selectedTransactions.length > 0 && (
                  <button className="btn btn-success btn-sm" onClick={() => handleApprove(selectedTransactions)}>
                    <i className="bi bi-check-lg me-1"></i>อนุมัติที่เลือก ({selectedTransactions.length})
                  </button>
                )}
              </div>
            )}
          </div>
          {transactions.length === 0 ? (
            <div className="card-body text-center text-muted py-5">
              <i className="bi bi-inbox d-block mb-2" style={{ fontSize: '2.5rem' }}></i>
              <h5>ยังไม่มีธุรกรรมที่รอการอนุมัติ</h5>
              <p>เริ่มต้นด้วยการอัปโหลดไฟล์ในแท็บ "อัปโหลดไฟล์"</p>
            </div>
          ) : (
            <div className="card-body p-0">
              <div className="table-responsive">
                <table className="table table-hover table-striped mb-0">
                  <thead className="table-light">
                    <tr>
                      <th><input type="checkbox" className="form-check-input" checked={selectedTransactions.length === transactions.length} onChange={toggleSelectAll} /></th>
                      <th>วันที่</th>
                      <th>รายละเอียด</th>
                      <th className="text-end">จำนวนเงิน</th>
                      <th>บัญชี</th>
                      <th>ผู้ขาย/ลูกค้า</th>
                      <th>แผนก</th>
                      <th>สถานะ</th>
                      <th>จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map(tx => (
                      <tr key={tx.id} className={selectedTransactions.includes(tx.id) ? 'table-active' : ''}>
                        <td><input type="checkbox" className="form-check-input" checked={selectedTransactions.includes(tx.id)} onChange={() => toggleTransactionSelection(tx.id)} /></td>
                        <td>{formatDate(tx.transaction_date)}</td>
                        <td>{tx.description}</td>
                        <td className="text-end">{formatAmount(tx.amount)}</td>
                        <td>
                          <code>{tx.account_code || '-'}</code>
                          {tx.account_name && <><br /><small className="text-muted">{tx.account_name}</small></>}
                        </td>
                        <td>{tx.vendor_customer || '-'}</td>
                        <td>{tx.department || '-'}</td>
                        <td>{getStatusBadge(tx.status)}</td>
                        <td>
                          {tx.status === 'pending' && (
                            <div className="btn-group btn-group-sm">
                              <button className="btn btn-outline-success" onClick={() => handleApprove([tx.id])} title="อนุมัติ"><i className="bi bi-check-lg"></i></button>
                              <button className="btn btn-outline-danger" onClick={() => handleDelete(tx.id)} title="ลบ"><i className="bi bi-trash"></i></button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title"><i className="bi bi-clock-history me-2"></i>ประวัติการ Import</h3>
          </div>
          {importLogs.length === 0 ? (
            <div className="card-body text-center text-muted py-5">
              <i className="bi bi-folder2-open d-block mb-2" style={{ fontSize: '2.5rem' }}></i>
              <h5>ยังไม่มีประวัติการ Import</h5>
            </div>
          ) : (
            <div className="card-body p-0">
              <div className="list-group list-group-flush">
                {importLogs.map(log => (
                  <div
                    key={log.id}
                    className={`list-group-item list-group-item-action ${selectedLogId === log.id ? 'active' : ''}`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => { setSelectedLogId(log.id); setActiveTab('review'); }}
                  >
                    <div className="d-flex justify-content-between align-items-start">
                      <div>
                        <h6 className="mb-1"><i className="bi bi-file-earmark me-1"></i>{log.file_name}</h6>
                        <small className={selectedLogId === log.id ? '' : 'text-muted'}>
                          Template: {log.template_name} &bull; {formatDate(log.started_at)}
                        </small>
                      </div>
                      <div className="text-end">
                        {getStatusBadge(log.status)}
                        <div className="mt-1">
                          <small>
                            รวม: {log.total_rows} &bull;{' '}
                            <span className="text-success">สำเร็จ: {log.valid_rows}</span>
                            {log.invalid_rows > 0 && (
                              <> &bull; <span className="text-danger">ล้มเหลว: {log.invalid_rows}</span></>
                            )}
                          </small>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default ETLImport;
