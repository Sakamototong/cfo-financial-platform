import React, { useState, useEffect } from 'react';
import api from '../api/client';
import './TransactionDrillDown.css';

interface Transaction {
  id: string;
  transaction_date: string;
  description: string;
  amount: string;
  account_code: string;
  account_name?: string;
  department?: string;
  cost_center?: string;
  transaction_type?: string;
  category?: string;
  document_number?: string;
  reference_number?: string;
  vendor_customer?: string;
  status: string;
  posted_at?: string;
  file_name?: string;
  import_date?: string;
  template_name?: string;
}

interface TransactionDrillDownProps {
  statementId: string;
  lineCode: string;
  lineName: string;
  onClose: () => void;
}

const TransactionDrillDown: React.FC<TransactionDrillDownProps> = ({ 
  statementId, 
  lineCode, 
  lineName,
  onClose 
}) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transactionCount, setTransactionCount] = useState(0);

  useEffect(() => {
    loadTransactions();
  }, [statementId, lineCode]);

  const loadTransactions = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.get(
        `/financial/line-items/${lineCode}/transactions?statement_id=${statementId}`
      );

      setTransactions(response.data.transactions || []);
      setTransactionCount(response.data.transaction_count || 0);
    } catch (err: any) {
      console.error('Error loading transactions:', err);
      setError(err.response?.data?.message || 'Failed to load transactions');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatAmount = (amount: string | number) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('th-TH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(num);
  };

  const getTotalAmount = () => {
    return transactions.reduce((sum, tx) => sum + parseFloat(tx.amount), 0);
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="drilldown-overlay" onClick={handleBackdropClick}>
      <div className="drilldown-modal">
        <div className="drilldown-header">
          <div className="drilldown-title">
            <h2>📊 Transaction Drill-Down</h2>
            <div className="drilldown-subtitle">
              <span className="line-name">{lineName}</span>
              <span className="separator">•</span>
              <span className="line-code">Account: {lineCode}</span>
            </div>
          </div>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <div className="drilldown-body">
          {loading && (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Loading transactions...</p>
            </div>
          )}

          {error && (
            <div className="error-state">
              <div className="error-icon">⚠️</div>
              <p>{error}</p>
              <button className="btn-retry" onClick={loadTransactions}>
                🔄 Retry
              </button>
            </div>
          )}

          {!loading && !error && transactions.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">📭</div>
              <p>No transactions found for this line item</p>
              <small>Transactions will appear here after being imported and posted to financials</small>
            </div>
          )}

          {!loading && !error && transactions.length > 0 && (
            <>
              <div className="drilldown-summary">
                <div className="summary-item">
                  <span className="label">Total Transactions:</span>
                  <span className="value">{transactionCount}</span>
                </div>
                <div className="summary-item">
                  <span className="label">Total Amount:</span>
                  <span className="value amount">฿{formatAmount(getTotalAmount())}</span>
                </div>
              </div>

              <div className="transactions-table-wrapper">
                <table className="transactions-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Description</th>
                      <th>Amount</th>
                      <th>Vendor/Customer</th>
                      <th>Document</th>
                      <th>Department</th>
                      <th>Category</th>
                      <th>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map(tx => (
                      <tr key={tx.id}>
                        <td className="col-date">{formatDate(tx.transaction_date)}</td>
                        <td className="col-description">{tx.description || '-'}</td>
                        <td className="col-amount">฿{formatAmount(tx.amount)}</td>
                        <td>{tx.vendor_customer || '-'}</td>
                        <td className="col-document">
                          {tx.document_number && (
                            <div className="document-info">
                              <span className="doc-number">{tx.document_number}</span>
                              {tx.reference_number && (
                                <span className="ref-number">{tx.reference_number}</span>
                              )}
                            </div>
                          )}
                          {!tx.document_number && '-'}
                        </td>
                        <td>{tx.department || '-'}</td>
                        <td>
                          {tx.category && (
                            <span className="category-badge">{tx.category}</span>
                          )}
                          {!tx.category && '-'}
                        </td>
                        <td className="col-source">
                          <div className="source-info">
                            {tx.template_name && (
                              <span className="template-name" title={tx.template_name}>
                                {tx.template_name.split(' ')[0]}
                              </span>
                            )}
                            {tx.import_date && (
                              <span className="import-date" title={formatDate(tx.import_date)}>
                                {formatDate(tx.import_date)}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="drilldown-footer">
          <button className="btn-export">📥 Export to CSV</button>
          <button className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

export default TransactionDrillDown;
