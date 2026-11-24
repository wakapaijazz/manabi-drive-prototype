/* まなびドライブ：ゲームの表示・操作・セーブ */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const MAX_QUESTIONS = 10;
  const AUTO_ADVANCE_MS = 4000;
  const DEFAULT_ANSWER_SECONDS = 10;
  const STAGES = {
    1: {number:'ステージ 01', name:'にじいろの そうげん', badge:'🌤️', theme:'stage-1'},
    2: {number:'ステージ 02', name:'サンセット・シティ', badge:'🌇', theme:'stage-2'},
    3: {number:'ステージ 03', name:'ナイト・ハイウェイ', badge:'🌌', theme:'stage-3'}
  };
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
    ],
    juniorEnglish: [
      ['mix', '中学英語 ミックス'],
      ['words', '中学英単語'],
      ['idioms', '熟語・連語'],
      ['dialogue', '会話文'],
      ['fill', '空所補充']
    ]
  };

  const el = {
    tabs: [...document.querySelectorAll('[data-subject]')],
    topic: $('topicSelect'), stage: $('stageSelect'), grade: $('gradeSelect'), gradeWrap: $('gradeWrap'),
    stageNumber: $('stageNumber'), stageName: $('stageName'), stageBadge: $('stageBadge'), gamePane: $('gamePane'),
    startPanel: $('startPanel'), start: $('startButton'), questionPanel: $('questionPanel'),
    qKind: $('questionKind'), qGrade: $('questionGrade'), qText: $('questionText'), visual: $('questionVisual'),
    choices: [], roadChoices: $('roadChoices'),
    vehicleChoices: $('vehicleChoices'), vehicleProgress: $('vehicleProgress'),
    settingsToggle: $('settingsToggle'),
    world: $('world'), canvas: $('driveCanvas'), bossBadge: $('bossBadge'), worldTip: $('worldTip'),
    speed: $('speedValue'), speedometer: $('speedometer'), boostLabel: $('boostLabel'),
    answerTimer: $('answerTimer'), answerTime: $('answerTime'), answerTimerFill: $('answerTimerFill'),
    feedback: $('feedback'), fIcon: $('feedbackIcon'), fTitle: $('feedbackTitle'), fText: $('feedbackText'),
    next: $('nextButton'), coins: $('coinCount'), streak: $('streakCount'), counter: $('questionCounter'),
    progress: $('progressFill'), progressTrack: $('progressTrack'), sound: $('soundButton'),
    speak: $('speakButton'), restart: $('restartButton'), finish: $('finishOverlay'),
    page: document.querySelector('.page'), playAgain: $('playAgain'),
    finishCorrect: $('finishCorrect'), finishCoins: $('finishCoins'), finishSummary: $('finishSummary'), finishStars: $('finishStars')
  };

  let state = {
    subject: 'math', topic: 'mix', stage: 1, grade: 3, number: 1, question: null,
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
  const audio = new window.DriveAudio();
  let session = 'ready';
  let advanceTimer = null;
  let answerTimer = null;
  let answerLastTick = 0;
  const playAreas = [el.world, el.roadChoices];
  const visiblePlayAreas = new Set();
  const drive = {
    scene: null, lastTime: 0, speed: 0, boosting: false
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

  function updateStage() {
    const stage = STAGES[state.stage] || STAGES[1];
    el.stage.value = String(state.stage);
    el.stageNumber.textContent = stage.number;
    el.stageName.textContent = stage.name;
    el.stageBadge.textContent = stage.badge;
    el.gamePane.dataset.stage = String(state.stage);
    el.world.classList.remove('stage-1', 'stage-2', 'stage-3');
    el.world.classList.add(stage.theme);
    if (drive.scene) drive.scene.setStage(state.stage);
  }

  function prepareGame() {
    session = 'ready';
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    clearAdvanceTimer();
    clearAnswerTimer();
    const {subject, topic, stage, grade, sound, vehicleId} = state;
    state = {subject, topic, stage, grade, sound, vehicleId, number:1, question:null, coins:0, streak:0, correct:0, wrong:0, locked:false, mistakes:[], recent:[]};
    updateStage();
    el.finish.hidden = true;
    el.page.inert = false;
    el.startPanel.hidden = false;
    el.questionPanel.hidden = el.roadChoices.hidden = true;
    el.answerTimer.hidden = el.worldTip.hidden = el.bossBadge.hidden = true;
    el.world.setAttribute('aria-label', 'スタートまえの コース');
    el.choices = [];
    el.roadChoices.replaceChildren();
    renderVehicleChoices();
    applySelectedVehicle();
    resetDriveAnimation();
    if (drive.scene) drive.scene.reset(2, {parked:true});
    updateDriveReadout(0, 0);
    audio.update(0, 0, false);
    el.feedback.hidden = true;
    updateHud();
  }

  function startGame() {
    if (session !== 'ready') return;
    session = 'running';
    el.startPanel.hidden = true;
    el.questionPanel.hidden = el.roadChoices.hidden = false;
    el.answerTimer.hidden = el.worldTip.hidden = false;
    if (state.sound) audio.unlock();
    nextQuestion();
    el.qText.focus({preventScroll:true});
    el.roadChoices.scrollIntoView({block:'nearest', behavior:'instant'});
  }

  function nextQuestion() {
    if (state.number > MAX_QUESTIONS) { showFinish(); return; }
    clearAdvanceTimer();
    state.locked = false;
    el.feedback.hidden = true;
    el.feedback.classList.remove('is-error');
    resetDriveAnimation();
    // まちがえた問題は、すこし後で復習として再出題する
    const boss = state.stage === 1
      ? state.number % 4 === 0
      : state.stage === 2
        ? state.number % 3 === 0
        : state.number % 2 === 0;
    const revisit = state.mistakes.length > 0 && state.number % 4 === 0 && !boss;
    const q = revisit ? state.mistakes.shift() : window.StudyQuestions.generateQuestion({
      subject:state.subject, topic:state.topic, grade:state.grade, recentIds:state.recent, boss,
      mathLevel: Math.min(window.StudyQuestions.MATH_LEVELS?.length || 8, state.streak + 1)
    });
    state.question = q;
    if (!revisit) state.recent = [...state.recent.slice(-16), q.id];

    el.qText.textContent = q.question;
    el.qKind.textContent = q.levelTag ? `レベル${q.level}：${q.levelTag}` : (q.tag || ({math:'さんすう',kanji:'かんじ',english:'えいご',juniorEnglish:'中学英語'}[state.subject]));
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
    const directions = count === 2 ? ['ひだり', 'みぎ'] : q.choices.map((_, index) => `${index + 1}ばん`);
    const keys = count === 2 ? ['←', '→'] : q.choices.map((_, index) => String(index + 1));
    el.roadChoices.style.setProperty('--choice-count', String(count));
    el.roadChoices.replaceChildren();
    el.choices = q.choices.map((choice, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = count === 2 && index === 1 ? 'road-choice road-choice-right' : 'road-choice';
      button.innerHTML = `<span class="choice-heading"><span class="choice-direction">${directions[index]}</span><kbd aria-hidden="true">${keys[index]}</kbd></span><strong></strong><span class="answer-state" aria-hidden="true"></span>`;
      button.querySelector('strong').textContent = choice;
      button.addEventListener('click', () => choose(index));
      el.roadChoices.append(button);
      return button;
    });
    const isBoss = count > 2;
    if (drive.scene) {
      drive.scene.reset(count, {approachSeconds: answerLimitSeconds(q)});
      drive.scene.setPaused(!canAnswerNow());
    }
    el.world.classList.toggle('is-boss', isBoss);
    el.bossBadge.hidden = !isBoss;
    el.worldTip.textContent = isBoss ? 'どの みちに すすむ？' : 'どっちの みちに すすむ？';
    el.world.setAttribute('aria-label', isBoss ? 'どの みちが せいかいかな？' : 'どちらの みちが せいかいかな？');
  }

  function updateProgress(completed) {
    el.progress.style.width = `${completed / MAX_QUESTIONS * 100}%`;
    el.progressTrack.setAttribute('aria-valuenow', completed);
  }

  function updateHud() {
    el.coins.textContent = state.coins;
    el.streak.textContent = state.streak;
    el.counter.textContent = session === 'ready' ? 0 : Math.min(state.number, MAX_QUESTIONS);
    updateProgress(Math.max(0, state.number - 1));
  }

  function choose(which) {
    if (session !== 'running' || state.locked) return;
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
      audio.feedback(true);
    } else {
      state.wrong++;
      state.streak = 0;
      state.mistakes.push(q);
      audio.feedback(false);
    }

    startDriveAnimation(which, right, q.choiceCount || q.choices.length);
    el.choices[q.correctIndex].classList.add('is-correct');
    if (!right) el.choices[which].classList.add('is-wrong');
    el.choices[q.correctIndex].querySelector('.answer-state').textContent = '✅';
    if (!right) el.choices[which].querySelector('.answer-state').textContent = '💡';
    for (const btn of el.choices) btn.disabled = true;

    el.feedback.hidden = false;
    el.feedback.classList.toggle('is-error', !right);
    el.fIcon.textContent = right ? (state.streak % 3 === 0 ? '🌟' : '🎉') : '💡';
    el.fTitle.textContent = right ? (state.streak >= 3 ? `${state.streak}れんぞく せいかい！` : 'せいかい！ いいね！') : 'おっと！ ちょっと よりみち';
    el.fText.textContent = q.explanation;
    updateProgress(state.number);
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

  function answerLimitSeconds(question) {
    return clamp(Number(question?.timeLimitSec) || DEFAULT_ANSWER_SECONDS, DEFAULT_ANSWER_SECONDS, 20);
  }

  function startAnswerTimer() {
    clearAnswerTimer();
    const limitMs = answerLimitSeconds(state.question) * 1000;
    let remaining = limitMs;
    answerLastTick = performance.now();
    const tick = () => {
      if (session !== 'running' || state.locked) return;
      const now = performance.now();
      if (canAnswerNow()) remaining = Math.max(0, remaining - (now - answerLastTick));
      answerLastTick = now;
      const seconds = Math.max(0, Math.ceil(remaining / 1000));
      el.answerTime.textContent = seconds;
      el.answerTimerFill.style.width = `${remaining / limitMs * 100}%`;
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
    const playAreaInView = !('IntersectionObserver' in window) || visiblePlayAreas.size === playAreas.length;
    return session === 'running' && playAreaInView && document.visibilityState !== 'hidden';
  }

  function onGameVisibilityChanged() {
    // Changing visibility must not charge the child for time spent off-screen.
    answerLastTick = performance.now();
    if (drive.scene && !state.locked) drive.scene.setPaused(!canAnswerNow());
    if (document.visibilityState === 'hidden') audio.update(0, 0, false);
  }

  function timeoutQuestion() {
    if (state.locked || !state.question) return;
    const q = state.question;
    state.locked = true;
    state.wrong++;
    state.streak = 0;
    state.mistakes.push(q);
    audio.feedback(false);
    el.world.classList.add('is-driving', 'is-wrong-route');
    el.worldTip.textContent = 'じかんぎれ！ いったん とまろう';
    if (drive.scene) drive.scene.stop();
    el.choices[q.correctIndex].classList.add('is-correct');
    el.choices[q.correctIndex].querySelector('.answer-state').textContent = '✅';
    for (const btn of el.choices) btn.disabled = true;
    el.feedback.hidden = false;
    el.feedback.classList.add('is-error');
    el.fIcon.textContent = '⏰';
    el.fTitle.textContent = 'タイムアップ！';
    el.fText.textContent = `${answerLimitSeconds(q)}びょう たったよ。${q.explanation}`;
    updateProgress(state.number);
    el.streak.textContent = state.streak;
    scheduleAdvance();
  }

  function advance() {
    if (session !== 'running' || !state.locked) return;
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
        ? `ゴールまで ${seconds}びょう`
        : `つぎへ ${seconds}びょう`;
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
    el.world.classList.remove('is-driving', 'is-correct-route', 'is-wrong-route', 'is-boss');
  }

  function startDriveAnimation(which, right, choiceCount = 2) {
    el.worldTip.textContent = choiceCount === 2
      ? (which === 0 ? 'ひだりの みちへ！' : 'みぎの みちへ！')
      : `${which + 1}ばんの みちへ！`;
    el.world.classList.add('is-driving', right ? 'is-correct-route' : 'is-wrong-route');
    if (drive.scene) drive.scene.startTurn(which, right);
  }

  function initDriveRenderer() {
    if (!el.canvas) return;
    try {
      drive.scene = new window.DriveScene(el.canvas);
      drive.scene.setStage(state.stage);
      applySelectedVehicle();
      window.addEventListener('resize', () => drive.scene.resize(), {passive: true});
      drive.lastTime = performance.now();
      window.requestAnimationFrame(renderDriveFrame);
    } catch (error) {
      console.error('3D rendering is unavailable:', error);
      const message = document.createElement('div');
      message.className = 'drive-fallback';
      message.textContent = '3Dの どうろを ひょうじできません。あたらしいブラウザで ためしてね。';
      el.world.append(message);
      el.speedometer.hidden = true;
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
    const active = session === 'running' && document.visibilityState !== 'hidden' && drive.scene.pausedAt === null;
    const speed = active ? drive.scene.travelSpeed : 0;
    const boost = active ? drive.scene.boost : 0;
    updateDriveReadout(speed, boost);
    audio.update(speed, boost, active, selectedVehicle().style);
    window.requestAnimationFrame(renderDriveFrame);
  }

  function updateDriveReadout(speed, boost) {
    const kmh = Math.round(speed * 3.6);
    if (drive.speed !== kmh) {
      drive.speed = kmh;
      el.speed.textContent = kmh;
      el.world.classList.toggle('at-speed', kmh >= 112);
    }
    const boosting = boost > .22;
    if (drive.boosting !== boosting) {
      drive.boosting = boosting;
      el.world.classList.toggle('is-boosting', boosting);
      el.boostLabel.hidden = !boosting;
    }
  }

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function showFinish() {
    session = 'finished';
    if (drive.scene) drive.scene.setPaused(true);
    updateDriveReadout(0, 0);
    audio.update(0, 0, false);
    const stars = state.correct >= 9 ? 3 : state.correct >= 6 ? 2 : 1;
    el.finishStars.textContent = '⭐'.repeat(stars) + '☆'.repeat(3 - stars);
    el.finishCoins.textContent = state.coins;
    el.finishCorrect.textContent = state.correct;
    el.finishSummary.textContent = state.correct >= 8 ? 'すごい！ きょうも たくさん まなんだね！' : 'ゴールに とうちゃく！ なんどでも チャレンジしてね。';
    el.finish.hidden = false;
    el.page.inert = true;
    el.playAgain.focus();
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
    if (v.type === 'english-word') { parent.append(makeNode('div','visual-english-word',v.word)); return; }
    if (v.type === 'idiom') {
      const box = makeNode('div','visual-idiom');
      box.append(makeNode('strong','',v.phrase), makeNode('span','',v.example));
      parent.append(box);
      return;
    }
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
      prepareGame();
    });
  }
  el.topic.addEventListener('change', () => {state.topic = el.topic.value; prepareGame();});
  el.stage.addEventListener('change', () => {state.stage = Number(el.stage.value); prepareGame();});
  el.grade.addEventListener('change', () => {state.grade = Number(el.grade.value); prepareGame();});
  el.settingsToggle.addEventListener('click', () => {
    const expanded = el.settingsToggle.getAttribute('aria-expanded') === 'true';
    el.settingsToggle.setAttribute('aria-expanded', String(!expanded));
  });
  el.next.addEventListener('click',advance);
  el.start.addEventListener('click',startGame);
  for (const button of [el.restart, el.playAgain]) {
    button.addEventListener('click', () => {
      prepareGame();
      el.start.focus();
    });
  }
  el.speak.addEventListener('click',speakEnglish);
  el.sound.addEventListener('click',()=>{
    state.sound = !state.sound;
    audio.setEnabled(state.sound);
    if (state.sound && session === 'running') audio.unlock();
    el.sound.setAttribute('aria-pressed', String(state.sound));
    el.sound.innerHTML = state.sound ? '🔊 <span>おと ON</span>' : '🔇 <span>おと OFF</span>';
    saveLocal('manabi-drive-sound', state.sound);
  });
  document.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
    if (['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) return;
    if (session !== 'running') return;
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
  audio.setEnabled(state.sound);
  el.sound.setAttribute('aria-pressed', String(state.sound));
  el.sound.innerHTML = state.sound ? '🔊 <span>おと ON</span>' : '🔇 <span>おと OFF</span>';
  initDriveRenderer();
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting && entry.intersectionRatio >= .25) visiblePlayAreas.add(entry.target);
        else visiblePlayAreas.delete(entry.target);
      }
      onGameVisibilityChanged();
    }, {threshold: [0, .25]});
    for (const area of playAreas) observer.observe(area);
  }
  document.addEventListener('visibilitychange', onGameVisibilityChanged);
  updateTopics();
  prepareGame();

  // HTTPS（GitHub Pages 等）または localhost でのみPWAのオフライン機能が動きます。
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(()=>{}));
  }
})();
