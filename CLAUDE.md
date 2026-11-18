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
6. **วันลา (2026-11-18)**: บันทึกต่อวันในหน้า `/days/:date` — ประเภท + ชั่วโมง (ไม่บังคับ) + หมายเหตุ (ไม่บังคับ); ซ้อนกับเวลา/work detail ได้ (ลาครึ่งวัน / ลาชั่วโมง)
   - ประเภท: sick / personal / vacation / holiday (`leave_type` ใน `work_days`)
   - holiday ไม่ใส่ชั่วโมง → 8 ชม.; หมายเหตุใส่ชื่อวันหยุดได้
   - ปฏิทินหน้าแรก: จุดสี Leave, รายการ **Thai public holidays this month** กด Apply ครั้งเดียว (package `date-holidays`, โมดูล `holidays.ts`)
   - Gen timesheet: ส่ง `Leave: …` เป็นบรรทัดแยกจาก work detail ให้ agent กรอกตามต้นแบบ

## การตัดสินใจ (Decisions)

### Agent: สลับ Claude Code CLI / Cursor Agent CLI ได้ (2026-11-18)

- ตั้งค่าในหน้า Settings: `agentProvider` = `claude` | `cursor` (คำสั่งใช้ `claude` / `agent` ตาม provider อัตโนมัติ ไม่มีช่องพิมพ์เอง)
- backend เรียก headless แล้วอ่านผลจาก stdout (`--output-format json`); ส่ง prompt ทาง stdin
  - Claude: `claude -p --output-format json`
  - Cursor: `agent -p --mode=ask --trust --output-format json` (ask = ขอแค่ข้อความ ไม่ให้แก้ไฟล์)
- JSON ตอบกลับของทั้งสองตัวใช้ฟิลด์ `subtype` / `is_error` / `result` แบบเดียวกัน → parse จุดเดียวใน `agent.ts`
- โควตาคนละบัญชี (Claude Pro vs Cursor); ถ้าโควตาหมดหรือ CLI error ต้องไม่ทำให้ข้อมูลหาย → กดสรุปใหม่ภายหลังได้
- แยกส่วนเรียก agent ไว้ใน module เดียว (adapter) เพื่อให้เปลี่ยนไปใช้ API ได้ในอนาคตโดยแก้จุดเดียว
- **แบ่งหน้าที่:**
  - ดึงข้อมูล git ด้วยโค้ดเอง (`git log` ตามช่วงเวลาของวันนั้น) ไม่ให้ agent ไปค้นเอง → เร็ว แน่นอน และเก็บรายการ commit ดิบลง DB ได้เสมอ
  - agent ทำเฉพาะงานที่ต้องใช้ภาษา: สรุป commit เป็น work detail และกรอก timesheet ตามไฟล์ต้นแบบ
- 2026-11-18: ติดตั้ง Claude Code CLI แล้วด้วย `npm install -g @anthropic-ai/claude-code` (v2.1.327)
  อยู่ที่ `%LOCALAPPDATA%\Author Software\nvm\.nodejs\claude.exe` (โฟลเดอร์ node ของ nvm ซึ่งอยู่ใน PATH)
  - npm เตือนว่าไม่ได้รัน postinstall script ของแพ็กเกจ แต่ `claude --version` ใช้ได้ปกติ
  - ถ้ายังไม่ login, `claude -p` จะตอบ `is_error: true` พร้อม `result: "Not logged in · Please run /login"`
    (adapter แสดงเป็น "The agent returned an error: …" บนหน้าเว็บ)
- Cursor Agent CLI ยังไม่ได้ติดตั้งบนเครื่องนี้ตอนเพิ่มตัวเลือก (คำสั่ง `agent` ยังไม่ได้อยู่ใน PATH)

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
- **ปฏิทินหน้า Today ย้อนดูเดือนก่อนได้** (2026-11-18): ปุ่ม ‹ › และ "This month" → `/?month=YYYY-MM#month`
  (ไปเกินเดือนปัจจุบันไม่ได้); เดือนอื่นแสดงทุกวันในรายการด้านขวา
  - "Days logged" นับวันที่มีเวลาเข้างาน **หรือ** มี work detail **หรือ** มีวันลา (เพื่อรวมวันที่ backfill ซึ่งไม่มีเวลา)
  - วันที่มี work detail แต่ไม่มีเวลา แสดงเป็นจุดสีในปฏิทิน (legend: "Work, no hours"); วันที่มี leave แสดงจุดมุม (legend: "Leave")
  - กดวันในอดีต/วันนี้ → หน้าวัน: การ์ด Leave + กรอก work detail เอง (ถ้ายังไม่มีสรุป)
- **วันทำงานในสัปดาห์ตั้งได้** (2026-11-18): `workdays` ใน settings (0=Sun … 6=Sat, ค่าเริ่มต้น จันทร์–ศุกร์)
  วันที่ไม่ใช่วันทำงานโทนลายแรเงาในปฏิทิน (legend: "Day off"); ถ้าวันนั้นมีชั่วโมงทำงานจริงยังแสดง heat ตามปกติ
