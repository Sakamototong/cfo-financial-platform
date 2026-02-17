# Data Processing Agreement (DPA) — ฉบับร่าง

**Parties**
- Processor: [ชื่อบริษัทผู้ให้บริการ]
- Controller: [ชื่อลูกค้า]

**Definitions**
- "Personal Data", "Processing", "Sub-processor", "Data Subject", "Data Breach" ตามนิยามใน PDPA/GDPR

**Subject Matter & Duration**
- บริการ: การให้บริการแพลตฟอร์ม CFO ตามสเปคในไฟล์ [detailproject/CFO Platform.txt](detailproject/CFO%20Platform.txt)
- ระยะเวลา: ตามสัญญาหลักระหว่าง Parties

**Data Categories**
- ข้อมูลติดต่อ (ชื่อ, อีเมล, เบอร์), ข้อมูลบริษัท, ข้อมูลการเงิน (P&L, balance, transaction), เอกสารภาษี, ข้อมูลชำระเงิน (tokenized), logs และ metadata

**Purposes of Processing**
- ให้บริการแพลตฟอร์ม, การเรียกเก็บเงิน, การวิเคราะห์/forecasting, document extraction (AI), การบูรณาการกับ ERP/ธนาคาร/Payment Gateways

**Roles**
- ตามค่าเริ่มต้น ลูกค้าเป็น Controller; ผู้ให้บริการเป็น Processor (ปรับตามแต่ละกรณี)

**Security Measures**
- TLS สำหรับการสื่อสารทั้งหมด
- Encryption at rest (แนะนำ per‑tenant keys / envelope encryption)
- RBAC + MFA สำหรับผู้ดูแลระบบ
- Immutable audit logs และ centralized logging (tenant‑tagged)
- Regular vulnerability scanning และ patch management

**Subprocessing**
- Processor ต้องแจ้ง Controller ล่วงหน้าเกี่ยวกับ subprocessors และทำ DPA กับ subprocessors ในมาตรฐานเทียบเท่า

**International Transfers**
- ระบุประเทศโฮสต์และกลไกการถ่ายโอน (SCCs/adequacy/supplementary measures) — ต้องเติมเมื่อทราบที่ตั้งผู้ให้บริการ/คลาวด์

**Audit & Inspection**
- Controller มีสิทธิขอตรวจสอบตามข้อตกลง โดยแจ้งล่วงหน้าและไม่รบกวนการให้บริการ

**Breach Notification**
- Processor แจ้ง Controller โดยไม่เกิน 72 ชั่วโมงหลังทราบเหตุ (หรือเร็วกว่า หากกฎหมายบังคับ)
- รายงานเหตุการณ์, ผลกระทบ, มาตรการเยียวยา

**Data Retention & Deletion**
- เก็บข้อมูลตามระยะเวลาที่ Controller กำหนดหรือภายใต้ข้อบังคับทางกฎหมาย
- เมื่อสิ้นสุดสัญญา Processor จะลบหรือคืนข้อมูลตามคำสั่ง Controller ภายในระยะเวลาที่ตกลง

**Assistance with DSARs**
- Processor ช่วย Controller ในการตอบคำขอสิทธิของเจ้าของข้อมูล (access/rectify/delete/port) ตามขอบเขตที่สอดคล้องกับสัญญา

**Liability & Indemnities**
- ขอบเขตความรับผิดและข้อจำกัดความเสียหายต้องระบุชัดเจน — ข้อความเชิงสัญญานี้ควรทบทวนโดยทนาย

**Governing Law & Jurisdiction**
- ระบุประเทศ/กฎหมายบังคับใช้และศาลที่ตกลงกัน (placeholder)

---
*หมายเหตุ:* ส่วนที่เกี่ยวกับ Liability, International Transfers และ Governing Law ต้องได้รับการตรวจโดยทีมกฎหมายก่อนใช้งานจริง
