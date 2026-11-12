/* まなびドライブ：ゲームの表示・操作・セーブ（外部ライブラリ不要） */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const MAX_QUESTIONS = 10;
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
    choices: [$('choiceLeft'), $('choiceRight')], choiceTexts: [$('choiceLeftText'), $('choiceRightText')],
    drives: [$('goLeft'), $('goRight')], world: $('world'), car: $('playerCar'),
    feedback: $('feedback'), fIcon: $('feedbackIcon'), fTitle: $('feedbackTitle'), fText: $('feedbackText'),
    next: $('nextButton'), coins: $('coinCount'), streak: $('streakCount'), counter: $('questionCounter'),
    progress: $('progressFill'), effects: $('effectsLayer'), sound: $('soundButton'),
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
    const {subject, topic, grade, sound} = state;
    state = {subject, topic, grade, sound, number:1, question:null, coins:0, streak:0, correct:0, wrong:0, locked:false, mistakes:[], recent:[]};
    el.finish.hidden = true;
    el.car.classList.remove('steer-left', 'steer-right');
    el.feedback.hidden = true;
    el.effects.replaceChildren();
    nextQuestion();
  }

  function nextQuestion() {
    if (state.number > MAX_QUESTIONS) { showFinish(); return; }
    state.locked = false;
    el.feedback.hidden = true;
    el.feedback.classList.remove('is-error');
    el.car.classList.remove('steer-left', 'steer-right');
    for (const btn of [...el.choices, ...el.drives]) {
      btn.disabled = false;
      btn.classList.remove('is-correct', 'is-wrong');
    }
    for (const stateIcon of document.querySelectorAll('.answer-state')) stateIcon.textContent = '';

    // まちがえた問題は、すこし後で復習として再出題する
    const revisit = state.mistakes.length > 0 && state.number % 4 === 0;
    const q = revisit ? state.mistakes.shift() : window.StudyQuestions.generateQuestion({
      subject:state.subject, topic:state.topic, grade:state.grade, recentIds:state.recent
    });
    state.question = q;
    if (!revisit) state.recent = [...state.recent.slice(-16), q.id];

    el.qText.textContent = q.question;
    el.qKind.textContent = q.tag || ({math:'さんすう',kanji:'かんじ',english:'えいご'}[state.subject]);
    el.qGrade.hidden = !q.gradeTag;
    if (!el.qGrade.hidden) el.qGrade.textContent = q.gradeTag;
    el.choiceTexts[0].textContent = q.choices[0];
    el.choiceTexts[1].textContent = q.choices[1];
    el.speak.hidden = !q.speech;
    el.visual.replaceChildren();
    if (q.visual) renderVisual(q.visual, el.visual);
    updateHud();
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
    state.locked = true;
    const right = which === q.correctIndex;
    if (right) {
      state.correct++;
      state.streak++;
      state.coins += 10 + (state.streak % 3 === 0 ? 5 : 0);
      spawnStars();
      playFeedbackSound(true);
    } else {
      state.wrong++;
      state.streak = 0;
      state.mistakes.push(q);
      playFeedbackSound(false);
    }

    el.car.classList.toggle('steer-left', which === 0);
    el.car.classList.toggle('steer-right', which === 1);
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
    el.next.textContent = state.number >= MAX_QUESTIONS ? 'ゴールへ！ 🏁' : 'つぎの もんだい →';
    el.progress.style.width = `${state.number / MAX_QUESTIONS * 100}%`;
    el.coins.textContent = state.coins;
    el.streak.textContent = state.streak;
    el.next.focus({preventScroll:true});
  }

  function advance() {
    if (!state.locked) return;
    state.number += 1;
    nextQuestion();
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
      for (const [label, n] of [['A',v.a],['B',v.b]]) {
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

  function playFeedbackSound(correct) {
    if (!state.sound) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioContext) audioContext = new Ctx();
      if (audioContext.state === 'suspended') audioContext.resume();
      const now = audioContext.currentTime;
      const notes = correct ? [523.25, 659.25, 783.99] : [392, 349.23];
      for (let i=0; i<notes.length; i++) {
        const oscillator = audioContext.createOscillator();
        const volume = audioContext.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = notes[i];
        volume.gain.setValueAtTime(.0001, now + i*.105);
        volume.gain.exponentialRampToValueAtTime(.07, now + i*.105 + .025);
        volume.gain.exponentialRampToValueAtTime(.0001, now + i*.105 + .2);
        oscillator.connect(volume); volume.connect(audioContext.destination);
        oscillator.start(now + i*.105);
        oscillator.stop(now + i*.105 + .21);
      }
    } catch (_) { /* 音が出ない環境でもゲームは続けられます */ }
  }

  function spawnStars() {
    el.effects.replaceChildren();
    for (let i=0; i<7; i++) {
      const star = makeNode('span', 'effect-star', i%3===0?'🪙':'✨');
      star.style.setProperty('--dx', `${(i-3)*45}px`);
      star.style.setProperty('--dy', `${-65-Math.abs(i-3)*18}px`);
      el.effects.append(star);
    }
    window.setTimeout(()=>el.effects.replaceChildren(), 1000);
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
  el.choices.forEach((btn,i)=>btn.addEventListener('click',()=>choose(i)));
  el.drives.forEach((btn,i)=>btn.addEventListener('click',()=>choose(i)));
  el.next.addEventListener('click',advance);
  el.restart.addEventListener('click',resetGame);
  el.playAgain.addEventListener('click',resetGame);
  el.speak.addEventListener('click',speakEnglish);
  el.sound.addEventListener('click',()=>{
    state.sound = !state.sound;
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
      choose(event.key === 'ArrowLeft' ? 0 : 1);
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
    if (Math.abs(dx)>55 && Math.abs(dx)>Math.abs(dy)*1.7) choose(dx < 0 ? 0 : 1);
    swipeStart = null;
  }, {passive:true});
  el.world.addEventListener('pointercancel', () => { swipeStart = null; }, {passive:true});

  state.sound = readLocal('manabi-drive-sound', true);
  el.sound.setAttribute('aria-pressed', String(state.sound));
  el.sound.innerHTML = state.sound ? '🔊 <span>おと ON</span>' : '🔇 <span>おと OFF</span>';
  updateTopics();
  resetGame();

  // HTTPS（GitHub Pages 等）または localhost でのみPWAのオフライン機能が動きます。
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(()=>{}));
  }
})();
