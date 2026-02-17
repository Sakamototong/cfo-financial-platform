import React from 'react'

export default function Billing(){
  return (
    <>
      <div className="card mb-3">
        <div className="card-header">
          <h3 className="card-title"><i className="bi bi-credit-card me-2"></i>Billing & Subscription</h3>
        </div>
      </div>

      <div className="row mb-3">
        <div className="col-md-4">
          <div className="info-box"><span className="info-box-icon text-bg-success"><i className="bi bi-check-circle"></i></span>
            <div className="info-box-content"><span className="info-box-text">Current Plan</span><span className="info-box-number">Free Trial</span></div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="info-box"><span className="info-box-icon text-bg-info"><i className="bi bi-calendar3"></i></span>
            <div className="info-box-content"><span className="info-box-text">Next Billing</span><span className="info-box-number">-</span></div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="info-box"><span className="info-box-icon text-bg-primary"><i className="bi bi-receipt"></i></span>
            <div className="info-box-content"><span className="info-box-text">Invoices</span><span className="info-box-number">0</span></div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-body text-center text-muted py-5">
          <i className="bi bi-credit-card-2-front d-block mb-3" style={{ fontSize: '3rem' }}></i>
          <h5>Billing Coming Soon</h5>
          <p>Subscription plans, invoices, and payment methods will be available here.</p>
        </div>
      </div>
    </>
  )
}
