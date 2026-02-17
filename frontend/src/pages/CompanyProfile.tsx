import React, { useEffect, useState } from 'react'
import api from '../api/client'
import { useTenant } from '../components/TenantContext'

export default function CompanyProfile(){
  const { tenantId } = useTenant()
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(()=>{
    if (!tenantId) { setProfile(null); setLoading(false); return }
    setLoading(true)
    async function load(){
      try{
        const r = await api.get('/users/company/profile')
        setProfile(r.data)
      }catch(e){
        console.warn('Failed to load company profile', e)
      }finally{
        setLoading(false)
      }
    }
    load()
  },[tenantId])

  return (
    <>
      {/* Page Header */}
      <div className="card mb-3">
        <div className="card-header">
          <h3 className="card-title">
            <i className="bi bi-building me-2"></i>
            Company Profile
          </h3>
          <div className="card-tools">
            <button className="btn btn-primary btn-sm" disabled>
              <i className="bi bi-pencil me-1"></i>
              Edit Profile
            </button>
          </div>
        </div>
      </div>

      {/* Profile Content */}
      <div className="row">
        <div className="col-md-8">
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                <i className="bi bi-info-circle me-2"></i>
                Company Information
              </h3>
            </div>
            <div className="card-body">
              {loading ? (
                <div className="text-center py-5">
                  <div className="spinner-border text-primary" role="status">
                    <span className="visually-hidden">Loading...</span>
                  </div>
                  <p className="mt-3 text-muted">Loading company profile...</p>
                </div>
              ) : profile ? (
                <div className="table-responsive">
                  <table className="table table-bordered">
                    <tbody>
                      <tr>
                        <th style={{ width: '30%' }}>Tenant ID</th>
                        <td>{tenantId}</td>
                      </tr>
                      <tr>
                        <th>Company Name</th>
                        <td>{profile.name || profile.company_name || 'N/A'}</td>
                      </tr>
                      <tr>
                        <th>Email</th>
                        <td>{profile.email || 'N/A'}</td>
                      </tr>
                      <tr>
                        <th>Industry</th>
                        <td>{profile.industry || 'N/A'}</td>
                      </tr>
                      <tr>
                        <th>Created Date</th>
                        <td>
                          {profile.created_at 
                            ? new Date(profile.created_at).toLocaleDateString() 
                            : 'N/A'
                          }
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-5">
                  <i className="bi bi-building" style={{ fontSize: '48px', color: '#6c757d' }}></i>
                  <h5 className="mt-3">No Profile Data</h5>
                  <p className="text-muted">Company profile is not available yet.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="col-md-4">
          <div className="card card-info card-outline">
            <div className="card-header">
              <h3 className="card-title">
                <i className="bi bi-lightbulb me-2"></i>
                Quick Tips
              </h3>
            </div>
            <div className="card-body">
              <ul className="list-unstyled">
                <li className="mb-2">
                  <i className="bi bi-check-circle text-success me-2"></i>
                  Update company details regularly
                </li>
                <li className="mb-2">
                  <i className="bi bi-check-circle text-success me-2"></i>
                  Verify contact information
                </li>
                <li className="mb-2">
                  <i className="bi bi-check-circle text-success me-2"></i>
                  Keep industry classification current
                </li>
              </ul>
            </div>
          </div>

          <div className="card card-primary card-outline">
            <div className="card-header">
              <h3 className="card-title">
                <i className="bi bi-gear me-2"></i>
                Settings
              </h3>
            </div>
            <div className="card-body">
              <p className="text-muted mb-0">
                Company settings and preferences will be available here.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
