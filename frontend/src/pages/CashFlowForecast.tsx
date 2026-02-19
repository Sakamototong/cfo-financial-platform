import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { exportTableToExcel, exportPageToPDF } from '../utils/exportUtils';

interface CashFlowForecast {
  id: string;
  forecast_name: string;
  start_date: string;
  weeks: number;
  beginning_cash: number;
  status: 'draft' | 'active' | 'archived';
  created_at: string;
}

interface CashFlowLineItem {
  id: string;
  week_number: number;
  week_start_date: string;
  week_end_date: string;
  operating_cash_inflow: number;
  operating_cash_outflow: number;
  investing_cash_inflow: number;
  investing_cash_outflow: number;
  financing_cash_inflow: number;
  financing_cash_outflow: number;
  net_change_in_cash: number;
  beginning_cash: number;
  ending_cash: number;
  notes?: string;
}

interface ForecastSummary {
  beginning_cash: number;
  ending_cash: number;
  net_change: number;
  total_operating_inflow: number;
  total_operating_outflow: number;
  lowest_cash_balance: number;
  lowest_cash_week: number;
}

export default function CashFlowForecast() {
  const [forecasts, setForecasts] = useState<CashFlowForecast[]>([]);
  const [selectedForecast, setSelectedForecast] = useState<CashFlowForecast | null>(null);
  const [lineItems, setLineItems] = useState<CashFlowLineItem[]>([]);
  const [summary, setSummary] = useState<ForecastSummary | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Create form fields
  const [forecastName, setForecastName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [weeks, setWeeks] = useState(13);
  const [beginningCash, setBeginningCash] = useState(0);

  useEffect(() => {
    fetchForecasts();
  }, []);

  useEffect(() => {
    console.log('CASHFLOW showCreateForm changed to:', showCreateForm);
  }, [showCreateForm]);

  useEffect(() => {
    if (selectedForecast) {
      fetchForecastDetails();
      // Scroll to detail section on mobile
      const detailSection = document.querySelector('.col-md-8');
      if (detailSection && window.innerWidth < 768) {
        detailSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [selectedForecast]);

  const fetchForecasts = async () => {
    try {
      const response = await api.get('/cashflow/forecasts');
      setForecasts(response.data);
    } catch (err: any) {
      console.error('Error fetching forecasts:', err);
      setError(err.response?.data?.message || 'Failed to load forecasts');
    }
  };

  const fetchForecastDetails = async () => {
    if (!selectedForecast) return;

    setDetailLoading(true);
    setDetailError(null);

    try {
      const [itemsRes, summaryRes] = await Promise.all([
        api.get(`/cashflow/forecasts/${selectedForecast.id}/line-items`),
        api.get(`/cashflow/forecasts/${selectedForecast.id}/summary`),
      ]);

      setLineItems(itemsRes.data);
      setSummary(summaryRes.data);
    } catch (err: any) {
      console.error('Error fetching forecast details:', err);
      setDetailError(err.response?.data?.message || 'Failed to load forecast details');
    } finally {
      setDetailLoading(false);
    }
  };

  const createForecast = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await api.post('/cashflow/forecasts', {
        forecast_name: forecastName,
        start_date: startDate,
        weeks,
        beginning_cash: beginningCash,
      });

      // Reset form
      setForecastName('');
      setStartDate('');
      setWeeks(13);
      setBeginningCash(0);
      setShowCreateForm(false);

      // Refresh list
      await fetchForecasts();
    } catch (err: any) {
      console.error('Error creating forecast:', err);
      setError(err.response?.data?.message || 'Failed to create forecast');
    } finally {
      setLoading(false);
    }
  };

  const updateLineItem = async (weekNumber: number, field: keyof CashFlowLineItem, value: number) => {
    if (!selectedForecast) return;

    try {
      const dto: any = { [field]: value };
      await api.put(`/cashflow/forecasts/${selectedForecast.id}/line-items/${weekNumber}`, dto);

      // Refresh details
      await fetchForecastDetails();
    } catch (err: any) {
      console.error('Error updating line item:', err);
      setError(err.response?.data?.message || 'Failed to update');
    }
  };

  const deleteForecast = async (id: string) => {
    if (!confirm('Are you sure you want to delete this forecast?')) return;

    try {
      await api.delete(`/cashflow/forecasts/${id}`);
      if (selectedForecast?.id === id) {
        setSelectedForecast(null);
        setLineItems([]);
        setSummary(null);
      }
      await fetchForecasts();
    } catch (err: any) {
      console.error('Error deleting forecast:', err);
      setError(err.response?.data?.message || 'Failed to delete');
    }
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('th-TH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('th-TH', { month: 'short', day: 'numeric' });
  };

  const statusBadgeClass = (status: string) => {
    switch (status) {
      case 'active': return 'text-bg-success';
      case 'draft': return 'text-bg-warning';
      case 'archived': return 'text-bg-secondary';
      default: return 'text-bg-secondary';
    }
  };

  return (
    <>
      {/* Header Card */}
      <div className="card mb-3">
        <div className="card-header">
          <h3 className="card-title">
            <i className="bi bi-cash-stack me-2"></i>
            Cash Flow Forecasting
          </h3>
        </div>
        <div className="card-body py-2">
          <small className="text-muted">13-week rolling cash flow forecast and planning</small>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="alert alert-danger alert-dismissible fade show" role="alert">
          <i className="bi bi-exclamation-triangle-fill me-2"></i>
          {error}
          <button type="button" className="btn-close" onClick={() => setError(null)} aria-label="Close"></button>
        </div>
      )}



      {/* Main Layout: Sidebar + Content */}
      <div className="row">
        {/* Sidebar: Forecast List */}
        <div className="col-md-4">
          <div className="card">
            <div className="card-header d-flex justify-content-between align-items-center">
              <h3 className="card-title mb-0">
                <i className="bi bi-list-ul me-2"></i>
                Forecasts
              </h3>
              <button
                className="btn btn-primary btn-sm"
                style={{ position: 'relative', zIndex: 10 }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedForecast(null);
                  setShowCreateForm(true);
                }}
              >
                <i className="bi bi-plus-lg me-1"></i>
                New
              </button>
            </div>
            <div className="card-body p-0">
              <div className="list-group list-group-flush">
                {forecasts.map((forecast) => (
                  <div
                    key={forecast.id}
                    className={`list-group-item list-group-item-action ${selectedForecast?.id === forecast.id ? 'active' : ''}`}
                    onClick={() => setSelectedForecast(forecast)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="d-flex justify-content-between align-items-start">
                      <div className="fw-bold">{forecast.forecast_name}</div>
                      <div className="d-flex align-items-center gap-1">
                        <span className={`badge ${statusBadgeClass(forecast.status)}`}>
                          {forecast.status}
                        </span>
                        <button
                          className="btn btn-outline-danger btn-sm border-0 p-0 px-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteForecast(forecast.id);
                          }}
                          title="Delete forecast"
                        >
                          <i className="bi bi-trash"></i>
                        </button>
                      </div>
                    </div>
                    <div className="d-flex justify-content-between mt-1">
                      <small className={selectedForecast?.id === forecast.id ? '' : 'text-muted'}>{forecast.weeks} weeks</small>
                      <small className={selectedForecast?.id === forecast.id ? '' : 'text-muted'}>\u0E3F{formatAmount(forecast.beginning_cash)}</small>
                    </div>
                    <small className={selectedForecast?.id === forecast.id ? '' : 'text-muted'}>
                      <i className="bi bi-calendar-event me-1"></i>
                      Start: {formatDate(forecast.start_date)}
                    </small>
                  </div>
                ))}

                {forecasts.length === 0 && (
                  <div className="list-group-item text-center py-4">
                    <i className="bi bi-inbox fs-1 text-muted d-block mb-2"></i>
                    <p className="text-muted mb-2">No forecasts yet</p>
                    <button
                      className="btn btn-link btn-sm"
                      onClick={() => setShowCreateForm(true)}
                    >
                      Create first forecast
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Main Area */}
        <div className="col-md-8">
          {/* Empty State */}
          {!selectedForecast && !showCreateForm && (
            <div className="card">
              <div className="card-body text-center py-5">
                <i className="bi bi-bar-chart-line fs-1 text-muted d-block mb-3"></i>
                <h4 className="text-muted">No Forecast Selected</h4>
                <p className="text-muted">Select a forecast from the sidebar or create a new one to get started.</p>
              </div>
            </div>
          )}

          {/* Create New Forecast Form */}
          {showCreateForm && (
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">
                  <i className="bi bi-plus-circle me-2"></i>
                  Create New Forecast
                </h3>
              </div>
              <div className="card-body">
                <form onSubmit={createForecast}>
                  <div className="mb-3">
                    <label htmlFor="forecast-name" className="form-label">Forecast Name *</label>
                    <input
                      id="forecast-name"
                      type="text"
                      className="form-control"
                      value={forecastName}
                      onChange={(e) => setForecastName(e.target.value)}
                      placeholder="e.g., Q1 2026 Forecast"
                      required
                    />
                  </div>
                  <div className="row">
                    <div className="col-md-6 mb-3">
                      <label htmlFor="start-date" className="form-label">Start Date *</label>
                      <input
                        id="start-date"
                        type="date"
                        className="form-control"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        required
                      />
                    </div>
                    <div className="col-md-6 mb-3">
                      <label htmlFor="weeks" className="form-label">Number of Weeks</label>
                      <input
                        id="weeks"
                        type="number"
                        className="form-control"
                        value={weeks}
                        onChange={(e) => setWeeks(parseInt(e.target.value))}
                        min="1"
                        max="52"
                      />
                    </div>
                  </div>
                  <div className="mb-3">
                    <label htmlFor="beginning-cash" className="form-label">Beginning Cash Balance</label>
                    <input
                      id="beginning-cash"
                      type="number"
                      className="form-control"
                      value={beginningCash}
                      onChange={(e) => setBeginningCash(parseFloat(e.target.value))}
                      step="0.01"
                    />
                  </div>
                  <div className="d-flex gap-2">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setShowCreateForm(false)}
                    >
                      <i className="bi bi-x-lg me-1"></i>
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={loading}
                    >
                      {loading ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                          Creating...
                        </>
                      ) : (
                        <>
                          <i className="bi bi-plus-lg me-1"></i>
                          Create Forecast
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Selected Forecast Details */}
          {selectedForecast && !showCreateForm && (
            <>
              {/* Detail Loading State */}
              {detailLoading && (
                <div className="card">
                  <div className="card-body text-center py-5">
                    <div className="spinner-border text-primary" role="status">
                      <span className="visually-hidden">Loading forecast details...</span>
                    </div>
                    <p className="text-muted mt-3">Loading forecast details...</p>
                  </div>
                </div>
              )}

              {/* Detail Error Display */}
              {detailError && !detailLoading && (
                <div className="alert alert-danger alert-dismissible fade show" role="alert">
                  <i className="bi bi-exclamation-triangle-fill me-2"></i>
                  {detailError}
                  <button type="button" className="btn-close" onClick={() => setDetailError(null)} aria-label="Close"></button>
                </div>
              )}

              {/* Summary Info Boxes */}
              {!detailLoading && !detailError && summary && (
                <div className="row mb-3">
                  <div className="col-md-6 col-lg-3 mb-3">
                    <div className="info-box">
                      <span className="info-box-icon text-bg-info">
                        <i className="bi bi-wallet2"></i>
                      </span>
                      <div className="info-box-content">
                        <span className="info-box-text">Beginning Cash</span>
                        <span className="info-box-number">&#3647;{formatAmount(summary.beginning_cash)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="col-md-6 col-lg-3 mb-3">
                    <div className="info-box">
                      <span className="info-box-icon text-bg-success">
                        <i className="bi bi-cash-coin"></i>
                      </span>
                      <div className="info-box-content">
                        <span className="info-box-text">Ending Cash</span>
                        <span className="info-box-number">&#3647;{formatAmount(summary.ending_cash)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="col-md-6 col-lg-3 mb-3">
                    <div className="info-box">
                      <span className={`info-box-icon ${summary.net_change >= 0 ? 'text-bg-primary' : 'text-bg-danger'}`}>
                        <i className={`bi ${summary.net_change >= 0 ? 'bi-graph-up-arrow' : 'bi-graph-down-arrow'}`}></i>
                      </span>
                      <div className="info-box-content">
                        <span className="info-box-text">Net Change</span>
                        <span className="info-box-number">
                          {summary.net_change >= 0 ? '+' : ''}&#3647;{formatAmount(summary.net_change)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="col-md-6 col-lg-3 mb-3">
                    <div className="info-box">
                      <span className="info-box-icon text-bg-warning">
                        <i className="bi bi-exclamation-triangle"></i>
                      </span>
                      <div className="info-box-content">
                        <span className="info-box-text">Lowest Balance</span>
                        <span className="info-box-number">&#3647;{formatAmount(summary.lowest_cash_balance)}</span>
                        <span className="info-box-text">Week {summary.lowest_cash_week}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Weekly Cash Flow Table */}
              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">
                    <i className="bi bi-table me-2"></i>
                    Weekly Cash Flow
                  </h3>
                  <div className="card-tools">
                    <button
                      onClick={() => lineItems && exportTableToExcel(
                        lineItems.map(item => ({
                          Week: item.week_number,
                          Period: `${formatDate(item.week_start_date)} - ${formatDate(item.week_end_date)}`,
                          'Operating Inflow': item.operating_cash_inflow || 0,
                          'Operating Outflow': item.operating_cash_outflow || 0,
                          'Investing Inflow': item.investing_cash_inflow || 0,
                          'Investing Outflow': item.investing_cash_outflow || 0,
                          'Financing Inflow': item.financing_cash_inflow || 0,
                          'Financing Outflow': item.financing_cash_outflow || 0,
                          'Net Change': item.net_change_in_cash,
                          'Ending Cash': item.ending_cash
                        })),
                        `CashFlow_${selectedForecast.forecast_name}_${new Date().toISOString().split('T')[0]}`,
                        selectedForecast.forecast_name
                      )}
                      className="btn btn-outline-success btn-sm me-1"
                    >
                      <i className="bi bi-file-earmark-spreadsheet me-1"></i>
                      Excel
                    </button>
                    <button
                      onClick={() => exportPageToPDF(`CashFlow_${selectedForecast.forecast_name}`)}
                      className="btn btn-outline-danger btn-sm"
                    >
                      <i className="bi bi-filetype-pdf me-1"></i>
                      PDF
                    </button>
                  </div>
                </div>
                <div className="card-body p-0">
                  {loading && (
                    <div className="text-center py-4">
                      <div className="spinner-border text-primary" role="status">
                        <span className="visually-hidden">Loading...</span>
                      </div>
                    </div>
                  )}

                  {!loading && lineItems.length > 0 && (
                    <div className="table-responsive">
                      <table className="table table-hover table-striped mb-0">
                        <thead className="table-light">
                          <tr>
                            <th>Week</th>
                            <th>Period</th>
                            <th>Op. Inflow</th>
                            <th>Op. Outflow</th>
                            <th>Inv. Inflow</th>
                            <th>Inv. Outflow</th>
                            <th>Fin. Inflow</th>
                            <th>Fin. Outflow</th>
                            <th className="table-primary">Net Change</th>
                            <th className="table-primary">Ending Cash</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lineItems.map((item) => (
                            <tr key={item.week_number}>
                              <td className="fw-bold">W{item.week_number}</td>
                              <td className="text-nowrap">
                                <small>{formatDate(item.week_start_date)} - {formatDate(item.week_end_date)}</small>
                              </td>
                              <td>
                                <input
                                  type="number"
                                  className="form-control form-control-sm"
                                  value={item.operating_cash_inflow}
                                  onChange={(e) =>
                                    updateLineItem(item.week_number, 'operating_cash_inflow', parseFloat(e.target.value) || 0)
                                  }
                                  step="0.01"
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  className="form-control form-control-sm"
                                  value={item.operating_cash_outflow}
                                  onChange={(e) =>
                                    updateLineItem(item.week_number, 'operating_cash_outflow', parseFloat(e.target.value) || 0)
                                  }
                                  step="0.01"
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  className="form-control form-control-sm"
                                  value={item.investing_cash_inflow}
                                  onChange={(e) =>
                                    updateLineItem(item.week_number, 'investing_cash_inflow', parseFloat(e.target.value) || 0)
                                  }
                                  step="0.01"
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  className="form-control form-control-sm"
                                  value={item.investing_cash_outflow}
                                  onChange={(e) =>
                                    updateLineItem(item.week_number, 'investing_cash_outflow', parseFloat(e.target.value) || 0)
                                  }
                                  step="0.01"
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  className="form-control form-control-sm"
                                  value={item.financing_cash_inflow}
                                  onChange={(e) =>
                                    updateLineItem(item.week_number, 'financing_cash_inflow', parseFloat(e.target.value) || 0)
                                  }
                                  step="0.01"
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  className="form-control form-control-sm"
                                  value={item.financing_cash_outflow}
                                  onChange={(e) =>
                                    updateLineItem(item.week_number, 'financing_cash_outflow', parseFloat(e.target.value) || 0)
                                  }
                                  step="0.01"
                                />
                              </td>
                              <td className={`table-primary fw-bold ${parseFloat(item.net_change_in_cash.toString()) >= 0 ? 'text-success' : 'text-danger'}`}>
                                &#3647;{formatAmount(parseFloat(item.net_change_in_cash.toString()))}
                              </td>
                              <td className="table-primary fw-bold">
                                &#3647;{formatAmount(parseFloat(item.ending_cash.toString()))}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {!loading && lineItems.length === 0 && (
                    <div className="text-center py-4 text-muted">
                      <i className="bi bi-calendar-x fs-3 d-block mb-2"></i>
                      No line items found for this forecast.
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
