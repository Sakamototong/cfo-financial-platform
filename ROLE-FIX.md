# การแก้ไข Role และ Menu แสดงตาม User

## ปัญหาที่แก้ไข

เมื่อ login ด้วย Super Admin users (superadmin, admin) เมนูไม่แสดงตาม role ที่ถูกต้อง

## สาเหตุ

Backend `/auth/me` endpoint เช็ค role จาก `system_users` table ด้วย email เท่านั้น แต่:
- User `superadmin` มี JWT field `preferred_username: "superadmin"` และ `email: "superadmin@system.local"`
- ใน database มี `email = "superadmin@system.local"` (ถูก)
- User `admin` มี JWT field `preferred_username: "admin"` แต่ไม่มี email
- ใน database มี `email = "admin"` (เป็น username ไม่ใช่ email จริง)

เดิมเช็คแค่ `email` จาก JWT ทำให้ไม่เจอ user `admin` ใน database

## วิธีแก้

แก้ไข `auth.controller.ts` ให้เช็คทั้ง `email` และ `preferred_username`:

```typescript
// Try to find by email first
let systemUser = await this.systemUsersService.getSystemUserByEmail(email);

// If not found and username is different from email, try username
if (!systemUser && username !== email) {
  systemUser = await this.systemUsersService.getSystemUserByEmail(username);
}
```

## ผลลัพธ์

✅ **Super Admin users ทั้ง 3 ตัวได้ role ถูกต้อง:**
- `superadmin` / `Secret123!` → role: `super_admin`
- `superadmin@system.local` / `Secret123!` → role: `super_admin`
- `admin` / `Secret123!` → role: `super_admin`

## สำหรับผู้ใช้

**หากเมนูยังไม่แสดงถูกต้อง กรุณา:**
1. Logout จากระบบ
2. เคลียร์ browser cache หรือ localStorage
3. Login ใหม่อีกครั้ง

หรือเปิด Developer Console (F12) แล้วรัน:
```javascript
localStorage.clear()
window.location.href = '/login'
```

## ทดสอบ

```bash
# Test superadmin
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type:application/json" \
  -d '{"username":"superadmin","password":"Secret123!"}' | jq .

# Get role
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type:application/json" \
  -d '{"username":"superadmin","password":"Secret123!"}' | jq -r '.data.access_token')

curl -X GET http://localhost:3000/auth/me \
  -H "Authorization: Bearer $TOKEN" | jq '.data.role'
# Output: "super_admin"
```

## Deploy

```bash
cd infra
docker compose build backend
docker compose up -d backend
```
