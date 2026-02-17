# Financial Module - API Usage Guide

## ✅ FIXED - All Endpoints Working!

The Financial module has been updated with proper DTO structure and all endpoints are now fully operational.

---

## API Endpoints

### 1. Create Financial Statement

**POST** `/financial/statements`

**Headers:**
- `Authorization: Bearer {token}`
- `X-Tenant-Id: {tenantId}`
- `Content-Type: application/json`

**Request Body:**
```json
{
  "statement_type": "PL",
  "period_type": "monthly",
  "period_start": "2026-01-01",
  "period_end": "2026-01-31",
  "scenario": "actual",
  "status": "draft",
  "line_items": [
    {
      "line_code": "REV001",
      "line_name": "Product Revenue",
      "parent_code": "REV",
      "line_order": 1,
      "amount": 100000,
      "currency": "THB",
      "notes": "Q1 product sales"
    },
    {
      "line_code": "EXP001",
      "line_name": "Operating Expenses",
      "parent_code": "EXP",
      "line_order": 2,
      "amount": 40000,
      "currency": "THB",
      "notes": "Q1 operational costs"
    }
  ]
}
```

**Response:**
```json
{
  "statement": {
    "id": "b1933392-5b48-410a-a4d5-f5e40d08aa0a",
    "tenant_id": "testco",
    "statement_type": "PL",
    "period_type": "monthly",
    "period_start": "2026-01-01T00:00:00.000Z",
    "period_end": "2026-01-31T00:00:00.000Z",
    "scenario": "actual",
    "status": "draft",
    "created_at": "2026-01-26T09:02:45.123Z"
  },
  "lineItems": [
    {
      "id": "...",
      "statement_id": "b1933392-5b48-410a-a4d5-f5e40d08aa0a",
      "line_code": "REV001",
      "line_name": "Product Revenue",
      "parent_code": "REV",
      "line_order": 1,
      "amount": 100000,
      "currency": "THB",
      "notes": "Q1 product sales"
    },
    {
      "id": "...",
      "statement_id": "b1933392-5b48-410a-a4d5-f5e40d08aa0a",
      "line_code": "EXP001",
      "line_name": "Operating Expenses",
      "parent_code": "EXP",
      "line_order": 2,
      "amount": 40000,
      "currency": "THB",
      "notes": "Q1 operational costs"
    }
  ]
}
```

---

### 2. List Financial Statements

**GET** `/financial/statements`

**Query Parameters (all optional):**
- `type` - Filter by statement type: `PL`, `BS`, `CF`
- `scenario` - Filter by scenario: `actual`, `best`, `base`, `worst`, `custom`
- `period_start` - Filter by period start date (ISO format)
- `period_end` - Filter by period end date (ISO format)

**Example:**
```
GET /financial/statements?type=PL&scenario=actual
```

**Response:**
```json
[
  {
    "id": "b1933392-5b48-410a-a4d5-f5e40d08aa0a",
    "tenant_id": "testco",
    "statement_type": "PL",
    "period_type": "monthly",
    "period_start": "2026-01-01T00:00:00.000Z",
    "period_end": "2026-01-31T00:00:00.000Z",
    "scenario": "actual",
    "status": "draft",
    "created_at": "2026-01-26T09:02:45.123Z"
  }
]
```

---

### 3. Get Statement Detail

**GET** `/financial/statements/:id`

**Headers:**
- `Authorization: Bearer {token}`
- `X-Tenant-Id: {tenantId}`

**Response:**
```json
{
  "statement": {
    "id": "b1933392-5b48-410a-a4d5-f5e40d08aa0a",
    "tenant_id": "testco",
    "statement_type": "PL",
    "period_type": "monthly",
    "period_start": "2026-01-01T00:00:00.000Z",
    "period_end": "2026-01-31T00:00:00.000Z",
    "scenario": "actual",
    "status": "draft"
  },
  "lineItems": [
    {
      "id": "...",
      "statement_id": "b1933392-5b48-410a-a4d5-f5e40d08aa0a",
      "line_code": "REV001",
      "line_name": "Product Revenue",
      "line_order": 1,
      "amount": 100000,
      "currency": "THB"
    },
    {
      "id": "...",
      "statement_id": "b1933392-5b48-410a-a4d5-f5e40d08aa0a",
      "line_code": "EXP001",
      "line_name": "Operating Expenses",
      "line_order": 2,
      "amount": 40000,
      "currency": "THB"
    }
  ]
}
```

---

### 4. Update Statement Status

**PUT** `/financial/statements/:id/status`

**Headers:**
- `Authorization: Bearer {token}`
- `X-Tenant-Id: {tenantId}`
- `Content-Type: application/json`

**Request Body:**
```json
{
  "status": "approved"
}
```

**Status Flow:**
- `draft` → `approved` → `locked`

**Response:**
```json
{
  "id": "b1933392-5b48-410a-a4d5-f5e40d08aa0a",
  "tenant_id": "testco",
  "statement_type": "PL",
  "period_type": "monthly",
  "period_start": "2026-01-01T00:00:00.000Z",
  "period_end": "2026-01-31T00:00:00.000Z",
  "scenario": "actual",
  "status": "approved",
  "updated_at": "2026-01-26T09:05:12.456Z"
}
```

---

### 5. Delete Statement

