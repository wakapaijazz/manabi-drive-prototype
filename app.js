/* まなびドライブ：ゲームの表示・操作・セーブ（外部ライブラリ不要） */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const MAX_QUESTIONS = 10;
  const AUTO_ADVANCE_MS = 2400;
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
      ['writing', 'かんじを えらぶ（かき）'],
      ['compound', 'じゅくごの よみ']
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
    mistakes: [], recent: [], sound: true
  };
  let swipeStart = null;
  let audioContext = null;
  const audio = {
    master: null, engineOutput: null, engineFilter: null,
    engineOsc: null, engineHarmonic: null, engineSub: null,
    engineNoise: null, engineNoiseGain: null, noiseBuffer: null
  };
  let advanceTimer = null;
  let answerTimer = null;
  const drive = {
    ctx: null, width: 0, height: 0, dpr: 1, lastTime: 0, frame: 0,
    distance: 0, speed: .12, lane: 0, targetLane: 0,
    mode: 'idle', phase: 'cruise', turnSide: 0, turnProgress: 0, shake: 0, flash: 0,
    choiceCount: 2, isBoss: false, selectedChoice: -1, junctionDepth: .1, boost: 0, particles: []
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
    const {subject, topic, grade, sound} = state;
    state = {subject, topic, grade, sound, number:1, question:null, coins:0, streak:0, correct:0, wrong:0, locked:false, mistakes:[], recent:[]};
    el.finish.hidden = true;
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
    el.world.classList.toggle('is-boss', isBoss);
    el.bossBadge.hidden = !isBoss;
    el.worldTip.textContent = isBoss ? 'BOSS CROSSING！どのゲートに すすむ？' : 'どっちの みちに すすむ？';
    updateDriveControls(isBoss);
  }

  function updateDriveControls(isBoss) {
    el.controlsRow.classList.toggle('is-boss', isBoss);
    for (const btn of el.drives) btn.hidden = isBoss;
    el.controlHint.innerHTML = isBoss
      ? '🎯<span>1〜4キー または<br>みちを タップ！</span>'
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
    const deadline = performance.now() + ANSWER_LIMIT_MS;
    const tick = () => {
      if (state.locked || el.finish.hidden === false) return;
      const remaining = Math.max(0, deadline - performance.now());
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

  function timeoutQuestion() {
    if (state.locked || !state.question) return;
    const q = state.question;
    state.locked = true;
    state.wrong++;
    state.streak = 0;
    state.mistakes.push(q);
    playFeedbackSound(false);
    startDriveAnimation(Math.floor((q.choiceCount || q.choices.length) / 2), false, q.choiceCount || q.choices.length);
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
    drive.mode = 'idle';
    drive.phase = 'cruise';
    drive.turnSide = 0;
    drive.targetLane = 0;
    drive.turnProgress = 0;
    drive.shake = 0;
    drive.flash = 0;
    drive.boost = 0;
    drive.choiceCount = 2;
    drive.isBoss = false;
    drive.selectedChoice = -1;
    drive.junctionDepth = .1;
    drive.particles.length = 0;
  }

  function startDriveAnimation(which, right, choiceCount = 2) {
    drive.choiceCount = choiceCount;
    drive.isBoss = choiceCount > 2;
    drive.selectedChoice = which;
    drive.turnSide = choiceCount === 2 ? (which === 0 ? -1 : 1) : ((which / (choiceCount - 1)) * 2 - 1);
    const side = drive.turnSide < -.18 ? 'left' : drive.turnSide > .18 ? 'right' : '';
    el.world.classList.add('is-driving', right ? 'is-correct-route' : 'is-wrong-route');
    el.world.classList.toggle('is-turning-left', side === 'left');
    el.world.classList.toggle('is-turning-right', side === 'right');
    drive.mode = right ? 'success' : 'miss';
    drive.phase = right ? 'turn' : 'brake';
    drive.targetLane = drive.turnSide * (choiceCount > 2 ? .9 : .82);
    drive.turnProgress = 0;
    drive.shake = right ? .14 : .65;
    drive.flash = 1;
    spawnDriveEffects(which, right);
  }

  function initDriveRenderer() {
    if (!el.canvas) return;
    drive.ctx = el.canvas.getContext('2d');
    if (!drive.ctx) return;
    resizeDriveCanvas();
    window.addEventListener('resize', resizeDriveCanvas, {passive:true});
    drive.lastTime = performance.now();
    drive.frame = window.requestAnimationFrame(renderDriveFrame);
  }

  function resizeDriveCanvas() {
    if (!el.canvas || !drive.ctx) return;
    const rect = el.canvas.getBoundingClientRect();
    drive.dpr = Math.min(window.devicePixelRatio || 1, 2);
    drive.width = Math.max(1, rect.width);
    drive.height = Math.max(1, rect.height);
    el.canvas.width = Math.round(drive.width * drive.dpr);
    el.canvas.height = Math.round(drive.height * drive.dpr);
    drive.ctx.setTransform(drive.dpr, 0, 0, drive.dpr, 0, 0);
  }

  function renderDriveFrame(now) {
    const dt = Math.min(.05, Math.max(0, (now - drive.lastTime) / 1000));
    drive.lastTime = now;
    updateDrive(dt);
    drawDriveScene(now / 1000);
    drive.frame = window.requestAnimationFrame(renderDriveFrame);
  }

  function updateDrive(dt) {
    if (drive.mode === 'success') {
      drive.turnProgress = Math.min(1, drive.turnProgress + dt * 1.08);
      if (drive.turnProgress > .52) drive.phase = 'boost';
      const targetSpeed = drive.phase === 'boost' ? 1.42 : .56;
      drive.speed += (targetSpeed - drive.speed) * Math.min(1, dt * (drive.phase === 'boost' ? 3.2 : 7.2));
      drive.boost += ((drive.phase === 'boost' ? 1 : 0) - drive.boost) * Math.min(1, dt * 5);
    } else if (drive.mode === 'miss') {
      drive.turnProgress = Math.min(1, drive.turnProgress + dt * .7);
      drive.speed += (.33 - drive.speed) * Math.min(1, dt * 5.5);
      drive.boost += (0 - drive.boost) * Math.min(1, dt * 6);
    } else {
      drive.speed += (.12 - drive.speed) * Math.min(1, dt * 4.5);
      drive.boost += (0 - drive.boost) * Math.min(1, dt * 4);
    }
    drive.distance += drive.speed * dt;
    drive.lane += (drive.targetLane - drive.lane) * Math.min(1, dt * 4.8);
    const junctionSpeed = drive.mode === 'idle' ? .055 : drive.mode === 'success' ? .16 : .09;
    drive.junctionDepth = Math.min(.86, drive.junctionDepth + junctionSpeed * dt);
    drive.shake = Math.max(0, drive.shake - dt * 1.35);
    drive.flash = Math.max(0, drive.flash - dt * 1.7);
    for (const particle of drive.particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 38 * dt;
      particle.life -= dt;
    }
    drive.particles = drive.particles.filter(particle => particle.life > 0);
    updateEngineSound();
  }

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function lerp(a, b, amount) { return a + (b - a) * amount; }

  function roadPoint(depth) {
    const p = clamp(depth, 0, 1);
    const horizon = drive.height * .45;
    const turnAmount = drive.turnProgress * drive.turnProgress * (3 - 2 * drive.turnProgress);
    const curve = drive.mode === 'idle'
      ? Math.sin(drive.distance * .65 + p * 2.2) * .025
      : drive.turnSide * turnAmount * (drive.isBoss ? .42 : .34) * Math.pow(p, 1.65);
    return {
      y: horizon + Math.pow(p, 1.58) * (drive.height - horizon + 18),
      center: drive.width / 2 + curve * drive.width,
      width: lerp(drive.width * .06, drive.width * 1.08, Math.pow(p, .86))
    };
  }

  function drawDriveScene(time) {
    const ctx = drive.ctx;
    const w = drive.width;
    const h = drive.height;
    if (!ctx || !w || !h) return;
    ctx.save();
    const shakeAmount = drive.shake * 4;
    ctx.translate(Math.sin(drive.distance * 28) * shakeAmount, Math.cos(drive.distance * 23) * shakeAmount * .45);
    drawSky(ctx, w, h, time);
    drawRoadside(ctx, w, h);
    drawRoad(ctx, w, h);
    drawSpeedLines(ctx, w, h);
    drawCar(ctx, w, h, time);
    drawDriveParticles(ctx);
    if (drive.flash > 0) {
      ctx.fillStyle = `rgba(255, 247, 181, ${drive.flash * .12})`;
      ctx.fillRect(0, 0, w, h);
    }
    const vignette = ctx.createRadialGradient(w / 2, h * .5, h * .18, w / 2, h * .5, h * .8);
    vignette.addColorStop(0, 'rgba(0, 20, 45, 0)');
    vignette.addColorStop(1, 'rgba(0, 25, 55, .24)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  function drawSky(ctx, w, h, time) {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#70cfff');
    sky.addColorStop(.48, '#d7f7ff');
    sky.addColorStop(.49, '#9ee3a0');
    sky.addColorStop(1, '#3fae66');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    const sunX = w * .79 + Math.sin(time * .08) * 5;
    const sunY = h * .14;
    const sunGlow = ctx.createRadialGradient(sunX, sunY, 6, sunX, sunY, 58);
    sunGlow.addColorStop(0, '#fff8a6');
    sunGlow.addColorStop(.4, '#ffe777aa');
    sunGlow.addColorStop(1, '#ffe77700');
    ctx.fillStyle = sunGlow;
    ctx.fillRect(sunX - 60, sunY - 60, 120, 120);
    ctx.fillStyle = '#ffe879';
    ctx.beginPath(); ctx.arc(sunX, sunY, 23, 0, Math.PI * 2); ctx.fill();

    drawCloud(ctx, w * .12 - (drive.distance * 15) % (w * .3), h * .16, 1.05);
    drawCloud(ctx, w * .66 + (drive.distance * 11) % (w * .25), h * .25, .72);

    ctx.fillStyle = '#6dc77e';
    ctx.beginPath();
    ctx.moveTo(0, h * .49);
    for (let x = 0; x <= w; x += 24) ctx.lineTo(x, h * .43 + Math.sin(x * .013 + drive.distance) * 15);
    ctx.lineTo(w, h * .62); ctx.lineTo(0, h * .62); ctx.closePath(); ctx.fill();
  }

  function drawCloud(ctx, x, y, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = '#ffffffb9';
    ctx.beginPath();
    ctx.ellipse(0, 10, 44, 15, 0, 0, Math.PI * 2);
    ctx.arc(-22, 2, 16, 0, Math.PI * 2);
    ctx.arc(2, -5, 23, 0, Math.PI * 2);
    ctx.arc(28, 5, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawRoadside(ctx, w, h) {
    const moving = (drive.distance * 1.05) % 1;
    for (let i = 0; i < 8; i++) {
      const depth = (i / 8 + moving) % 1;
      if (depth < .04) continue;
      const point = roadPoint(depth);
      const size = .14 + depth * .95;
      const side = i % 2 === 0 ? -1 : 1;
      const x = point.center + side * (point.width / 2 + 18 * size);
      drawRoadPost(ctx, x, point.y, size, side);
      if (i % 3 !== 1) drawTree(ctx, x + side * 18 * size, point.y + 3 * size, size * .9, i % 4 === 0 ? '#238d60' : '#2da76a');
    }
  }

  function drawRoadPost(ctx, x, y, size, side) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size, size);
    ctx.fillStyle = '#d7e4d5';
    ctx.fillRect(-2, -34, 4, 34);
    ctx.fillStyle = '#ffe07b';
    ctx.fillRect(-6, -34, 12, 8);
    ctx.fillStyle = '#ffffff99';
    ctx.fillRect(side < 0 ? -7 : 3, -31, 4, 2);
    ctx.restore();
  }

  function drawTree(ctx, x, y, size, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size, size);
    ctx.fillStyle = '#744f3b';
    ctx.fillRect(-3, -28, 6, 28);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, -39, 17, 0, Math.PI * 2);
    ctx.arc(-10, -27, 12, 0, Math.PI * 2);
    ctx.arc(11, -26, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawRoad(ctx, w, h) {
    const segments = 30;
    for (let i = 0; i < segments; i++) {
      const farDepth = i / segments;
      const nearDepth = (i + 1) / segments;
      // 交差点より奥は、一本の道路を描かず、後段の分岐道路だけを描く。
      if (nearDepth < drive.junctionDepth) continue;
      const far = roadPoint(Math.max(farDepth, drive.junctionDepth));
      const near = roadPoint(nearDepth);
      ctx.fillStyle = i % 2 ? '#3b4a5d' : '#43566a';
      ctx.beginPath();
      ctx.moveTo(far.center - far.width / 2, far.y);
      ctx.lineTo(far.center + far.width / 2, far.y);
      ctx.lineTo(near.center + near.width / 2, near.y);
      ctx.lineTo(near.center - near.width / 2, near.y);
      ctx.closePath(); ctx.fill();

      ctx.strokeStyle = i % 2 ? '#e9dca8' : '#fff5c6';
      ctx.lineWidth = Math.max(1, near.width * .012);
      ctx.beginPath();
      ctx.moveTo(far.center - far.width / 2, far.y);
      ctx.lineTo(near.center - near.width / 2, near.y);
      ctx.moveTo(far.center + far.width / 2, far.y);
      ctx.lineTo(near.center + near.width / 2, near.y);
      ctx.stroke();

      const movingDash = Math.floor(drive.distance * 24);
      if ((i + movingDash) % 3 !== 0) continue;
      ctx.strokeStyle = '#dfe8e2cc';
      ctx.lineWidth = Math.max(1, near.width * .016);
      const laneMarks = drive.isBoss ? [-.5, -.17, .17, .5] : [-.33, .33];
      for (const lane of laneMarks) {
        ctx.beginPath();
        ctx.moveTo(far.center + far.width * lane, far.y);
        ctx.lineTo(near.center + near.width * lane, near.y);
        ctx.stroke();
      }
    }

    drawBranchRoads(ctx, w, h);
    if (drive.isBoss) drawBossIntersection(ctx, w, h);
  }

  function drawBranchRoads(ctx, w, h) {
    const count = Math.max(2, drive.choiceCount);
    const junction = roadPoint(drive.junctionDepth);
    const far = roadPoint(.018);
    const branchY = far.y;
    const nearSpread = drive.isBoss ? 1.02 : .96;
    ctx.save();
    ctx.lineJoin = 'round';
    for (let i = 0; i < count; i++) {
      const ratio = i / (count - 1);
      const targetX = w * (.08 + ratio * .84);
      const nearCenter = junction.center + (ratio - .5) * junction.width * nearSpread;
      const nearHalf = Math.max(12, junction.width / (count * 2.15));
      const farHalf = Math.max(9, w * .03, far.width / (count * 1.7));
      const highlighted = drive.selectedChoice === i;
      ctx.fillStyle = highlighted ? '#3c607d' : '#1e354a';
      ctx.beginPath();
      ctx.moveTo(nearCenter - nearHalf, junction.y + 5);
      ctx.lineTo(nearCenter + nearHalf, junction.y + 5);
      ctx.lineTo(targetX + farHalf, branchY);
      ctx.lineTo(targetX - farHalf, branchY);
      ctx.closePath(); ctx.fill();

      ctx.strokeStyle = highlighted ? '#fff0aa' : '#d8d8b6cc';
      ctx.lineWidth = highlighted ? 4 : 2;
      ctx.beginPath();
      ctx.moveTo(nearCenter - nearHalf, junction.y + 5);
      ctx.lineTo(targetX - farHalf, branchY);
      ctx.moveTo(nearCenter + nearHalf, junction.y + 5);
      ctx.lineTo(targetX + farHalf, branchY);
      ctx.stroke();

      ctx.save();
      ctx.setLineDash([8, 11]);
      ctx.strokeStyle = highlighted ? '#ffffffdd' : '#c7d8d5a0';
      ctx.lineWidth = highlighted ? 2.2 : 1;
      ctx.beginPath();
      ctx.moveTo(nearCenter, junction.y);
      ctx.quadraticCurveTo((nearCenter + targetX) / 2, (junction.y + branchY) / 2, targetX, branchY + 2);
      ctx.stroke();
      ctx.restore();
    }
    // 道路の間に草地のゴアを置き、分岐した道路面を明確に分ける。
    ctx.fillStyle = '#63b975';
    ctx.strokeStyle = '#f4dda0';
    ctx.lineWidth = 2.5;
    for (let i = 0; i < count - 1; i++) {
      const ratio = (i + .5) / (count - 1);
      const farX = w * (.08 + ratio * .84);
      const nearX = junction.center + (ratio - .5) * junction.width * nearSpread;
      const farHalf = Math.max(5, w * .018);
      const nearHalf = Math.max(8, junction.width / (count * 1.75));
      ctx.beginPath();
      ctx.moveTo(nearX - nearHalf, junction.y + 9);
      ctx.lineTo(nearX + nearHalf, junction.y + 9);
      ctx.lineTo(farX + farHalf, branchY);
      ctx.lineTo(farX - farHalf, branchY);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle = '#f7dfa0';
    ctx.beginPath();
    ctx.moveTo(junction.center - junction.width * .09, junction.y + 7);
    ctx.lineTo(junction.center + junction.width * .09, junction.y + 7);
    ctx.lineTo(junction.center + 3, junction.y - 18);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawBossIntersection(ctx, w, h) {
    const junction = roadPoint(drive.junctionDepth);
    const crossY = junction.y + 3;
    const crossWidth = Math.max(w * .48, junction.width * 2.2);
    ctx.save();
    ctx.globalAlpha = .92;
    ctx.fillStyle = '#263b50';
    ctx.beginPath();
    ctx.moveTo(junction.center - crossWidth, crossY - 9);
    ctx.lineTo(junction.center + crossWidth, crossY - 9);
    ctx.lineTo(junction.center + crossWidth * .94, crossY + 18);
    ctx.lineTo(junction.center - crossWidth * .94, crossY + 18);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#f8e5a5'; ctx.lineWidth = 3;
    for (let x = junction.center - crossWidth * .8; x < junction.center + crossWidth * .8; x += 32) {
      ctx.beginPath(); ctx.moveTo(x, crossY - 7); ctx.lineTo(x + 8, crossY + 16); ctx.stroke();
    }
    ctx.fillStyle = '#eaffff';
    ctx.fillRect(w * .2, h * .31, w * .6, 5);
    ctx.fillStyle = '#ffcf5c';
    ctx.fillRect(w * .2, h * .31, 8, 34);
    ctx.fillRect(w * .8 - 8, h * .31, 8, 34);
    ctx.fillStyle = '#ff5d73';
    ctx.beginPath(); ctx.arc(w * .5, h * .325, 7, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawSpeedLines(ctx, w, h) {
    const intensity = clamp((drive.speed - .12) * 1.9, 0, 1);
    if (intensity <= 0) return;
    ctx.save();
    ctx.globalAlpha = intensity * (.35 + drive.boost * .35);
    ctx.strokeStyle = '#ffffff';
    ctx.lineCap = 'round';
    for (let i = 0; i < (drive.boost > .2 ? 16 : 9); i++) {
      const x = ((i * 97 + drive.distance * 380) % (w + 80)) - 40;
      const y = h * (.3 + (i % 5) * .12);
      ctx.lineWidth = 1 + (i % 3) + drive.boost * 1.4;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - drive.turnSide * 18, y + 24 + intensity * 28); ctx.stroke();
    }
    if (drive.boost > .3) {
      ctx.globalAlpha = drive.boost * .2;
      ctx.fillStyle = '#baf5ff';
      ctx.fillRect(0, h * .38, w, h * .02);
    }
    ctx.restore();
  }

  function drawCar(ctx, w, h, time) {
    const road = roadPoint(1);
    const rawX = road.center + drive.lane * road.width * .24;
    const x = clamp(rawX, w * .13, w * .87);
    const y = h - 20 + Math.sin(time * 22) * (drive.mode === 'idle' ? 1 : 2.6);
    const tilt = drive.lane * .22 + Math.sin(time * 18) * (drive.mode === 'idle' ? .01 : .025);
    const scale = clamp(w / 620, .62, 1.12);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    ctx.scale(scale, scale);

    if (drive.boost > .05) {
      const flame = 18 + Math.sin(time * 38) * 6 + drive.boost * 22;
      ctx.globalAlpha = .55 + drive.boost * .35;
      ctx.shadowColor = '#ffdf62'; ctx.shadowBlur = 20;
      ctx.fillStyle = '#fff4a3';
      ctx.beginPath(); ctx.moveTo(-22, 3); ctx.lineTo(-9, 2); ctx.lineTo(-15, flame); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(22, 3); ctx.lineTo(9, 2); ctx.lineTo(15, flame); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff8b45';
      ctx.beginPath(); ctx.moveTo(-18, 4); ctx.lineTo(-11, 4); ctx.lineTo(-15, flame * .72); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(18, 4); ctx.lineTo(11, 4); ctx.lineTo(15, flame * .72); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = '#14283e55';
    ctx.beginPath(); ctx.ellipse(0, 7, 47, 11, 0, 0, Math.PI * 2); ctx.fill();

    drawRacingWheel(ctx, -35, -19, time * drive.speed * 8);
    drawRacingWheel(ctx, 35, -19, time * drive.speed * 8);
    drawRacingWheel(ctx, -30, -70, time * drive.speed * 8);
    drawRacingWheel(ctx, 30, -70, time * drive.speed * 8);

    // rear wing and aerodynamic side pods
    ctx.fillStyle = '#101d36';
    roundedRect(ctx, -43, -1, 86, 8, 3); ctx.fill();
    ctx.fillStyle = '#55d8ff';
    ctx.fillRect(-36, -4, 72, 3);
    ctx.fillStyle = '#1c3762';
    roundedRect(ctx, -42, -51, 16, 35, 6); ctx.fill();
    roundedRect(ctx, 26, -51, 16, 35, 6); ctx.fill();

    // low, pointed formula-style body
    const body = ctx.createLinearGradient(-36, -112, 36, 8);
    body.addColorStop(0, '#a8edff'); body.addColorStop(.16, '#53c7ff'); body.addColorStop(.54, '#2479e5'); body.addColorStop(1, '#102f89');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(0, -112);
    ctx.lineTo(14, -94); ctx.lineTo(23, -63); ctx.lineTo(34, -27);
    ctx.lineTo(28, -5); ctx.lineTo(0, 5); ctx.lineTo(-28, -5);
    ctx.lineTo(-34, -27); ctx.lineTo(-23, -63); ctx.lineTo(-14, -94); ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#092d83'; ctx.lineWidth = 3; ctx.stroke();

    // cockpit / canopy
    ctx.fillStyle = '#102c59';
    ctx.beginPath(); ctx.moveTo(-17, -78); ctx.quadraticCurveTo(0, -94, 17, -78); ctx.lineTo(14, -46); ctx.quadraticCurveTo(0, -37, -14, -46); ctx.closePath(); ctx.fill();
    const canopy = ctx.createLinearGradient(0, -83, 0, -43);
    canopy.addColorStop(0, '#efffff'); canopy.addColorStop(.45, '#7ee6ff'); canopy.addColorStop(1, '#2d8fd6');
    ctx.fillStyle = canopy;
    ctx.beginPath(); ctx.moveTo(-12, -76); ctx.quadraticCurveTo(0, -87, 12, -76); ctx.lineTo(10, -51); ctx.quadraticCurveTo(0, -45, -10, -51); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#d9fbff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#ffffffa8'; ctx.fillRect(-7, -73, 4, 20);

    // nose, front wing and neon trim
    ctx.fillStyle = '#e8fbff';
    ctx.beginPath(); ctx.moveTo(-11, -102); ctx.lineTo(0, -114); ctx.lineTo(11, -102); ctx.lineTo(7, -94); ctx.lineTo(-7, -94); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#122451'; ctx.fillRect(-43, -105, 86, 5); ctx.fillRect(-33, -110, 66, 4);
    ctx.strokeStyle = '#7ff5ff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-27, -28); ctx.lineTo(-18, -16); ctx.lineTo(-8, -10); ctx.moveTo(27, -28); ctx.lineTo(18, -16); ctx.lineTo(8, -10); ctx.stroke();
    ctx.fillStyle = '#fff3a7'; ctx.fillRect(-19, -88, 9, 5); ctx.fillRect(10, -88, 9, 5);
    ctx.fillStyle = '#ff617b'; ctx.fillRect(-22, -2, 13, 4); ctx.fillRect(9, -2, 13, 4);
    ctx.restore();
  }

  function drawRacingWheel(ctx, x, y, spin) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(spin);
    ctx.fillStyle = '#111c2c';
    ctx.beginPath(); ctx.ellipse(0, 0, 8, 16, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#91a6bd';
    ctx.beginPath(); ctx.ellipse(0, 0, 3.5, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#dff5ff';
    ctx.fillRect(-1, -6, 2, 12); ctx.restore();
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function drawDriveParticles(ctx) {
    for (const particle of drive.particles) {
      ctx.save();
      ctx.globalAlpha = clamp(particle.life * 1.7, 0, 1);
      ctx.translate(particle.x, particle.y);
      ctx.rotate(particle.life * 7);
      ctx.fillStyle = particle.color;
      if (particle.kind === 'coin') {
        ctx.beginPath(); ctx.arc(0, 0, particle.size, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fff7bd'; ctx.lineWidth = 1; ctx.stroke();
      } else {
        ctx.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size);
      }
      ctx.restore();
    }
  }

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

  function spawnDriveEffects(which, right) {
    const fork = roadPoint(.88);
    const x = fork.center + drive.turnSide * fork.width * .25;
    const y = fork.y - 12;
    const colors = right ? ['#fff7b5', '#ffe36e', '#ffffff'] : ['#ffb17f', '#ff8d72', '#ffe0ae'];
    for (let i = 0; i < 18; i++) {
      const angle = (Math.PI * 2 * i) / 18 + (which ? .12 : -.12);
      const force = 34 + (i % 5) * 10;
      drive.particles.push({
        x, y,
        vx: Math.cos(angle) * force,
        vy: Math.sin(angle) * force - (right ? 18 : 8),
        life: .58 + (i % 4) * .12,
        size: right && i % 4 === 0 ? 6 : 3 + (i % 3),
        kind: right && i % 4 === 0 ? 'coin' : 'spark',
        color: colors[i % colors.length]
      });
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

  state.sound = readLocal('manabi-drive-sound', true);
  el.sound.setAttribute('aria-pressed', String(state.sound));
  el.sound.innerHTML = state.sound ? '🔊 <span>おと ON</span>' : '🔇 <span>おと OFF</span>';
  initDriveRenderer();
  updateTopics();
  resetGame();

  // HTTPS（GitHub Pages 等）または localhost でのみPWAのオフライン機能が動きます。
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(()=>{}));
  }
})();
