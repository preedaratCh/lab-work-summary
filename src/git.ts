// เก็บ "วันนี้ฉันแก้อะไรไปบ้าง" จาก git ด้วยโค้ดล้วน (ไม่ใช้ agent)
// ต่อ repo: commit ของเจ้าของในวันนั้นจากทุก branch + งานที่ยังไม่ commit ซึ่งแก้ในวันนั้น
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type { Settings } from './db';
import { localDate, localDateTime } from './time';

const execFileP = promisify(execFile);

const MAX_COMMIT_DIFF = 6_000;
const MAX_UNCOMMITTED_DIFF = 12_000;
const MAX_UNTRACKED_FILE = 2_000;
const MAX_UNTRACKED_SIZE = 100_000;
const MAX_DIFF_FILES = 200;

/** ไฟล์ที่ diff ไม่ช่วยให้รู้ว่าทำงานอะไร: แสดงแค่ชื่อไฟล์ ไม่ส่งเนื้อหา */
const NOISE_GLOBS = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', '*.min.js', '*.min.css', '*.map', 'dist/**', 'build/**'];
const NOISE_PATHSPECS = NOISE_GLOBS.map((g) => `:(exclude,glob)**/${g}`);
const NOISE_RE = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb|[^/]+\.min\.(js|css)|[^/]+\.map)$|(^|\/)(dist|build)\//;

export interface CommitInfo {
  hash: string;
  author: string;
  email: string;
  date: string; // เวลาท้องถิ่น
  subject: string;
  body: string;
  stat: string;
  diff: string;
}

export interface UncommittedFile {
  path: string;
  status: string; // รหัสจาก git status --porcelain เช่น " M", "A ", "??"
  modifiedAt: string | null;
}

export interface RepoWork {
  repo: string;
  name: string;
  emails: string[];
  commits: CommitInfo[];
  uncommitted: { files: UncommittedFile[]; diff: string };
  error?: string;
}

export interface GitDayData {
  date: string;
  collectedAt: string;
  target: string;
  targetType: Settings['targetType'];
  repos: RepoWork[];
  warnings: string[];
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileP('git', ['-c', 'core.quotepath=false', '--no-pager', ...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  return stdout;
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}\n… (ตัดเหลือ ${max} จาก ${s.length} ตัวอักษร)` : s;
}

async function repoRoot(dir: string): Promise<string | null> {
  try {
    return path.resolve((await git(dir, ['rev-parse', '--show-toplevel'])).trim());
  } catch {
    return null;
  }
}

/** หา repo ตามการตั้งค่า: single = folder นั้นคือ repo, multi = folder ย่อยชั้นแรกที่เป็น repo */
export async function discoverRepos(settings: Settings): Promise<string[]> {
  const target = settings.targetPath.trim();
  if (!target) throw new Error('ยังไม่ได้ตั้งค่า folder target (ไปที่หน้าตั้งค่า)');
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) throw new Error(`ไม่พบ folder: ${target}`);

  if (settings.targetType === 'single') {
    const root = await repoRoot(target);
    if (!root) throw new Error(`${target} ไม่ใช่ git repo (ถ้ามีหลาย repo อยู่ข้างใน ให้ตั้ง type เป็น multi)`);
    return [root];
  }

  return fs
    .readdirSync(target, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => path.join(target, e.name))
    .filter((dir) => fs.existsSync(path.join(dir, '.git')))
    .sort((a, b) => a.localeCompare(b));
}

async function ownerEmails(repo: string, settings: Settings): Promise<string[]> {
  if (settings.authorEmails.length) return settings.authorEmails.map((e) => e.toLowerCase());
  try {
    const email = (await git(repo, ['config', 'user.email'])).trim().toLowerCase();
    return email ? [email] : [];
  } catch {
    return [];
  }
}

async function collectCommits(repo: string, date: string, emails: string[]): Promise<CommitInfo[]> {
  // --since กรองด้วย committer date (ซึ่ง >= author date เสมอ) แล้วค่อยกรอง author date ให้ตรงวันอีกที
  const out = await git(repo, [
    'log',
    '--exclude=refs/stash',
    '--all',
    '--no-merges',
    `--since=${date} 00:00:00`,
    '--date=format-local:%Y-%m-%d %H:%M:%S',
    '--format=%H%x1f%an%x1f%ae%x1f%ad%x1f%s%x1f%b%x1e',
  ]);

  const commits: CommitInfo[] = [];
  for (const record of out.split('\x1e')) {
    const r = record.replace(/^\s+/, '');
    if (!r) continue;
    const [hash, author, email, adate, subject, body = ''] = r.split('\x1f');
    if (!adate?.startsWith(date)) continue;
    if (emails.length && !emails.includes(email.toLowerCase())) continue;

    const stat = await git(repo, ['show', '--format=', '--stat=160', hash]);
    const diff = await git(repo, ['show', '--format=', '--patch', '--no-color', '--no-ext-diff', hash, '--', '.', ...NOISE_PATHSPECS]);
    commits.push({
      hash,
      author,
      email,
      date: adate,
      subject,
      body: body.trim(),
      stat: stat.trim(),
      diff: truncate(diff.trim(), MAX_COMMIT_DIFF),
    });
  }
  return commits.sort((a, b) => a.date.localeCompare(b.date));
}