**DELETE** `/financial/statements/:id`

**Headers:**
- `Authorization: Bearer {token}`
- `X-Tenant-Id: {tenantId}`

**Response:**
```json
{
  "message": "Statement deleted successfully"
}
```

**Note:** Deleting a statement will cascade delete all associated line items.

---

## Field Definitions

### Statement Types
- `PL` - Profit & Loss (Income Statement)
- `BS` - Balance Sheet
- `CF` - Cash Flow Statement

### Period Types
- `monthly` - Monthly period
- `quarterly` - Quarterly period
- `yearly` - Annual period

### Scenarios
- `actual` - Actual historical data
- `best` - Best case projection
- `base` - Base case projection
- `worst` - Worst case projection
- `custom` - Custom scenario

### Status
- `draft` - Editable draft
- `approved` - Approved, limited editing
- `locked` - Locked, read-only

---

## Frontend Integration Examples

### React/TypeScript Example

```typescript
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3000',
});

// Add auth interceptor
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  const tenantId = localStorage.getItem('tenant_id');
  
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (tenantId) {
    config.headers['X-Tenant-Id'] = tenantId;
  }
  
  return config;
});

// Create financial statement
export async function createFinancialStatement(data: {
  statement_type: 'PL' | 'BS' | 'CF';
  period_type: 'monthly' | 'quarterly' | 'yearly';
  period_start: string;
  period_end: string;
  scenario: 'actual' | 'best' | 'base' | 'worst' | 'custom';
  line_items: Array<{
    line_code: string;
    line_name: string;
    line_order: number;
    amount: number;
    currency?: string;
    parent_code?: string;
    notes?: string;
  }>;
}) {
  const response = await api.post('/financial/statements', data);
  return response.data;
}

// List statements
export async function listStatements(filters?: {
  type?: 'PL' | 'BS' | 'CF';
  scenario?: string;
  period_start?: string;
  period_end?: string;
}) {
  const response = await api.get('/financial/statements', { params: filters });
  return response.data;
}

// Get statement detail
export async function getStatement(id: string) {
  const response = await api.get(`/financial/statements/${id}`);
  return response.data;
}

// Update status
export async function updateStatementStatus(
  id: string,
  status: 'draft' | 'approved' | 'locked'
) {
  const response = await api.put(`/financial/statements/${id}/status`, { status });
  return response.data;
}

// Delete statement
export async function deleteStatement(id: string) {
  const response = await api.delete(`/financial/statements/${id}`);
  return response.data;
}
```

---

## Common Use Cases

### 1. Create Monthly P&L Statement
```typescript
const statement = await createFinancialStatement({
  statement_type: 'PL',
  period_type: 'monthly',
  period_start: '2026-01-01',
  period_end: '2026-01-31',
  scenario: 'actual',
  line_items: [
    {
      line_code: 'REV001',
      line_name: 'Revenue',
      line_order: 1,
      amount: 500000,
      currency: 'THB'
    },
    {
      line_code: 'COGS001',
      line_name: 'Cost of Goods Sold',
      line_order: 2,
      amount: 200000,
      currency: 'THB'
    },
    {
      line_code: 'GP',
      line_name: 'Gross Profit',
      parent_code: 'REV001',
      line_order: 3,
      amount: 300000,
      currency: 'THB'
    }
  ]
});
```

### 2. Filter Statements by Period
```typescript
const q1Statements = await listStatements({
  period_start: '2026-01-01',
  period_end: '2026-03-31',
  type: 'PL',
  scenario: 'actual'
});
```

### 3. Approve Statement
```typescript
// Get statement
const statement = await getStatement(statementId);

// Approve it
await updateStatementStatus(statementId, 'approved');
```

---

## Testing with cURL

```bash
# Get token
TOKEN=$(curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}' \
  | jq -r '.data.access_token')

# Create statement
curl -X POST http://localhost:3000/financial/statements \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-Id: testco" \
  -H "Content-Type: application/json" \
  -d '{
    "statement_type": "PL",
    "period_type": "monthly",
    "period_start": "2026-01-01",
    "period_end": "2026-01-31",
    "scenario": "actual",
    "status": "draft",
    "line_items": [
      {
        "line_code": "REV001",
        "line_name": "Revenue",
        "line_order": 1,
        "amount": 100000,
        "currency": "THB"
      }
    ]
  }'
```

---

## Swagger Documentation

Interactive API documentation is available at:
**http://localhost:3000/api**

Navigate to the **Financial** section to test all endpoints with live examples.

---

## Summary of Changes

### What Was Fixed:
1. ✅ Changed DTO from nested structure to flat structure
2. ✅ Proper field mapping from DTO to service layer
3. ✅ Added comprehensive Swagger documentation
4. ✅ Added API examples in Swagger UI
5. ✅ Fixed all database constraint violations

### Before (Broken):
```json
{
  "statement": {
    "period": "2026-01",
    "statement_type": "PL"
  },
  "lineItems": [...]
}
```

### After (Fixed):
```json
{
  "statement_type": "PL",
  "period_type": "monthly",
  "period_start": "2026-01-01",
  "period_end": "2026-01-31",
  "scenario": "actual",
  "line_items": [...]
}
```

---

## 🎯 Status: READY FOR FRONTEND!

All Financial module endpoints are now fully functional and ready for frontend integration.
