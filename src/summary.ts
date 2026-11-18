// สรุป work detail รายวัน: เก็บ git ด้วยโค้ด แล้วให้ agent สรุปเป็นภาษาคน
import { runAgent } from './agent';
import { failSummary, finishSummary, getDay, getSettings, markSummaryRunning, saveGitData } from './db';
import { collectDay, formatGitData, hasWork, type GitDayData } from './git';

const running = new Set<string>();

function buildPrompt(date: string, data: GitDayData, language: string): string {
  return `You are writing the daily "work detail" for a software developer's timesheet.

Date: ${date}
Write in: ${language}

Below is everything the developer changed in git on that day: their commits (from all branches) and work not yet committed.
Summarize WHAT was done (features, fixes, refactors, investigations), grouped by repo/project.
- Use short bullet points, one task per bullet, written so a manager can understand.
- Merge related commits into one task; don't list file names unless they explain the task.
- Treat uncommitted work as work in progress.
- Do not invent work that isn't supported by the data.
- Output only the summary (no preamble, no closing remarks, no code fences).

${formatGitData(data)}`;
}

async function run(date: string, recollect: boolean): Promise<void> {
  try {
    const settings = getSettings();
    const day = getDay(date);
    let data: GitDayData;
    if (recollect || !day?.git_data) {
      data = await collectDay(date, settings);
      saveGitData(date, JSON.stringify(data));
    } else {
      data = JSON.parse(day.git_data) as GitDayData;
    }

    if (!hasWork(data)) {
      const why = data.warnings.length ? ` (${data.warnings.join('; ')})` : '';
      finishSummary(date, `No git changes found for this day.${why}`);
      return;
    }

    const result = await runAgent(buildPrompt(date, data, settings.language), settings.claudeCommand);
    finishSummary(date, result.trim());
  } catch (e) {
    failSummary(date, e instanceof Error ? e.message : String(e));
  }
}

/**
 * เริ่มสรุปงานของวันนั้นแบบ background (agent อาจใช้เวลาเป็นนาที)
 * recollect = เก็บข้อมูล git ใหม่ ไม่ใช้ข้อมูลที่เก็บไว้ตอนเลิกงาน
 * คืน false ถ้าวันนั้นกำลังสรุปอยู่แล้ว
 */
export function startSummary(date: string, recollect: boolean): boolean {
  if (running.has(date)) return false;
  running.add(date);
  markSummaryRunning(date);
  void run(date, recollect).finally(() => running.delete(date));
  return true;
}
