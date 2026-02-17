import React from 'react'

export default function PrivacyPolicy() {
  return (
    <>
      <div className="card mb-3">
        <div className="card-header">
          <h3 className="card-title"><i className="bi bi-shield-lock me-2"></i>นโยบายความเป็นส่วนตัว / Privacy Policy</h3>
        </div>
        <div className="card-body py-2">
          <small className="text-muted"><em>มีผลบังคับใช้: 1 กุมภาพันธ์ 2026</em></small>
        </div>
      </div>

      <div className="card mb-3">
        <div className="card-header"><h3 className="card-title">1. บทนำ</h3></div>
        <div className="card-body">
          <p>CFO Platform ("เรา", "ของเรา") ให้ความสำคัญกับความเป็นส่วนตัวของคุณ นโยบายความเป็นส่วนตัวฉบับนี้อธิบายว่าเราเก็บรวบรวม ใช้ และปกป้องข้อมูลส่วนบุคคลของคุณอย่างไร</p>
          <p>นโยบายนี้สอดคล้องกับ:</p>
          <ul><li>พระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA)</li><li>General Data Protection Regulation (GDPR)</li></ul>
        </div>
      </div>

      <div className="card mb-3">
        <div className="card-header"><h3 className="card-title">2. ข้อมูลที่เราเก็บรวบรวม</h3></div>
        <div className="card-body">
          <h6>2.1 ข้อมูลที่คุณให้กับเรา</h6>
          <ul>
            <li><strong>ข้อมูลบัญชี:</strong> ชื่อ, อีเมล, รหัสผ่าน (เข้ารหัส), ชื่อบริษัท</li>
            <li><strong>ข้อมูลทางการเงิน:</strong> งบการเงิน, ข้อมูลทางบัญชี, การคาดการณ์</li>
            <li><strong>ข้อมูลการใช้งาน:</strong> การเข้าสู่ระบบ, การกระทำต่างๆ ในระบบ</li>
          </ul>
          <h6>2.2 ข้อมูลที่เก็บรวบรวมอัตโนมัติ</h6>
          <ul>
            <li><strong>Log ของเซิร์ฟเวอร์:</strong> IP address, เบราว์เซอร์, เวลาเข้าถึง</li>
            <li><strong>คุกกี้:</strong> ดูรายละเอียดในหัวข้อที่ 7</li>
          </ul>
        </div>
      </div>

      <div className="card mb-3">
        <div className="card-header"><h3 className="card-title">3. วัตถุประสงค์ในการใช้ข้อมูล</h3></div>
        <div className="card-body">
          <p>เราใช้ข้อมูลของคุณเพื่อ:</p>
          <ul>
            <li>ให้บริการแพลตฟอร์ม CFO และฟังก์ชันต่างๆ</li>
            <li>ยืนยันตัวตนและจัดการบัญชีผู้ใช้</li>
            <li>ปรับปรุงและพัฒนาบริการของเรา</li>
            <li>วิเคราะห์การใช้งานเพื่อปรับปรุง UX</li>
            <li>ป้องกันการฉ้อโกงและรักษาความปลอดภัย</li>
            <li>ปฏิบัติตามข้อกำหนดทางกฎหมาย</li>
          </ul>
        </div>
      </div>

      <div className="card mb-3">
        <div className="card-header"><h3 className="card-title">4. ฐานทางกฎหมายในการประมวลผล</h3></div>
        <div className="card-body">
          <ul>
            <li><strong>สัญญา:</strong> จำเป็นเพื่อให้บริการตามที่คุณร้องขอ</li>
            <li><strong>ความยินยอม:</strong> สำหรับคุกกี้เพื่อการวิเคราะห์และการตลาด</li>
            <li><strong>ผลประโยชน์โดยชอบด้วยกฎหมาย:</strong> ปรับปรุงบริการและป้องกันการฉ้อโกง</li>
            <li><strong>ข้อผูกพันทางกฎหมาย:</strong> การเก็บบันทึกตามกฎหมาย</li>
          </ul>
        </div>
      </div>

      <div className="card mb-3">
        <div className="card-header"><h3 className="card-title">5. การเปิดเผยข้อมูล</h3></div>
        <div className="card-body">
          <p>เราไม่ขายหรือแบ่งปันข้อมูลส่วนบุคคลของคุณกับบุคคลที่สาม ยกเว้น:</p>
          <ul>
            <li><strong>ผู้ให้บริการ:</strong> AWS, Stripe, SendGrid (ตาม Data Processing Agreement)</li>
            <li><strong>ตามกฎหมาย:</strong> เมื่อมีคำสั่งศาล หรือหน่วยงานราชการร้องขอ</li>
            <li><strong>การปกป้องสิทธิ์:</strong> ป้องกันการฉ้อโกง หรือการละเมิด</li>
          </ul>
        </div>
      </div>

      <div className="card mb-3">
        <div className="card-header"><h3 className="card-title">6. สิทธิของคุณ (GDPR/PDPA)</h3></div>
        <div className="card-body">
          <p>คุณมีสิทธิ์ดังต่อไปนี้:</p>
          <ul>
            <li><strong>สิทธิ์ในการเข้าถึง:</strong> ขอดูข้อมูลส่วนบุคคลของคุณ</li>
            <li><strong>สิทธิ์ในการแก้ไข:</strong> แก้ไขข้อมูลที่ไม่ถูกต้อง</li>
            <li><strong>สิทธิ์ในการลบ:</strong> ขอลบข้อมูล (Right to be Forgotten)</li>
            <li><strong>สิทธิ์ในการพกพาข้อมูล:</strong> ขอส่งออกข้อมูลในรูปแบบที่อ่านได้</li>
            <li><strong>สิทธิ์คัดค้าน:</strong> คัดค้านการประมวลผลข้อมูล</li>
            <li><strong>สิทธิ์ถอนความยินยอม:</strong> ถอนความยินยอมได้ทุกเมื่อ</li>
          </ul>
          <p>เพื่อใช้สิทธิ์เหล่านี้ กรุณาไปที่ <a href="/data-requests">หน้าคำขอข้อมูล</a> หรือติดต่อ privacy@cfoplatform.com</p>
        </div>
      </div>

      <div className="card mb-3">
        <div className="card-header"><h3 className="card-title">7. คุกกี้ (Cookies)</h3></div>
        <div className="card-body">
          <p>เราใช้คุกกี้ 3 ประเภท:</p>
          <ul>
            <li><strong>คุกกี้ที่จำเป็น:</strong> จำเป็นสำหรับการทำงานของเว็บไซต์ (เช่น session, authentication)</li>
            <li><strong>คุกกี้เพื่อการวิเคราะห์:</strong> วิเคราะห์การใช้งาน (Google Analytics)</li>
            <li><strong>คุกกี้เพื่อการตลาด:</strong> แสดงโฆษณาที่เกี่ยวข้อง</li>
          </ul>
          <p>คุณสามารถจัดการการตั้งค่าคุกกี้ได้โดยคลิก "ตั้งค่าคุกกี้" ที่แบนเนอร์คุกกี้</p>
        </div>
      </div>

      <div className="card mb-3">
        <div className="card-header"><h3 className="card-title">8. ความปลอดภัยของข้อมูล</h3></div>
        <div className="card-body">
          <p>เราใช้มาตรการรักษาความปลอดภัย:</p>
          <ul>
            <li>เข้ารหัสข้อมูลด้วย TLS/SSL (HTTPS)</li>
            <li>เข้ารหัสรหัสผ่านด้วย bcrypt</li>
            <li>เข้ารหัส Tenant credentials ด้วย AWS KMS</li>
            <li>การแยก Database แต่ละ Tenant (Multi-tenant isolation)</li>
            <li>Audit logs สำหรับการเข้าถึงข้อมูลสำคัญ</li>
          </ul>
        </div>
      </div>

      <div className="card mb-3">
        <div className="card-header"><h3 className="card-title">9. ระยะเวลาการเก็บข้อมูล</h3></div>
        <div className="card-body">
          <ul>
            <li><strong>ข้อมูลบัญชี:</strong> เก็บไว้ตลอดอายุการใช้งาน + 7 ปีหลังปิดบัญชี (ตามกฎหมายบัญชี)</li>
            <li><strong>ข้อมูลทางการเงิน:</strong> 7 ปี (ตาม พ.ร.บ.การบัญชี)</li>
            <li><strong>Audit logs:</strong> 3 ปี</li>
            <li><strong>คุกกี้:</strong> สูงสุด 12 เดือน</li>
          </ul>
        </div>
      </div>

      <div className="card mb-3">
        <div className="card-header"><h3 className="card-title">10. การถ่ายโอนข้อมูลระหว่างประเทศ</h3></div>
        <div className="card-body">
          <p>ข้อมูลของคุณอาจถูกจัดเก็บและประมวลผลในประเทศอื่น (AWS Singapore, AWS Ireland) เราใช้มาตรการปกป้อง:</p>
          <ul>
            <li>Standard Contractual Clauses (SCCs) สำหรับการถ่ายโอนข้อมูลไปยัง EU</li>
            <li>AWS Data Processing Addendum</li>
          </ul>
        </div>
      </div>

      <div className="card mb-3">
        <div className="card-header"><h3 className="card-title">11. การแจ้งเหตุละเมิดข้อมูล</h3></div>
        <div className="card-body">
          <p>หากมีการละเมิดข้อมูลส่วนบุคคล เราจะแจ้งให้คุณทราบภายใน 72 ชั่วโมง ผ่านอีเมลและการแจ้งเตือนในระบบ</p>
        </div>
      </div>

      <div className="card mb-3">
        <div className="card-header"><h3 className="card-title">12. เด็กและผู้เยาว์</h3></div>
        <div className="card-body">
          <p>บริการของเราไม่ได้มุ่งเน้นไปที่เด็กอายุต่ำกว่า 18 ปี หากเราทราบว่ามีการเก็บข้อมูลเด็ก เราจะลบข้อมูลนั้นทันที</p>
        </div>
      </div>

      <div className="card mb-3">
        <div className="card-header"><h3 className="card-title">13. การเปลี่ยนแปลงนโยบาย</h3></div>
        <div className="card-body">
          <p>เราอาจปรับปรุงนโยบายนี้เป็นครั้งคราว การเปลี่ยนแปลงที่สำคัญจะแจ้งให้คุณทราบผ่านอีเมล และจะมีผลหลังจาก 30 วัน</p>
        </div>
      </div>

      <div className="card mb-3">
        <div className="card-header"><h3 className="card-title">14. ติดต่อเรา</h3></div>
        <div className="card-body">
          <p>หากคุณมีคำถามเกี่ยวกับนโยบายความเป็นส่วนตัว หรือต้องการใช้สิทธิ์ กรุณาติดต่อ:</p>
          <ul>
            <li><strong>อีเมล:</strong> privacy@cfoplatform.com</li>
            <li><strong>เจ้าหน้าที่คุ้มครองข้อมูล (DPO):</strong> dpo@cfoplatform.com</li>
            <li><strong>ที่อยู่:</strong> [ที่อยู่บริษัท]</li>
          </ul>
        </div>
      </div>

      <div className="card mb-3">
        <div className="card-header"><h3 className="card-title">15. หน่วยงานกำกับดูแล</h3></div>
        <div className="card-body">
          <p>คุณมีสิทธิ์ยื่นข้อร้องเรียนกับหน่วยงานกำกับดูแล:</p>
          <ul>
            <li><strong>ประเทศไทย:</strong> สำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคล (PDPC)</li>
            <li><strong>EU:</strong> Data Protection Authority ในประเทศของคุณ</li>
          </ul>
        </div>
      </div>

      <div className="text-center text-muted py-3">
        <strong>CFO Platform</strong><br />
        มีผลบังคับใช้: 1 กุมภาพันธ์ 2026<br />
        <a href="/">กลับไปหน้าแรก</a>
      </div>
    </>
  )
}
