(() => {
  const $ = (id) => document.getElementById(id);
  const layerRows = [...document.querySelectorAll('.layer')];
  const presetButtons = [...document.querySelectorAll('.preset')];
  const timerButtons = [...document.querySelectorAll('[data-timer]')];
  const orb = $('orb');
  const playButton = $('play');
  const playLabel = $('play-label');
  const masterInput = $('master');
  const masterValue = $('master-value');
  const timerDisplay = $('timer-display');
  const timerNote = $('timer-note');
  const timerStatus = $('timer-status');
  const nowPlaying = $('now-playing');
  const mixState = $('mix-state');
  const customState = $('custom');
  const liveState = $('live-state');
  const liveLabel = $('live-label');

  const LAYER_ORDER = ['rain', 'wind', 'fire', 'waves', 'hum'];
  const LAYER_NAMES = { rain: 'дождь', wind: 'ветер', fire: 'огонь', waves: 'волны', hum: 'гул' };
  const PRESETS = {
    rain: { rain: 65, wind: 20, fire: 0, waves: 25, hum: 10 },
    fire: { rain: 0, wind: 20, fire: 70, waves: 0, hum: 15 },
    night: { rain: 30, wind: 35, fire: 0, waves: 15, hum: 25 }
  };
  const AUDIO_SCALE = { rain: 0.22, wind: 0.3, fire: 0.23, waves: 0.28, hum: 0.18 };

  const defaults = {
    volumes: { ...PRESETS.night },
    active: { rain: true, wind: true, fire: false, waves: true, hum: true },
    preset: 'night',
    master: 70
  };

  const readSaved = () => {
    try {
      const saved = JSON.parse(localStorage.getItem('tiho-mix') || 'null');
      if (!saved || !saved.volumes) return null;
      const volumes = {};
      const active = {};
      LAYER_ORDER.forEach((key) => {
        const value = Number(saved.volumes[key]);
        volumes[key] = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : defaults.volumes[key];
        active[key] = Boolean(saved.active?.[key]) && volumes[key] > 0;
      });
      const masterValue = Number(saved.master);
      return {
        volumes,
        active,
        preset: PRESETS[saved.preset] ? saved.preset : null,
        master: Number.isFinite(masterValue) ? Math.max(0, Math.min(100, masterValue)) : defaults.master
      };
    } catch {
      return null;
    }
  };

  const state = {
    ...(readSaved() || defaults),
    playing: false,
    timerTotal: 0,
    timerLeft: 0,
    timerInterval: null,
    timerResetTimer: null,
    timerEnding: false
  };

  function saveMix() {
    try {
      localStorage.setItem('tiho-mix', JSON.stringify({
        volumes: state.volumes,
        active: state.active,
        preset: state.preset,
        master: state.master
      }));
    } catch {
      /* локальное хранилище может быть недоступно */
    }
  }

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function formatTime(seconds) {
    const safe = Math.max(0, Math.ceil(seconds));
    return `${pad(Math.floor(safe / 60))}:${pad(safe % 60)}`;
  }

  function setRangeFill(input, value) {
    input.style.setProperty('--fill', `${value}%`);
  }

  function activeLayers() {
    return LAYER_ORDER.filter((key) => state.active[key] && state.volumes[key] > 0);
  }

  function updateLive() {
    document.body.classList.toggle('is-playing', state.playing);
    liveState.classList.toggle('is-on', state.playing);
    liveLabel.textContent = state.playing ? 'звучит' : 'тишина';
    mixState.textContent = state.playing ? 'звучит' : activeLayers().length ? 'пауза' : 'готово';
    mixState.classList.toggle('is-ready', state.playing);
    playLabel.textContent = state.playing ? 'ПАУЗА' : 'ВКЛЮЧИТЬ ЗВУК';
  }

  function renderNowPlaying() {
    const names = activeLayers().map((key) => LAYER_NAMES[key]);
    if (state.playing && names.length) {
      nowPlaying.innerHTML = `СЕЙЧАС ЗВУЧИТ: <strong>${names.join(' · ')}</strong>`;
    } else if (names.length) {
      nowPlaying.textContent = 'МИКС ГОТОВ · НАЖМИ ЗВУК';
    } else {
      nowPlaying.textContent = 'В КОМНАТЕ ТИХО';
    }
  }

  function renderMix() {
    layerRows.forEach((row) => {
      const key = row.dataset.layer;
      const value = state.volumes[key];
      const active = state.active[key] && value > 0;
      row.classList.toggle('is-active', active);
      row.querySelector('.layer-range').value = String(value);
      row.querySelector('.layer-range').style.setProperty('--fill', `${value}%`);
      row.querySelector('.layer-value').textContent = String(value);
      row.querySelector('.layer-toggle').setAttribute('aria-checked', String(active));
      orb.classList.toggle(`active-${key}`, active);
    });
    presetButtons.forEach((button) => {
      button.classList.toggle('is-active', button.dataset.preset === state.preset);
    });
    customState.classList.toggle('is-active', !state.preset);
    masterInput.value = String(state.master);
    masterInput.style.setProperty('--fill', `${state.master}%`);
    masterValue.textContent = String(state.master);
    renderNowPlaying();
    updateLive();
  }

  function renderTimer() {
    if (state.timerTotal <= 0) {
      timerDisplay.textContent = '∞';
      timerNote.textContent = 'без таймера';
      timerStatus.textContent = 'выключен';
    } else {
      timerDisplay.textContent = formatTime(state.timerLeft);
      timerNote.textContent = state.timerEnding ? 'затухание' : state.playing ? 'до тишины' : 'на паузе';
      timerStatus.textContent = state.timerEnding ? 'затухание' : state.playing ? `осталось ${formatTime(state.timerLeft)}` : 'на паузе';
    }
    timerButtons.forEach((button) => {
      const minutes = Number(button.dataset.timer);
      const current = state.timerTotal > 0 ? state.timerTotal / 60 : 0;
      button.classList.toggle('is-active', minutes === current);
      button.setAttribute('aria-pressed', String(minutes === current));
    });
  }

  function stopTimerInterval() {
    if (state.timerInterval) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
    }
  }

  function startTimerInterval() {
    stopTimerInterval();
    if (!state.playing || state.timerLeft <= 0) return;
    state.timerInterval = setInterval(() => {
      if (!state.playing || state.timerEnding) return;
      state.timerLeft = Math.max(0, state.timerLeft - 1);
      renderTimer();
      if (state.timerLeft <= 0) finishTimer();
    }, 1000);
  }

  function finishTimer() {
    if (state.timerEnding) return;
    stopTimerInterval();
    state.timerEnding = true;
    state.timerLeft = 0;
    renderTimer();
    audio.stop(6);
    updateLive();
    if (state.timerResetTimer) clearTimeout(state.timerResetTimer);
    state.timerResetTimer = setTimeout(() => {
      state.timerTotal = 0;
      state.timerLeft = 0;
      state.timerEnding = false;
      renderTimer();
    }, 6500);
  }

  function selectTimer(minutes) {
    if (state.timerResetTimer) clearTimeout(state.timerResetTimer);
    state.timerEnding = false;
    stopTimerInterval();
    if (minutes <= 0) {
      state.timerTotal = 0;
      state.timerLeft = 0;
      renderTimer();
      return;
    }
    state.timerTotal = minutes * 60;
    state.timerLeft = state.timerTotal;
    renderTimer();
    if (state.playing) startTimerInterval();
  }

  function setPreset(name) {
    const preset = PRESETS[name];
    if (!preset) return;
    LAYER_ORDER.forEach((key) => {
      state.volumes[key] = preset[key];
      state.active[key] = preset[key] > 0;
    });
    state.preset = name;
    renderMix();
    saveMix();
    audio.applyAll();
  }

  function markCustom() {
    state.preset = null;
    customState.classList.add('is-active');
    presetButtons.forEach((button) => button.classList.remove('is-active'));
  }

  function setLayer(key, active, volume = state.volumes[key]) {
    const safeVolume = Math.max(0, Math.min(100, volume));
    state.volumes[key] = safeVolume;
    state.active[key] = Boolean(active) && safeVolume > 0;
    markCustom();
    renderMix();
    saveMix();
    audio.setLayer(key);
  }

  function toggleLayer(key) {
    const isActive = state.active[key] && state.volumes[key] > 0;
    if (isActive) {
      setLayer(key, false, state.volumes[key]);
      return;
    }
    const volume = state.volumes[key] > 0 ? state.volumes[key] : 40;
    setLayer(key, true, volume);
  }

  function togglePlay() {
    if (state.playing) {
      audio.stop(0.85);
      updateLive();
      renderTimer();
    } else {
      audio.start();
    }
  }

  const audio = {
    ctx: null,
    master: null,
    layers: {},
    white: null,
    brown: null,
    suspendTimer: null,

    masterTarget() {
      return Math.pow(state.master / 100, 1.35) * 0.92;
    },

    createNoise(type) {
      const length = this.ctx.sampleRate * 4;
      const buffer = this.ctx.createBuffer(2, length, this.ctx.sampleRate);
      for (let channel = 0; channel < 2; channel += 1) {
        const data = buffer.getChannelData(channel);
        let last = 0;
        for (let i = 0; i < length; i += 1) {
          const white = Math.random() * 2 - 1;
          if (type === 'brown') {
            last = (last + 0.02 * white) / 1.02;
            data[i] = Math.max(-1, Math.min(1, last * 3.2));
          } else {
            data[i] = white * 0.55;
          }
        }
      }
      return buffer;
    },

    makeNoiseSource(buffer) {
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.start();
      return source;
    },

    makeCrackle(destination) {
      const now = this.ctx.currentTime;
      const source = this.ctx.createBufferSource();
      source.buffer = this.white;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 1100;
      const envelope = this.ctx.createGain();
      const volume = 0.16 + Math.random() * 0.25;
      envelope.gain.setValueAtTime(0.0001, now);
      envelope.gain.linearRampToValueAtTime(volume, now + 0.006);
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.045 + Math.random() * 0.08);
      source.connect(filter);
      filter.connect(envelope);
      envelope.connect(destination);
      source.start(now, Math.random() * 3.5, 0.16);
      source.stop(now + 0.16);
      source.addEventListener('ended', () => {
        source.disconnect();
        filter.disconnect();
        envelope.disconnect();
      });
    },

    buildLayer(key) {
      const layerGain = this.ctx.createGain();
      layerGain.gain.value = 0;
      layerGain.connect(this.master);
      const layer = { gain: layerGain, nodes: [], crackleTimer: null };

      if (key === 'hum') {
        const lowpass = this.ctx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.value = 260;
        lowpass.Q.value = 0.4;
        lowpass.connect(layerGain);
        [[55, 'sine', 0.32], [82.5, 'sine', 0.1], [110, 'triangle', 0.16]].forEach(([frequency, type, volume]) => {
          const oscillator = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          oscillator.type = type;
          oscillator.frequency.value = frequency;
          gain.gain.value = volume;
          oscillator.connect(gain);
          gain.connect(lowpass);
          oscillator.start();
          layer.nodes.push(oscillator, gain);
        });
        layer.nodes.push(lowpass);
        this.layers[key] = layer;
        return;
      }

      const noise = this.makeNoiseSource(key === 'rain' ? this.white : this.brown);
      layer.nodes.push(noise);
      let chain = noise;

      if (key === 'rain') {
        const highpass = this.ctx.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.value = 680;
        highpass.Q.value = 0.4;
        const lowpass = this.ctx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.value = 8500;
        lowpass.Q.value = 0.5;
        chain.connect(highpass);
        highpass.connect(lowpass);
        chain = lowpass;
        layer.nodes.push(highpass, lowpass);
      }

      if (key === 'wind') {
        const bandpass = this.ctx.createBiquadFilter();
        bandpass.type = 'bandpass';
        bandpass.frequency.value = 330;
        bandpass.Q.value = 0.62;
        chain.connect(bandpass);
        chain = bandpass;
        const lfo = this.ctx.createOscillator();
        const lfoGain = this.ctx.createGain();
        lfo.frequency.value = 0.055;
        lfoGain.gain.value = 145;
        lfo.connect(lfoGain);
        lfoGain.connect(bandpass.frequency);
        lfo.start();
        layer.nodes.push(bandpass, lfo, lfoGain);
      }

      if (key === 'fire') {
        const lowpass = this.ctx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.value = 1300;
        lowpass.Q.value = 0.7;
        chain.connect(lowpass);
        chain = lowpass;
        layer.nodes.push(lowpass);
        layer.crackleTimer = setInterval(() => {
          if (!state.playing || !state.active.fire || state.volumes.fire <= 0) return;
          if (Math.random() < 0.58) this.makeCrackle(layerGain);
        }, 190);
      }

      if (key === 'waves') {
        const lowpass = this.ctx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.value = 880;
        lowpass.Q.value = 0.45;
        const modGain = this.ctx.createGain();
        modGain.gain.value = 0.74;
        chain.connect(lowpass);
        lowpass.connect(modGain);
        chain = modGain;
        const lfo = this.ctx.createOscillator();
        const lfoGain = this.ctx.createGain();
        lfo.frequency.value = 0.075;
        lfoGain.gain.value = 0.26;
        lfo.connect(lfoGain);
        lfoGain.connect(modGain.gain);
        lfo.start();
        layer.nodes.push(lowpass, modGain, lfo, lfoGain);
      }

      chain.connect(layerGain);
      this.layers[key] = layer;
    },

    init() {
      if (this.ctx) return true;
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return false;
      try {
        this.ctx = new AudioCtor();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0;
        this.master.connect(this.ctx.destination);
        this.white = this.createNoise('white');
        this.brown = this.createNoise('brown');
        LAYER_ORDER.forEach((key) => this.buildLayer(key));
        return true;
      } catch {
        return false;
      }
    },

    setLayer(key) {
      const layer = this.layers[key];
      if (!layer || !this.ctx) return;
      const active = state.playing && state.active[key] && state.volumes[key] > 0;
      const target = active ? (state.volumes[key] / 100) * AUDIO_SCALE[key] : 0.0001;
      layer.gain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.35);
    },

    applyAll() {
      LAYER_ORDER.forEach((key) => this.setLayer(key));
    },

    start() {
      if (!this.init()) {
        mixState.textContent = 'нет Web Audio';
        return;
      }
      if (this.suspendTimer) clearTimeout(this.suspendTimer);
      this.ctx.resume().then(() => {
        state.playing = true;
        const now = this.ctx.currentTime;
        this.master.gain.cancelScheduledValues(now);
        this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), now);
        this.master.gain.exponentialRampToValueAtTime(Math.max(0.0001, this.masterTarget()), now + 1.3);
        this.applyAll();
        updateLive();
        renderTimer();
        if (state.timerLeft > 0 && !state.timerEnding) startTimerInterval();
      }).catch(() => {
        mixState.textContent = 'нет доступа к звуку';
      });
    },

    stop(fade = 1) {
      state.playing = false;
      stopTimerInterval();
      if (!this.ctx) {
        updateLive();
        renderTimer();
        return;
      }
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.master.gain.value, now);
      this.master.gain.setTargetAtTime(0.0001, now, Math.max(0.08, fade / 4));
      if (this.suspendTimer) clearTimeout(this.suspendTimer);
      this.suspendTimer = setTimeout(() => {
        if (!state.playing) this.ctx.suspend();
      }, fade * 1000 + 300);
      updateLive();
      renderTimer();
    }
  };

  layerRows.forEach((row) => {
    const key = row.dataset.layer;
    const toggle = row.querySelector('.layer-toggle');
    const range = row.querySelector('.layer-range');
    toggle.addEventListener('click', () => toggleLayer(key));
    range.addEventListener('input', () => {
      const value = Number(range.value);
      setLayer(key, value > 0, value);
    });
  });

  presetButtons.forEach((button) => {
    button.addEventListener('click', () => setPreset(button.dataset.preset));
  });

  timerButtons.forEach((button) => {
    button.addEventListener('click', () => selectTimer(Number(button.dataset.timer)));
  });

  masterInput.addEventListener('input', () => {
    state.master = Number(masterInput.value);
    setRangeFill(masterInput, state.master);
    masterValue.textContent = String(state.master);
    saveMix();
    if (audio.ctx && state.playing) {
      audio.master.gain.setTargetAtTime(Math.max(0.0001, audio.masterTarget()), audio.ctx.currentTime, 0.18);
    }
  });

  playButton.addEventListener('click', togglePlay);

  document.addEventListener('keydown', (event) => {
    if (event.code === 'Space' && !event.target.closest('button, input, a')) {
      event.preventDefault();
      togglePlay();
    }
  });

  const clock = $('clock');
  const updateClock = () => {
    try {
      clock.textContent = new Intl.DateTimeFormat('ru-RU', {
        hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow'
      }).format(new Date());
    } catch {
      clock.textContent = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    }
  };
  updateClock();
  setInterval(updateClock, 20000);

  renderMix();
  renderTimer();
  audio.applyAll();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
})();
