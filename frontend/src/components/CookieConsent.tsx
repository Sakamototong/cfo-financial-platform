import React, { useEffect, useState } from 'react'
import api from '../api/client'

interface CookieConsentState {
  essential: boolean
  analytics: boolean
  marketing: boolean
  hasConsented: boolean
}

export default function CookieConsent() {
  const [showBanner, setShowBanner] = useState(false)
  const [consent, setConsent] = useState<CookieConsentState>({
    essential: true,
    analytics: false,
    marketing: false,
    hasConsented: false,
  })
  const [showDetails, setShowDetails] = useState(false)

  useEffect(() => {
    // Check if user is logged in and has consented
    const token = localStorage.getItem('access_token')
    // Check localStorage first for saved consent
    const savedConsent = localStorage.getItem('cookieConsent')
    if (savedConsent) {
      try {
        const parsed = JSON.parse(savedConsent)
        setConsent({ ...parsed, hasConsented: true })
        return // Already consented
      } catch { /* ignore parse errors */ }
    }
    if (token) {
      api.get('/privacy/cookie-consent')
        .then((res) => {
          const data = res.data
          setConsent(data)
          if (!data.hasConsented) {
            setShowBanner(true)
          }
        })
        .catch(() => {
          // Privacy API not available, check localStorage fallback
          setShowBanner(true)
        })
    } else {
      // Not logged in, show banner
      setShowBanner(true)
    }
  }, [])

  const handleAcceptAll = async () => {
    const newConsent = {
      essential: true,
      analytics: true,
      marketing: true,
    }
    await saveConsent(newConsent)
  }

  const handleAcceptEssential = async () => {
    const newConsent = {
      essential: true,
      analytics: false,
      marketing: false,
    }
    await saveConsent(newConsent)
  }

  const handleSavePreferences = async () => {
    await saveConsent({
      essential: consent.essential,
      analytics: consent.analytics,
      marketing: consent.marketing,
    })
  }

  const saveConsent = async (consentData: any) => {
    try {
      const token = localStorage.getItem('access_token')
      if (token) {
        // Privacy module may not be active, just save locally
        try {
          await api.post('/privacy/cookie-consent', consentData)
        } catch {
          // Privacy API not available, continue with local storage
        }
      }
      // Store in localStorage for non-authenticated users
      localStorage.setItem('cookieConsent', JSON.stringify(consentData))
      setShowBanner(false)
      setConsent({ ...consentData, hasConsented: true })
    } catch (err) {
      console.error('Failed to save cookie consent:', err)
      // Still close banner and save locally
      localStorage.setItem('cookieConsent', JSON.stringify(consentData))
      setShowBanner(false)
    }
  }

  if (!showBanner) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        maxWidth: 420,
        backgroundColor: '#fff',
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
        padding: '20px',
        zIndex: 9999,
        borderRadius: 12,
        border: '2px solid #4CAF50',
      }}
    >
      <h4 style={{ marginTop: 0, marginBottom: 12, fontSize: 16 }}>
        🍪 คุกกี้
      </h4>
      <p style={{ marginBottom: 16, color: '#555', fontSize: 14, lineHeight: 1.5 }}>
        เราใช้คุกกี้เพื่อปรับปรุงประสบการณ์ของคุณ{' '}
        <a href="/privacy-policy" target="_blank" style={{ color: '#4CAF50' }}>
          อ่านเพิ่มเติม
        </a>
      </p>

      {showDetails && (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            backgroundColor: '#f5f5f5',
            borderRadius: 6,
            fontSize: 13,
          }}
        >
          <label style={{ display: 'block', marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={consent.essential}
              disabled
              style={{ marginRight: 8 }}
            />
            <strong>จำเป็น</strong>
            <br />
            <small style={{ marginLeft: 24, color: '#666' }}>
              สำหรับการทำงานพื้นฐาน
            </small>
          </label>

          <label style={{ display: 'block', marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={consent.analytics}
              onChange={(e) =>
                setConsent({ ...consent, analytics: e.target.checked })
              }
              style={{ marginRight: 8 }}
            />
            <strong>วิเคราะห์</strong>
            <br />
            <small style={{ marginLeft: 24, color: '#666' }}>
              ช่วยปรับปรุงเว็บไซต์
            </small>
          </label>

          <label style={{ display: 'block', marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={consent.marketing}
              onChange={(e) =>
                setConsent({ ...consent, marketing: e.target.checked })
              }
              style={{ marginRight: 8 }}
            />
            <strong>การตลาด</strong>
            <br />
            <small style={{ marginLeft: 24, color: '#666' }}>
              โฆษณาที่เกี่ยวข้อง
            </small>
          </label>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          onClick={handleAcceptAll}
          style={{
            padding: '10px 16px',
            backgroundColor: '#4CAF50',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontWeight: 500,
            fontSize: 14,
          }}
        >
          ยอมรับทั้งหมด
        </button>

        {!showDetails ? (
          <button
            onClick={() => setShowDetails(true)}
            style={{
              padding: '8px 16px',
              backgroundColor: '#fff',
              color: '#333',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            ตั้งค่า
          </button>
        ) : (
          <>
            <button
              onClick={handleSavePreferences}
              style={{
                padding: '8px 16px',
                backgroundColor: '#2196F3',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              บันทึก
            </button>
            <button
              onClick={handleAcceptEssential}
              style={{
                padding: '8px 16px',
                backgroundColor: '#fff',
                color: '#666',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              เฉพาะที่จำเป็น
            </button>
          </>
        )}
      </div>
    </div>
  )
}
