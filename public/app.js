// Live clock, elapsed counter, progress ring (8h target), day timeline and theme switch
(() => {
  const pad = (n) => String(n).padStart(2, '0');
  const RING = 578.05; // circumference of the progress circle (r = 92)
  const TARGET_MS = 8 * 3600_000;

  function tick() {
    const now = new Date();
    const clock = document.getElementById('clock');
    if (clock) clock.innerHTML = `${pad(now.getHours())}:${pad(now.getMinutes())}<span class="sec">${pad(now.getSeconds())}</span>`;

    const work = document.querySelector('[data-checkin]');
    if (!work || !work.dataset.checkin) return;
    const start = new Date(work.dataset.checkin);
    const end = work.dataset.checkout ? new Date(work.dataset.checkout) : now;
    const ms = Math.max(0, end - start);
    const h = Math.floor(ms / 3600_000);
    const m = Math.floor((ms % 3600_000) / 60_000);
    const s = Math.floor((ms % 60_000) / 1000);
    document.querySelectorAll('[data-elapsed]').forEach((el) => (el.textContent = `${h}:${pad(m)}:${pad(s)}`));

    const ring = document.querySelector('.ring .progress');
    if (ring) ring.style.strokeDashoffset = String(RING * (1 - Math.min(1, ms / TARGET_MS)));

    const tl = document.querySelector('.timeline');
    if (tl) {
      const from = Number(tl.dataset.from);
      const to = Number(tl.dataset.to);
      const pct = (d) => Math.max(0, Math.min(100, ((d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600 - from) / (to - from)) * 100));
      const fill = tl.querySelector('.tl-fill');
      if (fill) {
        fill.style.left = `${pct(start)}%`;
        fill.style.width = `${Math.max(0.8, pct(end) - pct(start))}%`;
      }
      const marker = tl.querySelector('.tl-now');
      if (marker) marker.style.left = `${pct(now)}%`;
    }
  }

  tick();
  setInterval(tick, 1000);

  // ----- theme: light | dark | system (stored per browser) -----
  const root = document.documentElement;
  function applyTheme(theme) {
    if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
    else delete root.dataset.theme;
    document.querySelectorAll('[data-theme-set]').forEach((b) => {
      const on = b.dataset.themeSet === (theme || 'system');
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }
  let saved = 'system';
  try {
    saved = localStorage.getItem('theme') || 'system';
  } catch {}
  applyTheme(saved);
  document.querySelectorAll('[data-theme-set]').forEach((b) =>
    b.addEventListener('click', () => {
      const t = b.dataset.themeSet;
      try {
        localStorage.setItem('theme', t);
      } catch {}
      applyTheme(t);
    }),
  );
})();

// ----- repo picker: All / None buttons and live "x of y" counter -----
(() => {
  const picker = document.querySelector('.repo-picker');
  if (!picker) return;
  const boxes = () => [...picker.querySelectorAll('input[name="includeRepo"]')];
  const count = picker.querySelector('[data-picker-count]');
  const update = () => {
    if (count) count.textContent = `${boxes().filter((b) => b.checked).length} of ${boxes().length}`;
  };
  picker.querySelectorAll('[data-check-all]').forEach((btn) =>
    btn.addEventListener('click', () => {
      boxes().forEach((b) => (b.checked = btn.dataset.checkAll === '1'));
      update();
    }),
  );
  picker.addEventListener('change', update);
})();
