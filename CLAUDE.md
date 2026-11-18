# WorkingLab

Web project สำหรับใช้งานบนเครื่องตัวเอง (local) เท่านั้น

> **กฎสำหรับ Claude:** ไฟล์นี้คือแหล่งข้อมูลหลักของโปรเจกต์ ถ้าระหว่างคุยกัน
> เจ้าของเพิ่มหรือเปลี่ยนข้อกำหนด จุดประสงค์ stack คำสั่งรัน หรือการตัดสินใจสำคัญใด ๆ
> ให้อัปเดตไฟล์นี้ในเทิร์นเดียวกันทันที (อย่ารอให้สั่ง) และบอกเจ้าของว่าแก้ส่วนไหน

## ข้อกำหนด (Requirements)

- **รัน local เท่านั้น**: ไม่ deploy ขึ้น server จริง ไม่ต้องเปิดให้คนภายนอกเข้า
- **Database: SQLite**: เก็บเป็นไฟล์ในเครื่อง ไม่ต้องมี DB server
- **จุดประสงค์ของโปรเจกต์**: บันทึกเวลาเข้า-เลิกงาน และสรุปงานรายวันจาก git เพื่อใช้ gen timesheet สิ้นเดือน

## ฟีเจอร์ (ภาพรวมจากเจ้าของ, 2026-11-18)

1. **ปุ่มเข้างาน**: บันทึกลง DB ว่าวันนี้เข้างานเวลาไหน
2. **ปุ่มเลิกงาน**: บันทึกเวลาเลิกงาน แล้วให้ agent สแกน folder target ว่าวันนั้นทำอะไรไปบ้างใน git
   และบันทึกผลเป็น **work detail** ของวันนั้น
3. **ตั้งค่า folder target**:
   - path ของ folder target
   - type: `single` (folder นั้นเป็น repo เดียว) หรือ `multi` (folder ที่มีหลาย repo อยู่ข้างใน)
4. **Template timesheet**: อัปโหลดไฟล์ต้นแบบ (format) เข้าระบบ
5. **Gen timesheet (สิ้นเดือน)**: agent เอา work detail ของทั้งเดือน + ไฟล์ต้นแบบ มาสร้าง timesheet

## การตัดสินใจ (Decisions)

### Agent: ใช้ Claude Code CLI ในเครื่อง (2026-11-18)

- เจ้าของใช้ Claude **Pro** ซึ่งไม่รวม API → backend เรียก agent ด้วยการรัน `claude -p "<prompt>"` (headless)
  และอ่านผลจาก stdout (ใช้ `--output-format json` ถ้าต้องการผลแบบมีโครงสร้าง)
- ใช้โควตาเดียวกับ Pro: ถ้าโควตาหมดหรือ CLI error ต้องไม่ทำให้ข้อมูลหาย → ระบบต้อง **กดสรุปใหม่ภายหลังได้**
- แยกส่วนเรียก agent ไว้ใน module เดียว (adapter) เพื่อให้เปลี่ยนไปใช้ Claude API ได้ในอนาคตโดยแก้จุดเดียว
- **แบ่งหน้าที่:**
  - ดึงข้อมูล git ด้วยโค้ดเอง (`git log` ตามช่วงเวลาของวันนั้น) ไม่ให้ agent ไปค้นเอง → เร็ว แน่นอน และเก็บรายการ commit ดิบลง DB ได้เสมอ
  - agent ทำเฉพาะงานที่ต้องใช้ภาษา: สรุป commit เป็น work detail และกรอก timesheet ตามไฟล์ต้นแบบ
- เครื่องนี้ยังไม่มีคำสั่ง `claude` ใน PATH (ตัวในแอป desktop เรียกจาก terminal ไม่ได้)
  → ต้องติดตั้ง Claude Code CLI แยก และ login ด้วยบัญชี Pro ครั้งแรก; ใส่ขั้นตอนไว้ใน README ตอน scaffold

### ไฟล์ต้นแบบ timesheet: xlsx (2026-11-18)

- เวอร์ชันแรกรองรับเฉพาะ **.xlsx** (อัปโหลดต้นแบบ และ gen ผลลัพธ์เป็น .xlsx)
- รูปแบบอื่น (เช่น docx) อาจเพิ่มภายหลัง → ออกแบบส่วน gen ให้แยกตามชนิดไฟล์ได้

### ขอบเขตการเก็บงานจาก git (2026-11-18)

หลักคิดของเจ้าของ: "วันนี้ฉันแก้อะไรไปบ้าง" ทั้งที่ commit แล้ว และที่ยังแก้ค้างอยู่ ไม่สนว่าอยู่ branch ไหน

