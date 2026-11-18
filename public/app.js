// นาฬิกาสด + เวลาทำงานที่นับขึ้นเรื่อย ๆ + วงแหวนความคืบหน้า (เป้า 8 ชม.)
(() => {
  const pad = (n) => String(n).padStart(2, '0');
  const RING = 628.32; // เส้นรอบวงของวงกลม r=100
  const TARGET_MS = 8 * 3600_000;

  function tick() {
    const now = new Date();
    const clock = document.getElementById('clock');
    if (clock) clock.innerHTML = `${pad(now.getHours())}:${pad(now.getMinutes())}<span>:${pad(now.getSeconds())}</span>`;

    const work = document.querySelector('[data-checkin]');
    if (!work) return;
    const start = new Date(work.dataset.checkin);
    const end = work.dataset.checkout ? new Date(work.dataset.checkout) : now;
    const ms = Math.max(0, end - start);
    const h = Math.floor(ms / 3600_000);
    const m = Math.floor((ms % 3600_000) / 60_000);
    const s = Math.floor((ms % 60_000) / 1000);
    document.querySelectorAll('[data-elapsed]').forEach((el) => (el.textContent = `${h}:${pad(m)}:${pad(s)}`));
    const ring = document.querySelector('.ring .progress');
    if (ring) ring.style.strokeDashoffset = String(RING * (1 - Math.min(1, ms / TARGET_MS)));
  }

  tick();
  setInterval(tick, 1000);
})();
