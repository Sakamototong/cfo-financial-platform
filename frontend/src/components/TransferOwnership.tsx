import React, { useState, useEffect } from 'react';
import api from '../api/client';

interface TransferRequest {
  id: string;
  current_owner_email: string;
  new_owner_email: string;
  reason?: string;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  requested_at: string;
  responded_at?: string;
}

interface TransferOwnershipProps {
  currentUserEmail: string;
  onTransferInitiated?: () => void;
}

export default function TransferOwnership({ currentUserEmail, onTransferInitiated }: TransferOwnershipProps) {
  const [showForm, setShowForm] = useState(false);
  const [newOwnerEmail, setNewOwnerEmail] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [pendingRequests, setPendingRequests] = useState<TransferRequest[]>([]);
  const [allRequests, setAllRequests] = useState<TransferRequest[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    loadPendingRequests();
  }, []);

  // Email validation function
  function validateEmail(email: string): boolean {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  }

  // Handle email input change with validation
  function handleEmailChange(value: string) {
    setNewOwnerEmail(value);
    setEmailError(null);
    
    if (value && !validateEmail(value)) {
      setEmailError('กรุณากรอกอีเมลให้ถูกต้อง');
    } else if (value && value.toLowerCase() === currentUserEmail.toLowerCase()) {
      setEmailError('ไม่สามารถโอนให้ตัวเองได้');
    }
  }

  async function loadPendingRequests() {
    try {
      const response = await api.get('/users/transfer-ownership/pending');
      setPendingRequests(response.data || []);
    } catch (e: any) {
      console.error('Failed to load pending requests:', e);
    }
  }

  async function loadAllRequests() {
    try {
      const response = await api.get('/users/transfer-ownership/all');
      setAllRequests(response.data || []);
    } catch (e: any) {
      console.error('Failed to load all requests:', e);
    }
  }

  async function initiateTransfer(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEmailError(null);

    if (!newOwnerEmail) {
      setEmailError('กรุณากรอกอีเมลของเจ้าของใหม่');
      return;
    }

    if (!validateEmail(newOwnerEmail)) {
      setEmailError('กรุณากรอกอีเมลให้ถูกต้อง');
      return;
    }

    if (newOwnerEmail.toLowerCase() === currentUserEmail.toLowerCase()) {
      setEmailError('ไม่สามารถโอนให้ตัวเองได้');
      return;
    }

    setLoading(true);
    try {
      await api.post('/users/transfer-ownership', {
        new_owner_email: newOwnerEmail,
        reason: reason || undefined,
      });

      alert('ส่งคำขอโอนความเป็นเจ้าของเรียบร้อยแล้ว');
      setNewOwnerEmail('');
      setReason('');
      setShowForm(false);
      await loadPendingRequests();
      if (onTransferInitiated) onTransferInitiated();
    } catch (e: any) {
      setError(e.response?.data?.message || 'ไม่สามารถส่งคำขอโอนความเป็นเจ้าของได้');
    }
    setLoading(false);
  }

  async function acceptTransfer(requestId: string) {
    if (!confirm('คุณต้องการยอมรับการโอนความเป็นเจ้าของใช่หรือไม่?')) return;

    try {
      await api.post('/users/transfer-ownership/accept', {
        transfer_request_id: requestId,
      });
      alert('ยอมรับการโอนความเป็นเจ้าของเรียบร้อยแล้ว');
      await loadPendingRequests();
    } catch (e: any) {
      alert('ไม่สามารถยอมรับการโอนได้: ' + (e.response?.data?.message || e.message));
    }
  }

  async function rejectTransfer(requestId: string) {
    const reason = prompt('เหตุผลในการปฏิเสธ (ไม่บังคับ):');
    if (reason === null) return; // User cancelled

    try {
      await api.post('/users/transfer-ownership/reject', {
        transfer_request_id: requestId,
        reason: reason || undefined,
      });
      alert('ปฏิเสธการโอนความเป็นเจ้าของเรียบร้อยแล้ว');
      await loadPendingRequests();
    } catch (e: any) {
      alert('ไม่สามารถปฏิเสธการโอนได้: ' + (e.response?.data?.message || e.message));
    }
  }

  async function cancelTransfer(requestId: string) {
    if (!confirm('คุณต้องการยกเลิกคำขอโอนความเป็นเจ้าของใช่หรือไม่?')) return;

    try {
      await api.post(`/users/transfer-ownership/${requestId}/cancel`);
      alert('ยกเลิกคำขอโอนเรียบร้อยแล้ว');
      await loadPendingRequests();
    } catch (e: any) {
      alert('ไม่สามารถยกเลิกคำขอได้: ' + (e.response?.data?.message || e.message));
    }
  }

  const pendingForMe = pendingRequests.filter(r => r.new_owner_email === currentUserEmail);
  const pendingByMe = pendingRequests.filter(r => r.current_owner_email === currentUserEmail);

  return (
    <div className="transfer-section">
      <h3>การโอนความเป็นเจ้าของ (Transfer Ownership)</h3>

      {/* Pending Requests for Current User to Accept */}
      {pendingForMe.length > 0 && (
        <div className="transfer-incoming">
          <h4>📬 คำขอโอนความเป็นเจ้าของถึงคุณ</h4>
          {pendingForMe.map(req => (
            <div key={req.id} className="transfer-card">
              <p>
                <strong>จาก:</strong> {req.current_owner_email}<br />
                {req.reason && <><strong>เหตุผล:</strong> {req.reason}<br /></>}
                <strong>วันที่:</strong> {new Date(req.requested_at).toLocaleDateString('th-TH')}
              </p>
              <div className="mt-2">
                <button 
                  className="btn primary mr-2" 
                  onClick={() => acceptTransfer(req.id)}
                >
                  ยอมรับ
                </button>
                <button 
                  className="btn ghost" 
                  onClick={() => rejectTransfer(req.id)}
                >
                  ปฏิเสธ
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pending Requests Created by Current User */}
      {pendingByMe.length > 0 && (
        <div className="transfer-outgoing">
          <h4>📤 คำขอโอนที่คุณสร้าง</h4>
          {pendingByMe.map(req => (
            <div key={req.id} className="transfer-card">
              <p>
                <strong>ถึง:</strong> {req.new_owner_email}<br />
                {req.reason && <><strong>เหตุผล:</strong> {req.reason}<br /></>}
                <strong>วันที่:</strong> {new Date(req.requested_at).toLocaleDateString('th-TH')}<br />
                <strong>สถานะ:</strong> รอการตอบรับ
              </p>
              <div className="mt-2">
                <button 
                  className="btn ghost" 
                  onClick={() => cancelTransfer(req.id)}
                >
                  ยกเลิกคำขอ
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Initiate Transfer Button */}
      {!showForm && (
        <button 
          className="btn primary mb-4" 
          onClick={() => setShowForm(true)}
        >
          🔄 เริ่มการโอนความเป็นเจ้าของ
        </button>
      )}

      {/* Transfer Form */}
      {showForm && (
        <form onSubmit={initiateTransfer} className="transfer-form">
          <h4>โอนความเป็นเจ้าของให้ผู้ใช้อื่น</h4>
          
          {error && (
            <div className="form-error mb-2">
              {error}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">
              อีเมลของเจ้าของใหม่ *
            </label>
            <input
              type="email"
              className={`form-input ${emailError ? 'error' : ''}`}
              value={newOwnerEmail}
              onChange={e => handleEmailChange(e.target.value)}
              placeholder="newowner@example.com"
              required
            />
            {emailError && <span className="field-error">{emailError}</span>}
            {!emailError && newOwnerEmail && validateEmail(newOwnerEmail) && (
              <span className="field-helper">✓ อีเมลถูกต้อง</span>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">
              เหตุผล (ไม่บังคับ)
            </label>
            <textarea
              className="form-textarea"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="เหตุผลในการโอนความเป็นเจ้าของ"
              rows={3}
            />
            <span className="field-helper">
              {reason.length}/500 ตัวอักษร
            </span>
          </div>

          <div>
            <button 
              type="submit" 
              className="btn primary mr-2" 
              disabled={loading || !!emailError || !newOwnerEmail}
            >
              {loading ? 'กำลังส่งคำขอ...' : 'ส่งคำขอโอน'}
            </button>
            <button 
              type="button" 
              className="btn ghost" 
              onClick={() => {
                setShowForm(false);
                setError(null);
                setEmailError(null);
                setNewOwnerEmail('');
                setReason('');
              }}
            >
              ยกเลิก
            </button>
          </div>
        </form>
      )}

      {/* Transfer History Toggle */}
      <div className="mt-4">
        <button
          className="btn ghost"
          onClick={async () => {
            if (!showHistory) {
              await loadAllRequests();
            }
            setShowHistory(!showHistory);
          }}
        >
          {showHistory ? '🔼 ซ่อนประวัติ' : '🔽 แสดงประวัติการโอนทั้งหมด'}
        </button>

        {showHistory && allRequests.length > 0 && (
          <div className="mt-4">
            <table className="transfer-history-table">
              <thead>
                <tr>
                  <th>จาก</th>
                  <th>ถึง</th>
                  <th>สถานะ</th>
                  <th>วันที่</th>
                </tr>
              </thead>
              <tbody>
                {allRequests.map(req => (
                  <tr key={req.id}>
                    <td>{req.current_owner_email}</td>
                    <td>{req.new_owner_email}</td>
                    <td>
                      {req.status === 'pending' && '⏳ รอการตอบรับ'}
                      {req.status === 'accepted' && '✅ ยอมรับแล้ว'}
                      {req.status === 'rejected' && '❌ ปฏิเสธแล้ว'}
                      {req.status === 'cancelled' && '🚫 ยกเลิกแล้ว'}
                    </td>
                    <td>
                      {new Date(req.requested_at).toLocaleDateString('th-TH')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