ต่อ repo เก็บ 2 ส่วน:

1. **Commit ของวันนั้น**
   - `git log --all` ทุก branch (local + remote-tracking) ตัด commit ซ้ำด้วย hash
   - กรองด้วย author = อีเมลของเจ้าของ (ตั้งได้หลายอีเมลในหน้าตั้งค่า เพราะแต่ละ repo อาจตั้ง `user.email` ต่างกัน
     ค่าเริ่มต้นดึงจาก `git config user.email`)
   - ช่วงเวลา: author date อยู่ในวันนั้น ตามเวลาเครื่อง
   - เก็บ message + รายชื่อไฟล์/สถิติ (`--stat`) + diff แบบตัดความยาว เพื่อให้ agent สรุปจากเนื้องานจริง ไม่ใช่แค่ message
2. **งานที่ยังไม่ commit (working tree)**
   - staged + unstaged (`git diff HEAD`) + ไฟล์ใหม่ที่ยังไม่ track
   - ถือว่าเป็นงานของเจ้าของเสมอ (เป็นเครื่องของเจ้าของ)
   - นับเฉพาะไฟล์ที่ **แก้ไขในวันนั้น** (ดูจาก mtime ของไฟล์) เพื่อไม่ให้งานค้างหลายวันถูกนับซ้ำทุกวัน

ข้อควรระวัง: diff ใหญ่ต้องตัดความยาวก่อนส่งให้ agent (เช่น lock file, ไฟล์ build, binary ให้แสดงแค่ชื่อไฟล์)

### ขอบเขตเวอร์ชันแรก (2026-11-18)

- **เข้า-เลิกงานได้วันละ 1 รอบ**: 1 แถวต่อวัน (`work_date` unique) มี `check_in_at`, `check_out_at`
- **folder target ตั้งได้ชุดเดียว**: path 1 ค่า + type (`single` / `multi`)
- **เลือก repo ที่ไม่ต้อง scan (โหมด multi, 2026-11-18)**: หน้าตั้งค่า scan folder ย่อยแล้วแสดงเป็นสวิตช์ให้ปิดทีละ repo
  - เก็บเป็น `excludedRepos` (ชื่อ folder, เทียบแบบไม่สนตัวพิมพ์) ไม่ใช่รายการที่เลือก → repo ใหม่ถูก scan อัตโนมัติ
  - เปลี่ยน path ของ folder target = ล้างรายการที่ข้าม; สลับไป single แล้วกลับมา multi รายการเดิมยังอยู่

### UI (2026-11-18)

- **ภาษาของหน้าเว็บ: อังกฤษ** (ข้อความบนหน้าเว็บ, ข้อความแจ้งเตือน, error ทั้งหมด)
  - ภาษาของ work detail / timesheet เลือกแยกในหน้าตั้งค่า เป็นตัวเลือก (ไม่ใช่ช่องพิมพ์เอง): `English` / `Thai`
    ค่าเริ่มต้น Thai; รายการอยู่ที่ `LANGUAGES` ใน `db.ts`
- ข้อความ comment ในโค้ดยังเป็นภาษาไทยได้ตามปกติ
- **Theme:** มีปุ่มสลับ Light / Dark / System ที่ header จำค่าไว้ใน localStorage ของเบราว์เซอร์ (ค่าเริ่มต้น = System)
- เจ้าของชอบแนวดีไซน์ glass + gradient + ปุ่มกลมใหญ่ และอยากให้สวยระดับ "ว้าว"

### Stack (2026-11-18, Claude เลือกตามที่เจ้าของให้แนะนำ)

เครื่องนี้มี Node 24 และ git อยู่แล้ว แต่ไม่มี Python → ใช้ Node เพื่อไม่ต้องติดตั้งเพิ่ม (Claude Code CLI ก็ติดตั้งผ่าน npm ได้)

- **Runtime:** Node.js 24 + TypeScript (รันตอน dev ด้วย `tsx`)
- **Web server:** Hono + `@hono/node-server`, render HTML ฝั่ง server ด้วย Hono JSX
- **UI:** HTML ฝั่ง server + htmx สำหรับปุ่มต่าง ๆ (ไม่ใช้ SPA/React เพราะมีไม่กี่หน้า)
- **Database:** SQLite ผ่าน `node:sqlite` ที่มากับ Node (ไม่ต้อง build native module บน Windows)
- **xlsx:** `exceljs` (อ่านต้นแบบและเขียนผลโดยรักษา format เดิม)
- **git / agent:** เรียก `git` และ `claude -p` ผ่าน `child_process.execFile` (ไม่ผ่าน shell)
- **Gen timesheet:** โค้ดอ่านโครงสร้างต้นแบบ (sheet, header, ตำแหน่งเซลล์) → ส่งให้ agent พร้อม work detail ทั้งเดือน
  → agent ตอบเป็น JSON ว่าจะกรอกอะไรลงเซลล์ไหน → โค้ดเขียนลงสำเนาของต้นแบบด้วย exceljs
  (agent ไม่แก้ไฟล์ xlsx เอง เพื่อให้ format ไม่พัง)

