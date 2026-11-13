/* まなびドライブ：ゲームの表示・操作・セーブ */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const MAX_QUESTIONS = 10;
  const AUTO_ADVANCE_MS = 4000;
  const ANSWER_LIMIT_MS = 10000;
  const TOPICS = {
    math: [
      ['mix', 'なんでも ミックス'],
      ['addsub', 'たし算・ひき算（3けたまで）'],
      ['multiply', 'かけ算（九九・2けた×1けた）'],
      ['divide', 'わり算（九九のはんい）'],
      ['count', 'ブロックの かず'],
      ['compare', 'おおい・ながい・おもい'],
      ['clock', 'とけい']
    ],
    kanji: [
      ['mix', 'なんでも ミックス'],
      ['reading', 'かんじの よみ'],
      ['writing', 'かんじを かく'],
      ['compound', 'じゅくごの よみ'],
      ['sentence', 'ぶんしょうで かんじ']
    ],
    english: [
      ['mix', 'なんでも ミックス'],
      ['words', 'はじめての えいたんご'],
      ['sentences', 'かんたんな えいぶん']
    ]
  };

  const el = {
    tabs: [...document.querySelectorAll('[data-subject]')],
    topic: $('topicSelect'), grade: $('gradeSelect'), gradeWrap: $('gradeWrap'),
    qKind: $('questionKind'), qGrade: $('questionGrade'), qText: $('questionText'), visual: $('questionVisual'),
    choices: [], roadChoices: $('roadChoices'),
    vehicleChoices: $('vehicleChoices'), vehicleProgress: $('vehicleProgress'),
    drives: [$('goLeft'), $('goRight')], controlsRow: document.querySelector('.controls-row'), controlHint: document.querySelector('.control-hint'),
    world: $('world'), canvas: $('driveCanvas'), bossBadge: $('bossBadge'), worldTip: $('worldTip'),
    answerTimer: $('answerTimer'), answerTime: $('answerTime'), answerTimerFill: $('answerTimerFill'),
    feedback: $('feedback'), fIcon: $('feedbackIcon'), fTitle: $('feedbackTitle'), fText: $('feedbackText'),
    next: $('nextButton'), coins: $('coinCount'), streak: $('streakCount'), counter: $('questionCounter'),
    progress: $('progressFill'), sound: $('soundButton'),
    speak: $('speakButton'), restart: $('restartButton'), finish: $('finishOverlay'),
    dialog: document.querySelector('.finish-dialog'), playAgain: $('playAgain'),
    finishCorrect: $('finishCorrect'), finishCoins: $('finishCoins'), finishSummary: $('finishSummary'), finishStars: $('finishStars')
  };

  let state = {
    subject: 'math', topic: 'mix', grade: 3, number: 1, question: null,
    coins: 0, streak: 0, correct: 0, wrong: 0, locked: false,
    mistakes: [], recent: [], sound: true, vehicleId: 'blue-racer'
  };
  const VEHICLES = [
    {id:'blue-racer', name:'ブルー・レーサー', icon:'🏎️', style:'racer', unlockStreak:0, swatch:'#1477d4', body:0x1477d4, trim:0x122840, glass:0x60c9e6},
    {id:'red-racer', name:'レッド・レーサー', icon:'🏎️', style:'racer', unlockStreak:3, swatch:'#e34848', body:0xe34848, trim:0x441b2a, glass:0x7fd7e8},
    {id:'white-bike', name:'ホワイト・バイク', icon:'🏍️', style:'bike', unlockStreak:6, swatch:'#f5f7fb', body:0xf5f7fb, trim:0x273b56, glass:0x8dd9e8},
    {id:'gold-truck', name:'ゴールド・トラック', icon:'🚚', style:'truck', unlockStreak:9, swatch:'#e3ad35', body:0xe3ad35, trim:0x5a3a16, glass:0x81cbe1}
  ];
  let unlockedVehicles = new Set(['blue-racer']);
  let swipeStart = null;
  let audioContext = null;
  const audio = {
    master: null, engineOutput: null, engineFilter: null,
    engineOsc: null, engineHarmonic: null, engineSub: null,
    engineNoise: null, engineNoiseGain: null, noiseBuffer: null
  };
  let advanceTimer = null;
  let answerTimer = null;
  let answerLastTick = 0;
  let worldInView = !('IntersectionObserver' in window);
  const drive = {
    scene: null, lastTime: 0, frame: 0, speed: .2, boost: 0,
    choiceCount: 2, isBoss: false
  };

  function saveLocal(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* file:// やプライベート閲覧では保存できないことがあります */ }
  }
  function readLocal(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(key)); return v === null ? fallback : v; } catch (_) { return fallback; }
  }

  function updateTopics() {
    el.topic.replaceChildren();
    for (const [value, label] of TOPICS[state.subject]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      el.topic.append(option);
    }
    el.topic.value = 'mix';
    el.gradeWrap.hidden = state.subject !== 'kanji';
    for (const btn of el.tabs) {
      const selected = btn.dataset.subject === state.subject;
      btn.classList.toggle('is-active', selected);
      btn.setAttribute('aria-pressed', String(selected));
    }
  }

  function resetGame() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    clearAdvanceTimer();
    clearAnswerTimer();
    const {subject, topic, grade, sound, vehicleId} = state;
    state = {subject, topic, grade, sound, vehicleId, number:1, question:null, coins:0, streak:0, correct:0, wrong:0, locked:false, mistakes:[], recent:[]};
    el.finish.hidden = true;
    renderVehicleChoices();
    applySelectedVehicle();
    resetDriveAnimation();
    el.feedback.hidden = true;
    nextQuestion();
  }

  function nextQuestion() {
    if (state.number > MAX_QUESTIONS) { showFinish(); return; }
    clearAdvanceTimer();
    state.locked = false;
    el.feedback.hidden = true;
    el.feedback.classList.remove('is-error');
    resetDriveAnimation();
    for (const btn of el.drives) {
      btn.disabled = false;
      btn.classList.remove('is-correct', 'is-wrong');
    }

    // まちがえた問題は、すこし後で復習として再出題する
    const boss = state.number % 4 === 0;
    const revisit = state.mistakes.length > 0 && state.number % 4 === 0 && !boss;
    const q = revisit ? state.mistakes.shift() : window.StudyQuestions.generateQuestion({
      subject:state.subject, topic:state.topic, grade:state.grade, recentIds:state.recent, boss
    });
    state.question = q;
    if (!revisit) state.recent = [...state.recent.slice(-16), q.id];

    el.qText.textContent = q.question;
    el.qKind.textContent = q.tag || ({math:'さんすう',kanji:'かんじ',english:'えいご'}[state.subject]);
    el.qGrade.hidden = !q.gradeTag;
    if (!el.qGrade.hidden) el.qGrade.textContent = q.gradeTag;
    renderChoices(q);
    el.speak.hidden = !q.speech;
    el.visual.replaceChildren();
    if (q.visual) renderVisual(q.visual, el.visual);
    updateHud();
    startAnswerTimer();
  }

  function renderChoices(q) {
    const count = Math.max(2, q.choiceCount || q.choices.length);
    const directions = count === 2
      ? ['↖ ひだり', 'みぎ ↗']
      : Array.from({length: count}, (_, index) => `${index === 0 ? '↖' : index === count - 1 ? '↗' : '↑'} ${index + 1}ばん`);
    el.roadChoices.className = `road-choices choice-count-${count}`;
    el.roadChoices.style.setProperty('--choice-count', String(count));
    el.roadChoices.replaceChildren();
    el.choices = q.choices.map((choice, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `road-choice choice-slot-${index}${count === 2 ? (index === 0 ? ' road-choice-left' : ' road-choice-right') : ''}`;
      button.setAttribute('aria-label', count === 2 ? `${index === 0 ? 'ひだり' : 'みぎ'}の こたえ` : `${index + 1}ばんめの こたえ`);
      button.innerHTML = `<span class="choice-direction">${directions[index]}</span><strong></strong><span class="answer-state" aria-hidden="true"></span>`;
      button.querySelector('strong').textContent = choice;
      button.addEventListener('click', () => choose(index));
      el.roadChoices.append(button);
      return button;
    });
    const isBoss = count > 2;
    drive.choiceCount = count;
    drive.isBoss = isBoss;
    if (drive.scene) {
      drive.scene.reset(count);
      drive.scene.setPaused(!canAnswerNow());
    }
    el.world.classList.toggle('is-boss', isBoss);
    el.bossBadge.hidden = !isBoss;
    el.worldTip.textContent = isBoss ? 'どの みちに すすむ？' : 'どっちの みちに すすむ？';
    el.world.setAttribute('aria-label', isBoss ? 'どの みちが せいかいかな？' : 'どちらの みちが せいかいかな？');
    updateDriveControls(isBoss);
  }

  function updateDriveControls(isBoss) {
    el.controlsRow.classList.toggle('is-boss', isBoss);
    for (const btn of el.drives) btn.hidden = isBoss;
    el.controlHint.innerHTML = isBoss
      ? '🎯<span>1〜4キー または<br>こたえを タップ！</span>'
      : '🚗<span>タップして<br>ハンドルを きろう！</span>';
  }

  function updateHud() {
    el.coins.textContent = state.coins;
    el.streak.textContent = state.streak;
    el.counter.textContent = Math.min(state.number, MAX_QUESTIONS);
    el.progress.style.width = `${Math.max(0, state.number - 1) / MAX_QUESTIONS * 100}%`;
  }

  function choose(which) {
    if (state.locked || el.finish.hidden === false) return;
    const q = state.question;
    if (!q) return;
    clearAnswerTimer();
    state.locked = true;
    const right = which === q.correctIndex;
    if (right) {
      state.correct++;
      state.streak++;
      state.coins += 10 + (state.streak % 3 === 0 ? 5 : 0);
      advanceVehicleProgression();
      playFeedbackSound(true);
    } else {
      state.wrong++;
      state.streak = 0;
      state.mistakes.push(q);
      playFeedbackSound(false);
    }

    startDriveAnimation(which, right, q.choiceCount || q.choices.length);
    el.choices[q.correctIndex].classList.add('is-correct');
    if (!right) el.choices[which].classList.add('is-wrong');
    el.choices[q.correctIndex].querySelector('.answer-state').textContent = '✅';
    if (!right) el.choices[which].querySelector('.answer-state').textContent = '💡';
    for (const btn of [...el.choices, ...el.drives]) btn.disabled = true;

    el.feedback.hidden = false;
    el.feedback.classList.toggle('is-error', !right);
    el.fIcon.textContent = right ? (state.streak % 3 === 0 ? '🌟' : '🎉') : '💡';
    el.fTitle.textContent = right ? (state.streak >= 3 ? `${state.streak}れんぞく せいかい！` : 'せいかい！ いいね！') : 'おっと！ ちょっと よりみち';
    el.fText.textContent = q.explanation;
    el.next.textContent = 'すぐ つぎへ →';
    el.progress.style.width = `${state.number / MAX_QUESTIONS * 100}%`;
    el.coins.textContent = state.coins;
    el.streak.textContent = state.streak;
    el.next.focus({preventScroll:true});
    scheduleAdvance();
  }

  function clearAnswerTimer() {
    if (answerTimer !== null) {
      window.clearTimeout(answerTimer);
      answerTimer = null;
    }
  }

  function startAnswerTimer() {
    clearAnswerTimer();
    let remaining = ANSWER_LIMIT_MS;
    answerLastTick = performance.now();
    const tick = () => {
      if (state.locked || el.finish.hidden === false) return;
      const now = performance.now();
      if (canAnswerNow()) remaining = Math.max(0, remaining - (now - answerLastTick));
      answerLastTick = now;
      const seconds = Math.max(0, Math.ceil(remaining / 1000));
      el.answerTime.textContent = seconds;
      el.answerTimerFill.style.width = `${remaining / ANSWER_LIMIT_MS * 100}%`;
      el.answerTimer.classList.toggle('is-warning', remaining <= 4000);
      if (remaining <= 0) {
        answerTimer = null;
        timeoutQuestion();
        return;
      }
      answerTimer = window.setTimeout(tick, 80);
    };
    tick();
  }

  function canAnswerNow() {
    return worldInView && document.visibilityState !== 'hidden';
  }

  function onGameVisibilityChanged() {
    // Changing visibility must not charge the child for time spent off-screen.
    answerLastTick = performance.now();
    if (drive.scene && !state.locked) drive.scene.setPaused(!canAnswerNow());
  }

  function timeoutQuestion() {
    if (state.locked || !state.question) return;
    const q = state.question;
    state.locked = true;
    state.wrong++;
    state.streak = 0;
    state.mistakes.push(q);
    playFeedbackSound(false);
    el.world.classList.add('is-driving', 'is-wrong-route');
    el.worldTip.textContent = 'じかんぎれ！ いったん とまろう';
    if (drive.scene) drive.scene.stop();
    el.choices[q.correctIndex].classList.add('is-correct');
    for (const btn of [...el.choices, ...el.drives]) btn.disabled = true;
    el.feedback.hidden = false;
    el.feedback.classList.add('is-error');
    el.fIcon.textContent = '⏰';
    el.fTitle.textContent = 'タイムアップ！';
    el.fText.textContent = `10びょう たったよ。${q.explanation}`;
    el.next.textContent = 'すぐ つぎへ →';
    el.progress.style.width = `${state.number / MAX_QUESTIONS * 100}%`;
    el.streak.textContent = state.streak;
    scheduleAdvance();
  }

  function advance() {
    if (!state.locked) return;
    clearAdvanceTimer();
    state.number += 1;
    nextQuestion();
  }

  function clearAdvanceTimer() {
    if (advanceTimer !== null) {
      window.clearTimeout(advanceTimer);
      advanceTimer = null;
    }
  }

  function scheduleAdvance() {
    clearAdvanceTimer();
    const deadline = performance.now() + AUTO_ADVANCE_MS;
    const tick = () => {
      if (!state.locked) return;
      const remaining = Math.max(0, deadline - performance.now());
      const seconds = Math.max(1, Math.ceil(remaining / 1000));
      el.next.textContent = state.number >= MAX_QUESTIONS
        ? `ゴールへ ${seconds}秒 🏁`
        : `つぎへ ${seconds}秒 →`;
      if (remaining <= 0) {
        advanceTimer = null;
        advance();
        return;
      }
      advanceTimer = window.setTimeout(tick, 100);
    };
    tick();
  }

  function resetDriveAnimation() {
    el.world.classList.remove('is-driving', 'is-turning-left', 'is-turning-right', 'is-correct-route', 'is-wrong-route', 'is-boss');
    drive.boost = 0;
    drive.choiceCount = 2;
    drive.isBoss = false;
  }

  function startDriveAnimation(which, right, choiceCount = 2) {
    drive.choiceCount = choiceCount;
    drive.isBoss = choiceCount > 2;
    const turnSide = choiceCount === 2 ? (which === 0 ? -1 : 1) : ((which / (choiceCount - 1)) * 2 - 1);
    el.worldTip.textContent = choiceCount === 2
      ? (which === 0 ? 'ひだりの みちへ！' : 'みぎの みちへ！')
      : `${which + 1}ばんの みちへ！`;
    el.world.classList.add('is-driving', right ? 'is-correct-route' : 'is-wrong-route');
    el.world.classList.toggle('is-turning-left', turnSide < -.18);
    el.world.classList.toggle('is-turning-right', turnSide > .18);
    if (drive.scene) drive.scene.startTurn(which, right);
  }

  function initDriveRenderer() {
    if (!el.canvas) return;
    try {
      drive.scene = new window.DriveScene(el.canvas);
      applySelectedVehicle();
      window.addEventListener('resize', () => drive.scene.resize(), {passive: true});
      drive.lastTime = performance.now();
      drive.frame = window.requestAnimationFrame(renderDriveFrame);
    } catch (error) {
      console.error('3D rendering is unavailable:', error);
      const message = document.createElement('div');
      message.className = 'drive-fallback';
      message.textContent = '3Dの どうろを ひょうじできません。あたらしいブラウザで ためしてね。';
      el.world.append(message);
    }
  }

  function selectedVehicle() {
    return VEHICLES.find(vehicle => vehicle.id === state.vehicleId) || VEHICLES[0];
  }

  function applySelectedVehicle() {
    if (drive.scene) drive.scene.setVehicle(selectedVehicle());
  }

  function renderVehicleChoices() {
    if (!el.vehicleChoices) return;
    el.vehicleChoices.replaceChildren();
    for (const vehicle of VEHICLES) {
      const unlocked = unlockedVehicles.has(vehicle.id) || vehicle.unlockStreak === 0;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `vehicle-choice${state.vehicleId === vehicle.id ? ' is-selected' : ''}${unlocked ? '' : ' is-locked'}`;
      button.disabled = !unlocked;
      button.style.setProperty('--vehicle-swatch', vehicle.swatch);
      button.setAttribute('aria-label', unlocked ? `${vehicle.name}を えらぶ` : `${vehicle.name}は ${vehicle.unlockStreak}れんぞく せいかいで 解放`);
      button.innerHTML = `<span class="vehicle-icon">${unlocked ? vehicle.icon : '🔒'}</span><strong>${vehicle.name}</strong><small>${unlocked ? (state.vehicleId === vehicle.id ? 'せんたくちゅう' : 'えらべる') : `${vehicle.unlockStreak}れんぞくで 解放`}</small>`;
      button.addEventListener('click', () => {
        state.vehicleId = vehicle.id;
        saveLocal('manabi-drive-vehicle', vehicle.id);
        applySelectedVehicle();
        renderVehicleChoices();
      });
      el.vehicleChoices.append(button);
    }
    const next = VEHICLES.find(vehicle => !unlockedVehicles.has(vehicle.id));
    el.vehicleProgress.textContent = next ? `${next.unlockStreak}れんぞく せいかいで ${next.name}が なかまになるよ` : 'ぜんぶの くるまを ゲット！';
  }

  function advanceVehicleProgression() {
    const unlockedNow = VEHICLES.filter(vehicle => state.streak >= vehicle.unlockStreak);
    for (const vehicle of unlockedNow) unlockedVehicles.add(vehicle.id);
    const upgrade = VEHICLES.find(vehicle => vehicle.unlockStreak === state.streak);
    if (upgrade) {
      state.vehicleId = upgrade.id;
      saveLocal('manabi-drive-vehicle', upgrade.id);
      applySelectedVehicle();
    }
    saveLocal('manabi-drive-unlocked', [...unlockedVehicles]);
    renderVehicleChoices();
  }

  function renderDriveFrame(now) {
    const dt = Math.min(.25, Math.max(0, (now - drive.lastTime) / 1000));
    drive.lastTime = now;
    drive.scene.update(dt, now / 1000);
    drive.speed = Math.min(1.6, drive.scene.travelSpeed / 18);
    drive.boost = drive.scene.boost;
    updateEngineSound();
    drive.frame = window.requestAnimationFrame(renderDriveFrame);
  }

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function showFinish() {
    const stars = state.correct >= 9 ? 3 : state.correct >= 6 ? 2 : 1;
    el.finishStars.textContent = '⭐'.repeat(stars) + '☆'.repeat(3 - stars);
    el.finishCoins.textContent = state.coins;
    el.finishCorrect.textContent = state.correct;
    el.finishSummary.textContent = state.correct >= 8 ? 'すごい！ きょうも たくさん まなんだね！' : 'ゴールに とうちゃく！ なんどでも チャレンジしてね。';
    el.finish.hidden = false;
    el.dialog.focus();
    const key = `manabi-drive-best-${state.subject}`;
    const prev = readLocal(key, 0);
    if (state.coins > prev) saveLocal(key, state.coins);
  }

  function makeNode(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }

  function makeBlocks(n, compact=false) {
    const wrap = makeNode('div', `visual-tiles${compact ? ' compact' : ''}`);
    wrap.setAttribute('aria-label', `${n}この ブロック`);
    for (let i = 0; i < n; i++) wrap.append(makeNode('span', 'visual-tile'));
    return wrap;
  }

  function makeClock(h, m) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 120 120');
    svg.setAttribute('class', 'clockface');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `${h}じ ${m}ふんの アナログどけい`);
    function elem(type, attrs, text) {
      const e = document.createElementNS(ns, type);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
      if (text !== undefined) e.textContent = text;
      svg.appendChild(e);
      return e;
    }
    elem('circle',{cx:60,cy:60,r:57,fill:'#fff',stroke:'#4489ce','stroke-width':5});
    elem('circle',{cx:60,cy:60,r:50,fill:'#fcfeff',stroke:'#dbeefd','stroke-width':1});
    for (let i=1; i<=12; i++) {
      const a = i * Math.PI / 6;
      elem('text',{x:(60+40*Math.sin(a)).toFixed(2), y:(60-40*Math.cos(a)+4.2).toFixed(2),
        fill:'#42617b','text-anchor':'middle','font-size':12,'font-weight':900}, String(i));
    }
    for (let i=0; i<60; i++) {
      const a = i * Math.PI / 30;
      elem('circle',{cx:(60+51*Math.sin(a)).toFixed(2),cy:(60-51*Math.cos(a)).toFixed(2),r:i%5===0?1.15:.48,fill:'#8ca3b9'});
    }
    const hourAngle = (h % 12 + m / 60) * Math.PI / 6;
    const minuteAngle = m * Math.PI / 30;
    elem('line',{x1:60,y1:60,x2:(60+24*Math.sin(hourAngle)).toFixed(2),y2:(60-24*Math.cos(hourAngle)).toFixed(2),stroke:'#234769','stroke-width':6,'stroke-linecap':'round'});
    elem('line',{x1:60,y1:60,x2:(60+34*Math.sin(minuteAngle)).toFixed(2),y2:(60-34*Math.cos(minuteAngle)).toFixed(2),stroke:'#ff925c','stroke-width':4,'stroke-linecap':'round'});
    elem('circle',{cx:60,cy:60,r:5,fill:'#315a88'});
    return svg;
  }

  function renderVisual(v, parent) {
    if (v.type === 'blocks') { parent.append(makeBlocks(v.count)); return; }
    if (v.type === 'emoji') { parent.append(makeNode('span','visual-emoji',v.emoji)); return; }
    if (v.type === 'kanji') { parent.append(makeNode('div','visual-kanji',v.word)); return; }
    if (v.type === 'sentence') { parent.append(makeNode('div','visual-sentence',v.text)); return; }
    if (v.type === 'notebook') { parent.append(makeNode('div','visual-notebook','✏️')); return; }
    if (v.type === 'clock') { parent.append(makeClock(v.h, v.m)); return; }
    if (v.type === 'clock-pair') {
      const box = makeNode('div','clockpair');
      for (const [label, time] of [['A',v.a], ['B',v.b]]) {
        const unit = makeNode('div','clock-unit');
        unit.append(makeNode('span','',label), makeClock(time.h,time.m));
        box.append(unit);
      }
      parent.append(box);
      return;
    }
    if (v.type === 'compare') {
      const box = makeNode('div','visual-compare');
      const items = v.items || [['A', v.a], ['B', v.b]].map(([label, value]) => ({label, value}));
      for (const item of items) {
        const label = item.label;
        const n = item.value;
        const card = makeNode('div','compare-item');
        card.append(makeNode('span','compare-label',label));
        if (v.mode === 'count') card.append(makeBlocks(n,true));
        if (v.mode === 'weight') card.append(makeNode('div','compare-weight-icon','⚖️'), makeNode('div','compare-weight',`${n} kg`));
        if (v.mode === 'length') {
          const track = makeNode('div','compare-length-track');
          const bar = makeNode('div','compare-bar');
          bar.style.width = `${n/9*100}%`;
          track.append(bar);
          card.append(track);
        }
        box.append(card);
      }
      parent.append(box);
    }
  }

  function getAudioContext() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      if (!audioContext) {
        audioContext = new Ctx();
        audio.master = audioContext.createGain();
        audio.master.gain.value = .55;
        audio.master.connect(audioContext.destination);
      }
      if (audioContext.state === 'suspended') audioContext.resume();
      return audioContext;
    } catch (_) { return null; }
  }

  function getNoiseBuffer(ctx) {
    if (audio.noiseBuffer) return audio.noiseBuffer;
    const length = Math.floor(ctx.sampleRate * .9);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * .45;
    audio.noiseBuffer = buffer;
    return buffer;
  }

  function startEngineSound() {
    if (!state.sound) return null;
    const ctx = getAudioContext();
    if (!ctx) return null;
    if (audio.engineOsc) {
      audio.engineOutput.gain.setTargetAtTime(.035, ctx.currentTime, .08);
      return ctx;
    }

    const mixer = ctx.createGain();
    mixer.gain.value = .8;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 430;
    filter.Q.value = .9;
    const output = ctx.createGain();
    output.gain.value = .0001;
    mixer.connect(filter); filter.connect(output); output.connect(audio.master);

    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'sawtooth'; osc.frequency.value = 58; oscGain.gain.value = .16;
    osc.connect(oscGain); oscGain.connect(mixer);

    const harmonic = ctx.createOscillator();
    const harmonicGain = ctx.createGain();
    harmonic.type = 'triangle'; harmonic.frequency.value = 116; harmonicGain.gain.value = .1;
    harmonic.connect(harmonicGain); harmonicGain.connect(mixer);

    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine'; sub.frequency.value = 29; subGain.gain.value = .24;
    sub.connect(subGain); subGain.connect(mixer);

    const noise = ctx.createBufferSource();
    const noiseFilter = ctx.createBiquadFilter();
    const noiseGain = ctx.createGain();
    noise.buffer = getNoiseBuffer(ctx); noise.loop = true;
    noiseFilter.type = 'lowpass'; noiseFilter.frequency.value = 180;
    noiseGain.gain.value = .035;
    noise.connect(noiseFilter); noiseFilter.connect(noiseGain); noiseGain.connect(mixer);

    osc.start(); harmonic.start(); sub.start(); noise.start();
    audio.engineOsc = osc;
    audio.engineHarmonic = harmonic;
    audio.engineSub = sub;
    audio.engineNoise = noise;
    audio.engineNoiseGain = noiseGain;
    audio.engineFilter = filter;
    audio.engineOutput = output;
    output.gain.setTargetAtTime(.025, ctx.currentTime, .12);
    return ctx;
  }

  function updateEngineSound() {
    if (!audioContext || !audio.engineOsc || !audio.engineOutput) return;
    const now = audioContext.currentTime;
    const rpm = 54 + drive.speed * 82 + drive.boost * 120;
    const volume = state.sound ? .009 + drive.speed * .022 + drive.boost * .035 : .0001;
    audio.engineOsc.frequency.setTargetAtTime(rpm, now, .035);
    audio.engineHarmonic.frequency.setTargetAtTime(rpm * 2.01, now, .035);
    audio.engineSub.frequency.setTargetAtTime(rpm * .5, now, .05);
    audio.engineFilter.frequency.setTargetAtTime(300 + drive.speed * 330 + drive.boost * 520, now, .07);
    audio.engineOutput.gain.setTargetAtTime(volume, now, .08);
  }

  function setSoundEnabled(enabled) {
    if (enabled) startEngineSound();
    else if (audioContext && audio.engineOutput) audio.engineOutput.gain.setTargetAtTime(.0001, audioContext.currentTime, .06);
  }

  function playTone(ctx, frequency, when, duration, type, gain, slideTo = null) {
    const oscillator = ctx.createOscillator();
    const volume = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, when);
    if (slideTo !== null) oscillator.frequency.exponentialRampToValueAtTime(slideTo, when + duration * .75);
    volume.gain.setValueAtTime(.0001, when);
    volume.gain.exponentialRampToValueAtTime(gain, when + .025);
    volume.gain.exponentialRampToValueAtTime(.0001, when + Math.max(.04, duration - .025));
    oscillator.connect(volume); volume.connect(audio.master);
    oscillator.start(when); oscillator.stop(when + duration);
  }

  function playBoostSound(ctx) {
    const now = ctx.currentTime;
    const whoosh = ctx.createBufferSource();
    const whooshFilter = ctx.createBiquadFilter();
    const whooshGain = ctx.createGain();
    whoosh.buffer = getNoiseBuffer(ctx);
    whooshFilter.type = 'bandpass'; whooshFilter.Q.value = .65;
    whooshFilter.frequency.setValueAtTime(420, now);
    whooshFilter.frequency.exponentialRampToValueAtTime(2600, now + .42);
    whooshGain.gain.setValueAtTime(.0001, now);
    whooshGain.gain.exponentialRampToValueAtTime(.22, now + .07);
    whooshGain.gain.exponentialRampToValueAtTime(.0001, now + .82);
    whoosh.connect(whooshFilter); whooshFilter.connect(whooshGain); whooshGain.connect(audio.master);
    whoosh.start(now); whoosh.stop(now + .84);

    playTone(ctx, 84, now, .42, 'sawtooth', .18, 210);
    [392, 523.25, 659.25, 783.99, 1046.5].forEach((note, index) => {
      playTone(ctx, note, now + .08 + index * .09, .28, index === 4 ? 'sine' : 'triangle', index === 4 ? .16 : .11);
    });
    playTone(ctx, 1568, now + .47, .34, 'sine', .08);
  }

  function playWrongSound(ctx) {
    const now = ctx.currentTime;
    playTone(ctx, 210, now, .42, 'square', .11, 78);
    playTone(ctx, 116, now + .08, .5, 'sawtooth', .08, 62);
    const thud = ctx.createBufferSource();
    const thudFilter = ctx.createBiquadFilter();
    const thudGain = ctx.createGain();
    thud.buffer = getNoiseBuffer(ctx);
    thudFilter.type = 'lowpass'; thudFilter.frequency.value = 170;
    thudGain.gain.setValueAtTime(.13, now);
    thudGain.gain.exponentialRampToValueAtTime(.0001, now + .34);
    thud.connect(thudFilter); thudFilter.connect(thudGain); thudGain.connect(audio.master);
    thud.start(now); thud.stop(now + .36);
  }

  function playFeedbackSound(correct) {
    if (!state.sound) return;
    const ctx = startEngineSound();
    if (!ctx) return;
    try {
      if (correct) playBoostSound(ctx);
      else playWrongSound(ctx);
    } catch (_) { /* 音が出ない環境でもゲームは続けられます */ }
  }

  function speakEnglish() {
    const text = state.question && state.question.speech;
    if (!text || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = .83;
    utterance.pitch = 1.05;
    window.speechSynthesis.speak(utterance);
  }

  for (const tab of el.tabs) {
    tab.addEventListener('click', () => {
      if (state.subject === tab.dataset.subject) return;
      state.subject = tab.dataset.subject;
      state.topic = 'mix';
      updateTopics();
      resetGame();
    });
  }
  el.topic.addEventListener('change', () => {state.topic = el.topic.value; resetGame();});
  el.grade.addEventListener('change', () => {state.grade = Number(el.grade.value); resetGame();});
  el.drives.forEach((btn,i)=>btn.addEventListener('click',()=>choose(i)));
  el.next.addEventListener('click',advance);
  el.restart.addEventListener('click',resetGame);
  el.playAgain.addEventListener('click',resetGame);
  el.speak.addEventListener('click',speakEnglish);
  el.sound.addEventListener('click',()=>{
    state.sound = !state.sound;
    setSoundEnabled(state.sound);
    el.sound.setAttribute('aria-pressed', String(state.sound));
    el.sound.innerHTML = state.sound ? '🔊 <span>おと ON</span>' : '🔇 <span>おと OFF</span>';
    saveLocal('manabi-drive-sound', state.sound);
  });
  document.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
    if (['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) return;
    if (!el.finish.hidden) {
      if (event.key === 'Enter') { event.preventDefault(); resetGame(); }
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      choose(event.key === 'ArrowLeft' ? 0 : Math.min(el.choices.length - 1, el.choices.length > 2 ? el.choices.length - 1 : 1));
    } else if (/^[1-4]$/.test(event.key)) {
      const index = Number(event.key) - 1;
      if (index < el.choices.length) {
        event.preventDefault();
        choose(index);
      }
    } else if ((event.key === 'Enter' || event.key === ' ') && state.locked && document.activeElement === document.body) {
      event.preventDefault(); advance();
    }
  });
  el.world.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' || event.target.closest('button')) {
      swipeStart = null;
      return;
    }
    swipeStart = {x:event.clientX, y:event.clientY, pointerId:event.pointerId};
  }, {passive:true});
  el.world.addEventListener('pointerup', (event) => {
    if (!swipeStart || event.pointerId !== swipeStart.pointerId) return;
    const dx = event.clientX - swipeStart.x;
    const dy = event.clientY - swipeStart.y;
    if (Math.abs(dx)>55 && Math.abs(dx)>Math.abs(dy)*1.7) {
      if (el.choices.length > 2) {
        const rect = el.roadChoices.getBoundingClientRect();
        const ratio = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, .999);
        choose(Math.floor(ratio * el.choices.length));
      } else choose(dx < 0 ? 0 : 1);
    }
    swipeStart = null;
  }, {passive:true});
  el.world.addEventListener('pointercancel', () => { swipeStart = null; }, {passive:true});

  const savedUnlockedVehicles = readLocal('manabi-drive-unlocked', ['blue-racer']);
  unlockedVehicles = new Set(Array.isArray(savedUnlockedVehicles) ? savedUnlockedVehicles : ['blue-racer']);
  unlockedVehicles.add('blue-racer');
  const savedVehicle = readLocal('manabi-drive-vehicle', 'blue-racer');
  if (VEHICLES.some(vehicle => vehicle.id === savedVehicle && unlockedVehicles.has(vehicle.id))) state.vehicleId = savedVehicle;
  renderVehicleChoices();
  state.sound = readLocal('manabi-drive-sound', true);
  el.sound.setAttribute('aria-pressed', String(state.sound));
  el.sound.innerHTML = state.sound ? '🔊 <span>おと ON</span>' : '🔇 <span>おと OFF</span>';
  initDriveRenderer();
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      worldInView = entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= .25);
      onGameVisibilityChanged();
    }, {threshold: [0, .25]});
    observer.observe(el.world);
  }
  document.addEventListener('visibilitychange', onGameVisibilityChanged);
  updateTopics();
  resetGame();

  // HTTPS（GitHub Pages 等）または localhost でのみPWAのオフライン機能が動きます。
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(()=>{}));
  }
})();
