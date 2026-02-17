import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { exportBudgetComparisonToExcel, exportPageToPDF } from '../utils/exportUtils';
import './BudgetVsActualReport.css';

interface Budget {
  id: string;
  budget_name: string;
  fiscal_year: number;
  budget_type: string;
  status: string;
}

interface Statement {
  id: string;
  statement_type: string;
  period_start: string;
  period_end: string;
  status: string;
  scenario: string;
}

interface BudgetVsActualLineItem {
  account_code: string;
  account_name: string;
  department?: string;
  budget_amount: number;
  actual_amount: number;
  variance_amount: number;
  variance_percent: number;
  status: 'favorable' | 'unfavorable' | 'neutral';
}

interface BudgetVsActualSummary {
  total_budget: number;
  total_actual: number;
  total_variance: number;
  total_variance_percent: number;
  favorable_count: number;
  unfavorable_count: number;
  on_budget_count: number;
}

interface BudgetVsActualReport {
  period: string;
  budget_id: string;
  budget_name: string;
  statement_id: string;
  statement_type: string;
  line_items: BudgetVsActualLineItem[];
  summary: BudgetVsActualSummary;
}

export default function BudgetVsActualReport() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [statements, setStatements] = useState<Statement[]>([]);
  const [selectedBudgetId, setSelectedBudgetId] = useState<string>('');
  const [selectedStatementId, setSelectedStatementId] = useState<string>('');
  const [report, setReport] = useState<BudgetVsActualReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchBudgets();
    fetchStatements();
  }, []);

  const fetchBudgets = async () => {
    try {
      const response = await api.get('/budgets');
      setBudgets(response.data);
    } catch (err: any) {
      console.error('Error fetching budgets:', err);
    }
  };

  const fetchStatements = async () => {
    try {
      const response = await api.get('/financial/statements');
      // Only show actual statements
      const actualStatements = response.data.filter(
        (s: Statement) => s.scenario === 'actual'
      );
      setStatements(actualStatements);
    } catch (err: any) {
      console.error('Error fetching statements:', err);
    }
  };

  const generateReport = async () => {
    if (!selectedBudgetId || !selectedStatementId) {
      setError('Please select both a budget and an actual statement');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await api.get('/reports/budget-vs-actual', {
        params: {
          budget_id: selectedBudgetId,
          statement_id: selectedStatementId,
        },
      });
      setReport(response.data);
    } catch (err: any) {
      console.error('Error generating report:', err);
      setError(err.response?.data?.message || 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('th-TH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatPercent = (percent: number) => {
    return `${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%`;
  };

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'favorable':
        return 'status-favorable';
      case 'unfavorable':
        return 'status-unfavorable';
      default:
        return 'status-neutral';
    }
  };

  return (
    <div className="page budget-vs-actual-page">
      <div className="page-header">
        <h1>📊 Budget vs Actual Report</h1>
        <p>Compare budgeted amounts with actual financial results</p>
      </div>

      <div className="report-controls">
        <div className="control-group">
          <label htmlFor="budget-select">Select Budget:</label>
          <select
            id="budget-select"
            value={selectedBudgetId}
            onChange={(e) => setSelectedBudgetId(e.target.value)}
            className="form-select"
          >
            <option value="">-- Choose Budget --</option>
            {budgets.map((budget) => (
              <option key={budget.id} value={budget.id}>
                {budget.budget_name} (FY{budget.fiscal_year}) - {budget.budget_type}
              </option>
            ))}
          </select>
        </div>

        <div className="control-group">
          <label htmlFor="statement-select">Select Actual Statement:</label>
          <select
            id="statement-select"
            value={selectedStatementId}
            onChange={(e) => setSelectedStatementId(e.target.value)}
            className="form-select"
          >
            <option value="">-- Choose Statement --</option>
            {statements.map((statement) => (
              <option key={statement.id} value={statement.id}>
                {statement.statement_type} - {statement.period_start} to {statement.period_end}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={generateReport}
          disabled={loading || !selectedBudgetId || !selectedStatementId}
          className="btn btn-primary"
        >
          {loading ? 'Generating...' : 'Generate Report'}
        </button>

        {report && (
          <>
            <button
              onClick={() => exportBudgetComparisonToExcel(
                report.line_items.map(item => ({
                  line_code: item.account_code,
                  account_name: item.account_name,
                  budget: item.budget_amount,
                  actual: item.actual_amount,
                  variance: item.variance_amount,
                  variance_percentage: item.variance_percent,
                  status: item.status === 'favorable' ? 'Favorable' : item.status === 'unfavorable' ? 'Unfavorable' : 'Neutral'
                })),
                `Budget_vs_Actual_${report.budget_name}_${new Date().toISOString().split('T')[0]}`
              )}
              className="btn btn-secondary"
            >
              📊 Export to Excel
            </button>
            <button
              onClick={() => exportPageToPDF(`Budget_vs_Actual_${report.budget_name}`)}
              className="btn btn-secondary"
            >
              📄 Export to PDF
            </button>
          </>
        )}
      </div>

      {error && <div className="form-error">{error}</div>}

      {report && (
        <div className="report-container">
          <div className="report-header">
            <h2>{report.budget_name}</h2>
            <p>
              <strong>Period:</strong> {report.period} |{' '}
              <strong>Type:</strong> {report.statement_type}
            </p>
          </div>

          <div className="summary-cards">
            <div className="summary-card">
              <div className="summary-label">Total Budget</div>
              <div className="summary-value">฿{formatAmount(report.summary.total_budget)}</div>
            </div>
            <div className="summary-card">
              <div className="summary-label">Total Actual</div>
              <div className="summary-value">฿{formatAmount(report.summary.total_actual)}</div>
            </div>
            <div className={`summary-card ${report.summary.total_variance >= 0 ? 'positive' : 'negative'}`}>
              <div className="summary-label">Total Variance</div>
              <div className="summary-value">
                ฿{formatAmount(Math.abs(report.summary.total_variance))}
                <span className="variance-percent">
                  {formatPercent(report.summary.total_variance_percent)}
                </span>
              </div>
            </div>
          </div>

          <div className="variance-stats">
            <div className="stat-item favorable">
              <span className="stat-label">Favorable:</span>
              <span className="stat-value">{report.summary.favorable_count}</span>
            </div>
            <div className="stat-item neutral">
              <span className="stat-label">On Budget:</span>
              <span className="stat-value">{report.summary.on_budget_count}</span>
            </div>
            <div className="stat-item unfavorable">
              <span className="stat-label">Unfavorable:</span>
              <span className="stat-value">{report.summary.unfavorable_count}</span>
            </div>
          </div>

          <div className="report-table-container">
            <table className="report-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Name</th>
                  <th>Department</th>
                  <th className="amount-col">Budget</th>
                  <th className="amount-col">Actual</th>
                  <th className="amount-col">Variance</th>
                  <th className="percent-col">%</th>
                  <th className="status-col">Status</th>
                </tr>
              </thead>
              <tbody>
                {report.line_items.map((item, index) => (
                  <tr key={index} className={getStatusClass(item.status)}>
                    <td className="account-code">{item.account_code}</td>
                    <td className="account-name">{item.account_name}</td>
                    <td>{item.department || '-'}</td>
                    <td className="amount-col">฿{formatAmount(item.budget_amount)}</td>
                    <td className="amount-col">฿{formatAmount(item.actual_amount)}</td>
                    <td className="amount-col variance-amount">
                      {item.variance_amount >= 0 ? '+' : ''}฿{formatAmount(item.variance_amount)}
                    </td>
                    <td className="percent-col">{formatPercent(item.variance_percent)}</td>
                    <td className="status-col">
                      <span className={`status-badge ${item.status}`}>
                        {item.status === 'favorable' && '✓'}
                        {item.status === 'unfavorable' && '✗'}
                        {item.status === 'neutral' && '○'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="report-footer">
            <Link to="/reports" className="btn btn-secondary">Back to Reports</Link>
            <button className="btn btn-primary" onClick={() => window.print()}>
              Print Report
            </button>
          </div>
        </div>
      )}

      {!report && !loading && (
        <div className="empty-state">
          <div className="empty-state-icon">📈</div>
          <h3>No Report Generated</h3>
          <p>Select a budget and actual statement, then click "Generate Report" to see the variance analysis.</p>
        </div>
      )}
    </div>
  );
}