## คำสั่ง

- `npm run dev`: รัน dev server (restart เองเมื่อแก้โค้ด) ที่ http://127.0.0.1:3000
- `npm start`: รันปกติ
- `npm run typecheck`: ตรวจ TypeScript (TypeScript 7)
- env: `PORT` (ค่าเริ่มต้น 3000), `WORKINGLAB_DATA` (ค่าเริ่มต้น `./data`)
- server bind แค่ `127.0.0.1` ตามข้อกำหนดรัน local เท่านั้น

## โครงสร้างโค้ด (`src/`)

- `server.tsx`: route ทั้งหมดของ Hono
- `views.tsx`: หน้าเว็บ (Hono JSX) + ไอคอน SVG inline; ใช้ htmx แค่ poll สถานะตอนกำลังสรุป / gen (ทุก 3 วินาที)
- `../public/app.css`: ดีไซน์ทั้งหมด (glass card + พื้นหลัง aurora, รองรับ light/dark ตาม OS, responsive, ปิดแอนิเมชันเมื่อ prefers-reduced-motion)
- `../public/app.js`: นาฬิกาสด, เวลาทำงานที่นับขึ้น, วงแหวนความคืบหน้ารอบปุ่ม (เป้า 8 ชม.)
- ไฟล์ static เสิร์ฟผ่าน `/static/:file` แบบ whitelist ใน `server.tsx`
- ฟอนต์ IBM Plex Sans Thai + Space Grotesk โหลดจาก Google Fonts (ถ้าออฟไลน์จะใช้ฟอนต์ระบบแทน)
- `db.ts`: schema และ query ทั้งหมด (`node:sqlite`); ตั้งค่าเก็บเป็น JSON แถวเดียวในตาราง `settings`
- `git.ts`: หา repo และเก็บข้อมูล git ของวันนั้น
- `agent.ts`: adapter เรียก `claude -p --output-format json` ส่ง prompt ทาง stdin
- `summary.ts`: สรุป work detail รายวันแบบ background
- `timesheet.ts`: อ่านโครงสร้างต้นแบบ, ให้ agent ตอบ JSON, เขียนลง xlsx
- `time.ts`: ฟังก์ชันวันที่/เวลา (เวลาท้องถิ่น เก็บเป็นข้อความ `YYYY-MM-DD HH:MM:SS`)

พฤติกรรมที่ควรรู้:

- งานสรุป / gen ทำ background ในโปรเซส; ถ้า server ปิดกลางคัน ตอนเปิดใหม่สถานะ `running` จะถูกเปลี่ยนเป็น `error` ให้กดใหม่ได้
- ไฟล์ต้นแบบที่ใช้ = ตัวที่อัปโหลดล่าสุด
- ตอน gen timesheet ไม่เขียนทับเซลล์ที่มีสูตร และแถวที่เกินต้นแบบจะยืม style จากแถวสุดท้ายของต้นแบบ
- `npm audit` แจ้ง `uuid` (มากับ exceljs) ระดับ moderate: ไม่กระทบการใช้งานนี้ ยังไม่แก้

## สถานะ

- 2026-11-18: เริ่มโปรเจกต์, `git init` แล้ว (branch `master`), ตอบคำถามออกแบบครบ เลือก stack แล้ว
- 2026-11-18: เขียนเวอร์ชันแรกครบทุกฟีเจอร์ ทดสอบด้วย repo ทดสอบ + agent จำลองผ่านแล้ว
  (เข้า-เลิกงาน, เก็บ git แบบ multi/single, สรุป, แก้ย้อนหลัง, อัปโหลดต้นแบบ, gen + ดาวน์โหลด timesheet, กรณี agent error)
  **ยังไม่ได้ทดสอบกับ Claude Code CLI จริง** เพราะเครื่องยังไม่ได้ติดตั้ง `claude`

## แนวทางการทำงาน

- `.gitignore` ไม่เอา `data/` และไฟล์ SQLite ขึ้น git (เป็นข้อมูลจริงของเจ้าของ)
- ทดสอบโดยไม่แตะข้อมูลจริง: รันด้วย `WORKINGLAB_DATA=<โฟลเดอร์ชั่วคราว>` และ `PORT` อื่น