- prompt สรุปงานกำหนดรูปแบบ `## <repo>` + bullet `- ` (สรุปที่ทำไปก่อนหน้านี้รูปแบบหัวข้อยังไม่เหมือนกันทุกวัน
  หน้าเว็บจึงหยิบ bullet แรกมาทำ preview)
- เจ้าของชอบแนวดีไซน์ glass + gradient + ปุ่มกลมใหญ่ และอยากให้สวยระดับ "ว้าว"

### Stack (2026-11-18, Claude เลือกตามที่เจ้าของให้แนะนำ)

เครื่องนี้มี Node 24 และ git อยู่แล้ว แต่ไม่มี Python → ใช้ Node เพื่อไม่ต้องติดตั้งเพิ่ม (Claude Code CLI ก็ติดตั้งผ่าน npm ได้)

- **Runtime:** Node.js 24 + TypeScript (รันตอน dev ด้วย `tsx`)
- **Web server:** Hono + `@hono/node-server`, render HTML ฝั่ง server ด้วย Hono JSX
- **UI:** HTML ฝั่ง server + htmx สำหรับปุ่มต่าง ๆ (ไม่ใช้ SPA/React เพราะมีไม่กี่หน้า)
- **Database:** SQLite ผ่าน `node:sqlite` ที่มากับ Node (ไม่ต้อง build native module บน Windows)
- **xlsx:** `exceljs` (อ่านต้นแบบและเขียนผลโดยรักษา format เดิม)
- **วันหยุดไทย:** `date-holidays` (public holidays, timezone `Asia/Bangkok`)
- **git / agent:** เรียก `git` และ CLI ของ agent (`claude` หรือ `agent`) ผ่าน `child_process.spawn` (บน Windows ผ่าน shell)
- **Gen timesheet:** โค้ดอ่านโครงสร้างต้นแบบ (sheet, header, ตำแหน่งเซลล์) → ส่งให้ agent พร้อม work detail ทั้งเดือน
  → agent ตอบเป็น JSON ว่าจะกรอกอะไรลงเซลล์ไหน → โค้ดเขียนลงสำเนาของต้นแบบด้วย exceljs
  (agent ไม่แก้ไฟล์ xlsx เอง เพื่อให้ format ไม่พัง)

## คำสั่ง

- `npm run dev`: รัน dev server (restart เองเมื่อแก้โค้ด) ที่ http://127.0.0.1:3000
- `npm start`: รันปกติ
- `npm run typecheck`: ตรวจ TypeScript (TypeScript 7)
- `npm run backfill -- [--dry-run] [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--force]`: สรุป work detail ย้อนหลังทีละวัน
  [--use-saved] (`scripts/backfill.ts`; `--use-saved` = ใช้ข้อมูล git ที่เก็บไว้; ค่าเริ่มต้น = วันแรกของเดือนที่แล้ว ถึง เมื่อวาน; ข้ามวันที่สรุปแล้วและวันที่ไม่มีงาน;
  หยุดเองถ้า agent ติดโควตา / login; ไม่ใส่เวลาเข้า-เลิกงาน) ใช้ `summarizeDay()` ใน `summary.ts` ซึ่งรอจนเสร็จ
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
- `agent.ts`: adapter เรียก Claude Code หรือ Cursor Agent ตาม settings ส่ง prompt ทาง stdin
- `summary.ts`: สรุป work detail รายวันแบบ background
- `timesheet.ts`: อ่านโครงสร้างต้นแบบ, ให้ agent ตอบ JSON, เขียนลง xlsx
- `time.ts`: ฟังก์ชันวันที่/เวลา (เวลาท้องถิ่น เก็บเป็นข้อความ `YYYY-MM-DD HH:MM:SS`)
- `holidays.ts`: รายการวันหยุดราชการไทยต่อเดือน / ชื่อวันหยุดของวันที่ (สำหรับ Apply และ prefill note)

พฤติกรรมที่ควรรู้:

- งานสรุป / gen ทำ background ในโปรเซส; ถ้า server ปิดกลางคัน ตอนเปิดใหม่สถานะ `running` จะถูกเปลี่ยนเป็น `error` ให้กดใหม่ได้
- ไฟล์ต้นแบบที่ใช้ = ตัวที่อัปโหลดล่าสุด
- ตอน gen timesheet ไม่เขียนทับเซลล์ที่มีสูตร และแถวที่เกินต้นแบบจะยืม style จากแถวสุดท้ายของต้นแบบ
- `npm audit` แจ้ง `uuid` (มากับ exceljs) ระดับ moderate: ไม่กระทบการใช้งานนี้ ยังไม่แก้

## สถานะ

