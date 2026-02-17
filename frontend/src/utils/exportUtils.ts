/**
 * Export Utilities for Excel and PDF
 * Provides functions to export tables and data to Excel and PDF formats
 */

// Export to CSV (compatible with Excel)
export const exportToCSV = (data: any[], filename: string) => {
  if (!data || data.length === 0) {
    alert('No data to export');
    return;
  }

  // Get headers from first object
  const headers = Object.keys(data[0]);
  
  // Create CSV content
  const csvContent = [
    headers.join(','), // Header row
    ...data.map(row => 
      headers.map(header => {
        const value = row[header];
        // Handle values with commas, quotes, or newlines
        if (value === null || value === undefined) return '';
        const stringValue = String(value);
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      }).join(',')
    )
  ].join('\n');

  // Create blob and download
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// Export to Excel (using HTML table method)
export const exportToExcel = (tableId: string, filename: string) => {
  const table = document.getElementById(tableId);
  if (!table) {
    alert('Table not found');
    return;
  }

  // Clone table to avoid modifying original
  const clonedTable = table.cloneNode(true) as HTMLElement;
  
  // Remove any action columns or buttons
  const actionCells = clonedTable.querySelectorAll('.actions, .action-buttons, button, .btn-delete, .btn-edit');
  actionCells.forEach(cell => cell.remove());

  const html = clonedTable.outerHTML;
  const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.xls`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// Export table to Excel from data array
export const exportTableToExcel = (data: any[], filename: string, sheetName: string = 'Sheet1') => {
  if (!data || data.length === 0) {
    alert('No data to export');
    return;
  }

  const headers = Object.keys(data[0]);
  
  // Create HTML table
  let html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">';
  html += '<head><meta charset="UTF-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets>';
  html += `<x:ExcelWorksheet><x:Name>${sheetName}</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet>`;
  html += '</x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head><body>';
  html += '<table border="1">';
  
  // Headers
  html += '<thead><tr>';
  headers.forEach(header => {
    html += `<th style="background-color: #4f46e5; color: white; font-weight: bold; padding: 8px;">${header}</th>`;
  });
  html += '</tr></thead>';
  
  // Data rows
  html += '<tbody>';
  data.forEach(row => {
    html += '<tr>';
    headers.forEach(header => {
      const value = row[header] !== null && row[header] !== undefined ? row[header] : '';
      html += `<td style="padding: 6px;">${value}</td>`;
    });
    html += '</tr>';
  });
  html += '</tbody></table></body></html>';

  const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.xls`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// Export to PDF (using browser print)
export const exportToPDF = (elementId: string, filename: string) => {
  const element = document.getElementById(elementId);
  if (!element) {
    alert('Element not found');
    return;
  }

  // Create a new window with print-friendly styling
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups to export to PDF');
    return;
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${filename}</title>
      <style>
        @page {
          size: A4;
          margin: 1cm;
        }
        body {
          font-family: Arial, sans-serif;
          font-size: 10pt;
          line-height: 1.4;
          margin: 0;
          padding: 20px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 20px 0;
        }
        th, td {
          border: 1px solid #ddd;
          padding: 8px;
          text-align: left;
        }
        th {
          background-color: #4f46e5;
          color: white;
          font-weight: bold;
        }
        tr:nth-child(even) {
          background-color: #f8fafc;
        }
        h1, h2, h3 {
          color: #1e293b;
          margin-top: 0;
        }
        .no-print {
          display: none;
        }
        button, .btn, .action-buttons {
          display: none !important;
        }
        @media print {
          body {
            padding: 0;
          }
        }
      </style>
    </head>
    <body>
      ${element.innerHTML}
      <script>
        window.onload = function() {
          window.print();
          setTimeout(function() {
            window.close();
          }, 100);
        }
      </script>
    </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
};

// Export current page to PDF
export const exportPageToPDF = (filename: string = 'document') => {
  // Add print-friendly class to body
  document.body.classList.add('printing');
  
  // Set document title for PDF
  const originalTitle = document.title;
  document.title = filename;

  // Trigger print dialog
  window.print();

  // Restore
  document.title = originalTitle;
  document.body.classList.remove('printing');
};

// Format data for export (clean up objects)
export const formatDataForExport = (data: any[], fieldsToRemove: string[] = ['id', 'created_at', 'updated_at']) => {
  return data.map(item => {
    const cleaned = { ...item };
    fieldsToRemove.forEach(field => delete cleaned[field]);
    return cleaned;
  });
};

// Export financial statement to Excel with formatting
export const exportFinancialStatementToExcel = (
  statement: any,
  lineItems: any[],
  filename: string
) => {
  let html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">';
  html += '<head><meta charset="UTF-8"></head><body>';
  
  // Statement header
  html += '<table border="1">';
  html += '<tr><td colspan="3" style="background-color: #4f46e5; color: white; font-size: 16pt; font-weight: bold; text-align: center; padding: 12px;">';
  html += `${statement.statement_name}</td></tr>`;
  html += `<tr><td colspan="3" style="text-align: center; padding: 8px;">Period: ${statement.period_start} to ${statement.period_end}</td></tr>`;
  html += '<tr><td colspan="3"></td></tr>';
  
  // Line items
  html += '<tr style="background-color: #e2e8f0; font-weight: bold;">';
  html += '<td style="padding: 8px;">Account Code</td>';
  html += '<td style="padding: 8px;">Description</td>';
  html += '<td style="padding: 8px; text-align: right;">Amount</td>';
  html += '</tr>';
  
  lineItems.forEach(item => {
    html += '<tr>';
    html += `<td style="padding: 6px;">${item.line_code || ''}</td>`;
    html += `<td style="padding: 6px;">${item.description || ''}</td>`;
    html += `<td style="padding: 6px; text-align: right;">${Number(item.amount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>`;
    html += '</tr>';
  });
  
  // Total
  const total = lineItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  html += '<tr style="background-color: #f1f5f9; font-weight: bold;">';
  html += '<td colspan="2" style="padding: 8px; text-align: right;">Total:</td>';
  html += `<td style="padding: 8px; text-align: right;">${total.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>`;
  html += '</tr>';
  
  html += '</table></body></html>';

  const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.xls`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// Export budget comparison to Excel
export const exportBudgetComparisonToExcel = (
  data: any[],
  filename: string
) => {
  let html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">';
  html += '<head><meta charset="UTF-8"></head><body>';
  html += '<table border="1">';
  
  // Header
  html += '<tr style="background-color: #4f46e5; color: white; font-weight: bold;">';
  html += '<td style="padding: 8px;">Account</td>';
  html += '<td style="padding: 8px; text-align: right;">Budget</td>';
  html += '<td style="padding: 8px; text-align: right;">Actual</td>';
  html += '<td style="padding: 8px; text-align: right;">Variance</td>';
  html += '<td style="padding: 8px; text-align: right;">Variance %</td>';
  html += '<td style="padding: 8px;">Status</td>';
  html += '</tr>';
  
  data.forEach(item => {
    html += '<tr>';
    html += `<td style="padding: 6px;">${item.account_name || item.line_code || ''}</td>`;
    html += `<td style="padding: 6px; text-align: right;">${Number(item.budget || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>`;
    html += `<td style="padding: 6px; text-align: right;">${Number(item.actual || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>`;
    html += `<td style="padding: 6px; text-align: right;">${Number(item.variance || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>`;
    html += `<td style="padding: 6px; text-align: right;">${Number(item.variance_percentage || 0).toFixed(1)}%</td>`;
    html += `<td style="padding: 6px;">${item.status || ''}</td>`;
    html += '</tr>';
  });
  
  html += '</table></body></html>';

  const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.xls`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