function mtimeOf(full: string): Date | null {
  try {
    return fs.statSync(full).mtime;
  } catch {
    // ไฟล์ถูกลบ: ใช้เวลาแก้ไขของ folder ที่เคยมีไฟล์นั้นแทน (การลบไฟล์ทำให้ mtime ของ folder เปลี่ยน)
    try {
      return fs.statSync(path.dirname(full)).mtime;
    } catch {
      return null;
    }
  }
}

function readTextPreview(full: string): string | null {
  try {
    const st = fs.statSync(full);
    if (st.size > MAX_UNTRACKED_SIZE) return null;
    const buf = fs.readFileSync(full);
    if (buf.subarray(0, 8000).includes(0)) return null; // binary
    return truncate(buf.toString('utf8'), MAX_UNTRACKED_FILE);
  } catch {
    return null;
  }
}

async function collectUncommitted(repo: string, date: string): Promise<RepoWork['uncommitted']> {
  const out = await git(repo, ['status', '--porcelain=v1', '-z', '-uall']);
  const parts = out.split('\0');
  const all: { path: string; status: string }[] = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (!p) continue;
    const status = p.slice(0, 2);
    all.push({ status, path: p.slice(3) });
    if (status[0] === 'R' || status[0] === 'C') i++; // ข้ามชื่อไฟล์เดิมของ rename/copy
  }

  // นับเฉพาะไฟล์ที่แก้ในวันนั้น ไม่ให้งานค้างหลายวันถูกนับซ้ำทุกวัน
  const files: UncommittedFile[] = [];
  for (const f of all) {
    const mtime = mtimeOf(path.join(repo, f.path));
    if (mtime && localDate(mtime) === date) files.push({ ...f, modifiedAt: localDateTime(mtime) });
  }

  const tracked = files.filter((f) => f.status !== '??' && !NOISE_RE.test(f.path)).slice(0, MAX_DIFF_FILES);
  const untracked = files.filter((f) => f.status === '??' && !NOISE_RE.test(f.path)).slice(0, MAX_DIFF_FILES);

  let diff = '';
  if (tracked.length) {
    const hasHead = await git(repo, ['rev-parse', '--verify', '--quiet', 'HEAD']).then(
      () => true,
      () => false,
    );
    diff += await git(repo, ['diff', hasHead ? 'HEAD' : '--cached', '--no-color', '--no-ext-diff', '--', ...tracked.map((f) => f.path)]);
  }
  for (const f of untracked) {
    const preview = readTextPreview(path.join(repo, f.path));
    diff += `\n--- ไฟล์ใหม่ (ยังไม่ add): ${f.path}\n${preview ?? '(ไฟล์ใหญ่หรือ binary: ไม่แสดงเนื้อหา)'}\n`;
  }

  return { files, diff: truncate(diff.trim(), MAX_UNCOMMITTED_DIFF) };
}

export async function collectDay(date: string, settings: Settings): Promise<GitDayData> {
  const repos = await discoverRepos(settings);
  const data: GitDayData = {
    date,
    collectedAt: localDateTime(),
    target: settings.targetPath,
    targetType: settings.targetType,
    repos: [],
    warnings: [],
  };
  if (!repos.length) data.warnings.push(`ไม่พบ git repo ใน ${settings.targetPath}`);

  for (const repo of repos) {
    const name = path.basename(repo);
    const work: RepoWork = { repo, name, emails: [], commits: [], uncommitted: { files: [], diff: '' } };
    try {
      work.emails = await ownerEmails(repo, settings);
      if (!work.emails.length) data.warnings.push(`${name}: ไม่รู้อีเมลของเจ้าของ จึงนับ commit ของทุกคน (ตั้งอีเมลได้ในหน้าตั้งค่า)`);
      work.commits = await collectCommits(repo, date, work.emails);
      work.uncommitted = await collectUncommitted(repo, date);
    } catch (e) {
      work.error = e instanceof Error ? e.message : String(e);
    }
    data.repos.push(work);
  }
  return data;
}

export function hasWork(data: GitDayData): boolean {
  return data.repos.some((r) => r.commits.length || r.uncommitted.files.length);
}

/** แปลงข้อมูล git เป็นข้อความสำหรับส่งให้ agent */
export function formatGitData(data: GitDayData, maxChars = 80_000): string {
  const out: string[] = [];
  for (const r of data.repos) {
    if (!r.commits.length && !r.uncommitted.files.length && !r.error) continue;
    out.push(`# Repo: ${r.name}`);
    if (r.error) out.push(`(เก็บข้อมูลไม่สำเร็จ: ${r.error})`);
    if (r.commits.length) {
      out.push(`## Commits (${r.commits.length})`);
      for (const c of r.commits) {
        out.push(`### ${c.date.slice(11, 16)} ${c.hash.slice(0, 8)} ${c.subject}`);
        if (c.body) out.push(c.body);
        out.push('Files:', c.stat, 'Diff:', c.diff || '(ไม่มี diff ที่เป็นข้อความ)');
      }
    }
    if (r.uncommitted.files.length) {
      out.push(`## งานที่ยังไม่ commit (${r.uncommitted.files.length} ไฟล์)`);
      out.push(...r.uncommitted.files.map((f) => `${f.status} ${f.path} (แก้ล่าสุด ${f.modifiedAt?.slice(11, 16) ?? '?'})`));
      if (r.uncommitted.diff) out.push('Diff:', r.uncommitted.diff);
    }
    out.push('');
  }
  return truncate(out.join('\n'), maxChars);
}