- 2026-11-18: เริ่มโปรเจกต์, `git init` แล้ว (branch `master`), ตอบคำถามออกแบบครบ เลือก stack แล้ว
- 2026-11-18: เขียนเวอร์ชันแรกครบทุกฟีเจอร์ ทดสอบด้วย repo ทดสอบ + agent จำลองผ่านแล้ว
  (เข้า-เลิกงาน, เก็บ git แบบ multi/single, สรุป, แก้ย้อนหลัง, อัปโหลดต้นแบบ, gen + ดาวน์โหลด timesheet, กรณี agent error)
  **ยังไม่ได้ทดสอบกับ Claude Code CLI จริง**
- 2026-11-18: ติดตั้ง CLI และเจ้าของ login บัญชี Pro แล้ว **ทดสอบกับของจริงผ่าน**:
  `claude -p` ตอบได้ และสรุป work detail ของวันจาก repo จริง 5 repo ใช้เวลาประมาณ 26 วินาที ผลอ่านรู้เรื่อง แบ่งตาม repo
  และติดป้าย "(กำลังทำ)" ให้งานที่ยังไม่ commit
  - ยังไม่ได้ทดสอบ gen timesheet กับ agent จริง (ยังไม่มีไฟล์ต้นแบบของเจ้าของ)
- 2026-11-18: เพิ่ม script backfill เพื่อให้เจ้าของลอง gen timesheet ของเดือนตุลาคม
  dry-run ช่วง 2026-10-01 → 2026-11-17: มีงาน 20 วัน (ตุลาคม 12 วัน), ไม่มีงาน 28 วัน
  - รันจริงแล้วกับข้อมูลจริง: สรุปสำเร็จ 20/20 วัน ล้มเหลว 0, ใช้เวลา 5.1 นาที (วันละ 9–17 วินาที)
  - ตามที่เจ้าของสั่ง ใส่เวลาให้วันที่มีงานทั้ง 20 วัน (2026-10-07 → 2026-11-17) เป็น 08:00–18:00 ผ่าน route `/days/:date/times`
    และแก้เวลาเข้างานของ 2026-11-18 เป็น 08:00 (ยังไม่เลิกงาน); work detail ไม่ถูกแตะ
  - เจ้าของเปลี่ยนภาษาเป็น English แล้วสั่งสรุปใหม่: รัน `--force --use-saved` ช่วง 2026-10-01 → 2026-11-18
    สำเร็จ 21/21 วัน ใช้เวลา 3.4 นาที ทุกวันเป็นภาษาอังกฤษและใช้รูปแบบ `## <repo>` + bullet แล้ว เวลาเข้า-เลิกงานยังอยู่ครบ
  - ขั้นต่อไปคือเจ้าของลอง gen timesheet เดือน 2026-10 ด้วยไฟล์ต้นแบบของตัวเอง
- 2026-11-18: `agent.ts` บน Windows ส่งคำสั่งเป็นบรรทัดเดียวผ่าน shell (ไม่ส่ง args แยก) เพื่อไม่ให้ Node เตือน DEP0190
- 2026-11-18: เพิ่มสลับ agent ใน Settings ระหว่าง Claude Code CLI กับ Cursor Agent CLI
  (ค่าเริ่มต้นยังเป็น Claude; ยังไม่ได้ทดสอบ Cursor Agent CLI จริงเพราะยังไม่ได้ติดตั้ง `agent`)
- 2026-11-18: เพิ่มตั้งค่า workdays (ค่าเริ่มต้น จันทร์–ศุกร์) และโทน "Day off" ในปฏิทินหน้าแรก
- 2026-11-18: วันลา + วันหยุดราชการไทย (Apply จากปฏิทิน), ส่ง leave แยกใน work log ตอน gen timesheet

## งานที่จดไว้ทำทีหลัง (Backlog)

- **ปุ่ม re-scan / สรุปใหม่ทั้งช่วง (เจ้าของขอ 2026-11-18, ยังไม่ต้องทำ):** ปุ่มบนหน้าเว็บสำหรับสรุป work detail ใหม่หลายวันพร้อมกัน
  เช่นหลังเปลี่ยนภาษาในหน้าตั้งค่า หรือเปลี่ยน repo ที่ scan
  - ตอนนี้ทำได้แค่จาก terminal: `npm run backfill -- --from … --to … --force --use-saved` (ใช้ข้อมูล git เดิม)
    หรือไม่ใส่ `--use-saved` ถ้าต้องการ scan git ใหม่
  - ข้อควรคิดตอนทำ: ต้องสรุปทีละวันตามลำดับ (ห้ามยิง `claude` พร้อมกันหลายวัน), แสดงความคืบหน้า, หยุดเมื่อติดโควตา,
    เลือกได้ว่าใช้ข้อมูล git เดิมหรือ scan ใหม่, และอาจแนะนำตอนกดบันทึกหลังเปลี่ยนภาษา

## แนวทางการทำงาน

- `.gitignore` ไม่เอา `data/` และไฟล์ SQLite ขึ้น git (เป็นข้อมูลจริงของเจ้าของ)
- ทดสอบโดยไม่แตะข้อมูลจริง: รันด้วย `WORKINGLAB_DATA=<โฟลเดอร์ชั่วคราว>` และ `PORT` อื่น