(() => {
  'use strict';

  const PRESETS = [
    { min: 1, inc: 0, name: 'Bullet' },
    { min: 3, inc: 0, name: 'Blitz' },
    { min: 3, inc: 2, name: 'Blitz' },
    { min: 5, inc: 0, name: 'Blitz' },
    { min: 5, inc: 3, name: 'Blitz' },
    { min: 10, inc: 0, name: 'Rapid' },
    { min: 10, inc: 5, name: 'Rapid' },
    { min: 15, inc: 10, name: 'Rapid' },
    { min: 30, inc: 0, name: 'Classical' },
  ];

  const LOW_TIME_MS = 10_000;
  const STORE_KEY = 'chess-clock:settings';

  const $ = (id) => document.getElementById(id);
  const el = {
    clock: $('clock'),
    side: [$('side0'), $('side1')],
    time: [$('time0'), $('time1')],
    moves: [$('moves0'), $('moves1')],
    pause: $('btnPause'),
    reset: $('btnReset'),
    settingsBtn: $('btnSettings'),
    label: $('tcLabel'),
    dialog: $('settings'),
    form: $('settingsForm'),
    presets: $('presets'),
    minutes: $('inMinutes'),
    increment: $('inIncrement'),
    sound: $('inSound'),
    vibrate: $('inVibrate'),
  };

  // ---------- settings ----------
  const settings = loadSettings();

  function loadSettings() {
    const fallback = { min: 5, inc: 0, sound: true, vibrate: true };
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
    } catch {
      return fallback;
    }
  }

  function saveSettings() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
  }

  // ---------- state ----------
  // active: index of the player whose clock is running (null before the first tap)
  const state = {
    remaining: [0, 0],
    moves: [0, 0],
    active: null,
    paused: false,
    flagged: null,
    lastTick: 0,
  };

  function newGame() {
    const base = Math.round(settings.min * 60_000);
    state.remaining = [base, base];
    state.moves = [0, 0];
    state.active = null;
    state.paused = false;
    state.flagged = null;
    releaseWakeLock();
    render();
  }

  // ---------- timing ----------
  let rafId = 0;

  function loop(now) {
    if (state.active === null || state.paused || state.flagged !== null) { rafId = 0; return; }
    const dt = now - state.lastTick;
    state.lastTick = now;
    const p = state.active;
    state.remaining[p] -= dt;
    if (state.remaining[p] <= 0) {
      state.remaining[p] = 0;
      flag(p);
      return;
    }
    render();
    rafId = requestAnimationFrame(loop);
  }

  function startLoop() {
    state.lastTick = performance.now();
    if (!rafId) rafId = requestAnimationFrame(loop);
  }

  function stopLoop() {
    // Account for time spent since the last frame before stopping.
    if (state.active !== null && !state.paused && state.flagged === null) {
      const now = performance.now();
      state.remaining[state.active] = Math.max(0, state.remaining[state.active] - (now - state.lastTick));
      state.lastTick = now;
    }
    cancelAnimationFrame(rafId);
    rafId = 0;
  }

  // ---------- actions ----------
  function tapSide(player) {
    if (state.flagged !== null || state.paused) return;

    if (state.active === null) {
      // First press: the tapping player hands the move to their opponent.
      state.active = 1 - player;
      feedback();
      requestWakeLock();
      startLoop();
      render();
      return;
    }

    if (player !== state.active) return; // only the player on move can pass

    stopLoop();
    state.remaining[player] += settings.inc * 1000;
    state.moves[player] += 1;
    state.active = 1 - player;
    feedback();
    startLoop();
    render();
  }

  function togglePause() {
    if (state.active === null || state.flagged !== null) return;
    if (state.paused) {
      state.paused = false;
      requestWakeLock();
      startLoop();
    } else {
      stopLoop();
      state.paused = true;
      releaseWakeLock();
    }
    render();
  }

  function pauseIfRunning() {
    if (state.active !== null && !state.paused && state.flagged === null) togglePause();
  }

  function flag(player) {
    cancelAnimationFrame(rafId);
    rafId = 0;
    state.flagged = player;
    releaseWakeLock();
    if (settings.vibrate && navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 400]);
    if (settings.sound) beep(220, 0.5);
    render();
  }

  // ---------- rendering ----------
  function format(ms) {
    if (ms >= 3_600_000) {
      const s = Math.ceil(ms / 1000);
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      return `${h}:${pad(m)}:${pad(s % 60)}`;
    }
    if (ms >= 20_000) {
      const s = Math.ceil(ms / 1000);
      return `${Math.floor(s / 60)}:${pad(s % 60)}`;
    }
    // Under 20 s: show tenths. Floor so it never shows time that isn't there.
    const t = Math.floor(ms / 100);
    const s = Math.floor(t / 10);
    return `${Math.floor(s / 60)}:${pad(s % 60)}.${t % 10}`;
  }

  const pad = (n) => String(n).padStart(2, '0');

  const shown = ['', ''];
  function render() {
    for (let p = 0; p < 2; p++) {
      const txt = format(state.remaining[p]);
      if (shown[p] !== txt) { el.time[p].textContent = txt; shown[p] = txt; }
      el.moves[p].textContent = state.moves[p];
      const side = el.side[p];
      side.classList.toggle('is-active', state.active === p);
      side.classList.toggle('is-low', state.remaining[p] < LOW_TIME_MS);
      side.classList.toggle('is-flagged', state.flagged === p);
    }
    el.clock.classList.toggle('is-idle', state.active === null);
    el.clock.classList.toggle('is-paused', state.paused);
    el.clock.classList.toggle('is-over', state.flagged !== null);
    el.pause.setAttribute('aria-label', state.paused ? 'Resume' : 'Pause');
    el.label.textContent = `${trimNum(settings.min)} + ${settings.inc}`;
  }

  const trimNum = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

  // ---------- feedback ----------
  let audioCtx = null;
  function beep(freq = 880, dur = 0.04) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.value = freq;
      osc.type = 'square';
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + dur);
    } catch { /* audio unavailable */ }
  }

  function feedback() {
    if (settings.vibrate && navigator.vibrate) navigator.vibrate(25);
    if (settings.sound) beep();
  }

  // ---------- screen wake lock ----------
  let wakeLock = null;
  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator && !wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      }
    } catch { /* not allowed right now */ }
  }
  function releaseWakeLock() {
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  }

  // ---------- settings dialog ----------
  function buildPresets() {
    el.presets.innerHTML = '';
    for (const p of PRESETS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'preset';
      b.dataset.min = p.min;
      b.dataset.inc = p.inc;
      b.innerHTML = `${p.min} + ${p.inc}<small>${p.name}</small>`;
      b.addEventListener('click', () => {
        el.minutes.value = p.min;
        el.increment.value = p.inc;
        markPreset();
      });
      el.presets.appendChild(b);
    }
  }

  function markPreset() {
    for (const b of el.presets.children) {
      b.classList.toggle('is-selected',
        Number(b.dataset.min) === Number(el.minutes.value) &&
        Number(b.dataset.inc) === Number(el.increment.value));
    }
  }

  function openSettings() {
    pauseIfRunning();
    el.minutes.value = settings.min;
    el.increment.value = settings.inc;
    el.sound.checked = settings.sound;
    el.vibrate.checked = settings.vibrate;
    markPreset();
    el.dialog.showModal();
  }

  el.minutes.addEventListener('input', markPreset);
  el.increment.addEventListener('input', markPreset);

  el.dialog.addEventListener('close', () => {
    if (el.dialog.returnValue !== 'apply') return;
    const min = Math.max(0, Math.min(600, Number(el.minutes.value) || 0));
    const inc = Math.max(0, Math.min(300, Math.round(Number(el.increment.value) || 0)));
    settings.min = min > 0 ? min : 5;
    settings.inc = inc;
    settings.sound = el.sound.checked;
    settings.vibrate = el.vibrate.checked;
    saveSettings();
    newGame();
  });

  // ---------- input ----------
  // pointerdown rather than click: fires on touch contact, no delay.
  for (const side of el.side) {
    side.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      tapSide(Number(side.dataset.player));
    });
    side.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  el.pause.addEventListener('click', togglePause);
  el.settingsBtn.addEventListener('click', openSettings);
  el.reset.addEventListener('click', () => {
    if (state.active === null && state.flagged === null) { newGame(); return; }
    pauseIfRunning();
    if (confirm('Reset the clock?')) newGame();
  });

  // Keyboard: left/right shift or space for desktop testing.
  document.addEventListener('keydown', (e) => {
    if (el.dialog.open) return;
    if (e.code === 'ShiftLeft' || e.code === 'KeyA') tapSide(0);
    else if (e.code === 'ShiftRight' || e.code === 'KeyL') tapSide(1);
    else if (e.code === 'Space') { e.preventDefault(); togglePause(); }
  });

  // Re-acquire the wake lock when returning to the app; the browser drops it on hide.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.active !== null && !state.paused && state.flagged === null) {
      requestWakeLock();
    }
  });

  // ---------- install ----------
  const installBtn = $('btnInstall');
  const iosHelp = $('iosHelp');
  const isStandalone = window.matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches ||
    navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let deferredPrompt = null;

  // Chrome/Edge/Samsung: capture the native prompt and show our own button.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.hidden = false;
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installBtn.hidden = true;
  });

  // iOS never fires beforeinstallprompt; show instructions instead.
  if (isIOS && !isStandalone) installBtn.hidden = false;

  installBtn.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice.catch(() => {});
      deferredPrompt = null;
      installBtn.hidden = true;
    } else if (isIOS) {
      iosHelp.showModal();
    }
  });

  // ---------- boot ----------
  buildPresets();
  newGame();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
})();
