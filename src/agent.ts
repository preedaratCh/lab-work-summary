// Adapter เรียก agent: ตอนนี้ใช้ Claude Code CLI (`claude -p`) ซึ่งใช้โควตา Claude Pro
// ถ้าวันหน้าเปลี่ยนไปใช้ Claude API ให้แก้เฉพาะไฟล์นี้
import { spawn } from 'node:child_process';

const DEFAULT_TIMEOUT_MS = 5 * 60_000;

function killTree(pid: number | undefined): void {
  if (!pid) return;
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true });
  else process.kill(pid, 'SIGTERM');
}

/**
 * ส่ง prompt ให้ agent ทาง stdin แล้วคืนข้อความคำตอบ
 * (ส่งทาง stdin เพราะ prompt ยาวเกินขีดจำกัดความยาว command line ของ Windows ได้)
 */
export function runAgent(prompt: string, command: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string> {
  const isWin = process.platform === 'win32';
  // บน Windows ต้องผ่าน shell เพื่อให้เรียก claude.cmd (ติดตั้งผ่าน npm) ได้; argument เป็นค่าคงที่ ไม่มีข้อมูลจากผู้ใช้
  const cmd = isWin && /\s/.test(command) ? `"${command}"` : command;

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, ['-p', '--output-format', 'json'], {
      shell: isWin,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

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
