// Adapter เรียก agent: เลือก Claude Code CLI หรือ Cursor Agent CLI ตาม settings
// ถ้าวันหน้าเปลี่ยนไปใช้ API ให้แก้เฉพาะไฟล์นี้
import { spawn } from 'node:child_process';
import { defaultAgentCommand, type AgentProvider, type Settings } from './db';

const DEFAULT_TIMEOUT_MS = 5 * 60_000;

function killTree(pid: number | undefined): void {
  if (!pid) return;
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true });
  else process.kill(pid, 'SIGTERM');
}

/** flags สำหรับโหมด print/headless ของแต่ละ CLI */
function printArgs(provider: AgentProvider): string[] {
  if (provider === 'cursor') {
    // ask = ตอบข้อความอย่างเดียว ไม่แก้ไฟล์; trust = ไม่ถาม workspace ใน headless
    return ['-p', '--mode=ask', '--trust', '--output-format', 'json'];
  }
  return ['-p', '--output-format', 'json'];
}

/**
 * ส่ง prompt ให้ agent ทาง stdin แล้วคืนข้อความคำตอบ
 * (ส่งทาง stdin เพราะ prompt ยาวเกินขีดจำกัดความยาว command line ของ Windows ได้)
 */
export function runAgent(
  prompt: string,
  settings: Pick<Settings, 'agentProvider'>,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<string> {
  const command = defaultAgentCommand(settings.agentProvider);
  const args = printArgs(settings.agentProvider);
  const isWin = process.platform === 'win32';
  // บน Windows ต้องผ่าน shell เพื่อให้เรียก .cmd/.exe จาก PATH ได้; argument เป็นค่าคงที่ ไม่มีข้อมูลจากผู้ใช้
  // ผ่าน shell แล้วส่งเป็นบรรทัดคำสั่งเดียว (ไม่ส่ง args แยก) เพื่อไม่ให้ Node เตือน DEP0190
  const quoted = /\s/.test(command) ? `"${command}"` : command;

  return new Promise((resolve, reject) => {
    const opts = { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] as ('pipe')[] };
    const child = isWin ? spawn(`${quoted} ${args.join(' ')}`, { ...opts, shell: true }) : spawn(command, args, opts);

    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (d: string) => (stdout += d));
    child.stderr.setEncoding('utf8').on('data', (d: string) => (stderr += d));

    const timer = setTimeout(() => {
      killTree(child.pid);
      reject(new Error(`The agent didn't respond within ${timeoutMs / 1000} seconds`));
    }, timeoutMs);

    child.on('error', (e) => {
      clearTimeout(timer);
      reject(new Error(`Couldn't run "${command}": ${e.message}`));
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      let parsed: { result?: unknown; is_error?: boolean; subtype?: string };
      try {
        parsed = JSON.parse(stdout);
      } catch {
        const detail = (stderr || stdout).trim().slice(-800) || '(no output)';
        reject(new Error(`The agent exited with code ${code}: ${detail}`));
        return;
      }
      if (parsed.is_error || parsed.subtype !== 'success') {
        reject(new Error(`The agent returned an error: ${String(parsed.result ?? parsed.subtype).slice(0, 800)}`));
        return;
      }
      resolve(String(parsed.result ?? ''));
    });

    child.stdin.on('error', () => {}); // กันกรณี process ปิดก่อนอ่าน stdin จบ (error จะมาทาง close แทน)
    child.stdin.end(prompt, 'utf8');
  });
}
