# WorkingLab

เว็บบันทึกเวลาเข้า-เลิกงานที่รันบนเครื่องตัวเอง ตอนกดเลิกงาน ระบบจะสรุปงานของวันนั้นจาก git ให้อัตโนมัติ (work detail)
และสิ้นเดือนใช้ work detail ทั้งเดือนไปกรอกไฟล์ต้นแบบ timesheet (.xlsx)

## ติดตั้งครั้งแรก

ต้องมี [Node.js](https://nodejs.org) 22.13 ขึ้นไป (แนะนำ 24) และ git

1. ติดตั้ง dependencies

   ```powershell
   npm install
   ```

2. ติดตั้ง Claude Code CLI แล้ว login ด้วยบัญชี Claude Pro (ทำครั้งเดียว)

   ```powershell
   irm https://claude.ai/install.ps1 | iex
   ```

   ```powershell
   claude
   ```

   พอ login เสร็จ พิมพ์ `/exit` เพื่อออก (ถ้าติดตั้งผ่าน npm ก็ได้: `npm install -g @anthropic-ai/claude-code`)

## รัน

```powershell
npm run dev
```

เปิด <http://127.0.0.1:3000> (server รับเฉพาะการเชื่อมต่อจากเครื่องนี้)

- `npm run dev`: รันแบบ restart เองเมื่อแก้โค้ด
- `npm start`: รันปกติ
- `npm run typecheck`: ตรวจ TypeScript
- เปลี่ยน port ได้ด้วย env `PORT`

## ใช้งาน

1. **ตั้งค่า**: ใส่ folder target, เลือกประเภท `single` (repo เดียว) หรือ `multi` (มีหลาย repo อยู่ข้างใน)
   และใส่อีเมล git ของตัวเอง แล้วกด "บันทึก + ทดสอบหา repo" เพื่อดูว่าเจอ repo ครบไหม
2. **เข้างาน / เลิกงาน**: กดที่หน้าหลัก (วันละ 1 รอบ) ตอนเลิกงานระบบจะเก็บข้อมูล git แล้วให้ agent สรุปเป็น work detail
3. **แก้ย้อนหลัง**: เปิดหน้าของวันนั้น แก้เวลา แก้ work detail เอง หรือสั่งสรุปใหม่ได้
4. **Timesheet**: อัปโหลดไฟล์ต้นแบบ `.xlsx` เลือกเดือน แล้วกด Gen timesheet

### ระบบเก็บอะไรจาก git

ต่อ repo เก็บ 2 ส่วน:

- commit ที่เราเป็นคนเขียนในวันนั้น จากทุก branch
- งานที่ยังไม่ commit โดยนับเฉพาะไฟล์ที่แก้ในวันนั้น

ไฟล์อย่าง lock file, `dist/`, `build/` จะแสดงแค่ชื่อไฟล์ ไม่ส่งเนื้อหาให้ agent

### ถ้าสรุปไม่สำเร็จ

agent ใช้โควตาเดียวกับ Claude Pro ถ้าโควตาหมดหรือเรียก `claude` ไม่เจอ ข้อมูล git ยังถูกเก็บไว้
เปิดหน้าของวันนั้นแล้วกด "สรุปใหม่จากข้อมูล git เดิม" ได้ภายหลัง
ถ้าเรียก `claude` ไม่เจอ ให้ใส่ path เต็มของคำสั่ง claude ในหน้าตั้งค่า

## ข้อมูลเก็บที่ไหน

ทุกอย่างอยู่ใน `data/` (ไม่ขึ้น git):

- `data/workinglab.db`: ฐานข้อมูล SQLite
- `data/templates/`: ไฟล์ต้นแบบที่อัปโหลด
- `data/timesheets/`: timesheet ที่ gen แล้ว

ย้ายไปที่อื่นได้ด้วย env `WORKINGLAB_DATA` สำรองข้อมูลได้ด้วยการ copy โฟลเดอร์นี้ไปเก็บ (ปิด server ก่อน copy)
