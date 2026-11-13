/*
 * まなびドライブ：問題データと自動出題ロジック
 * ここを編集すれば、新しい漢字や英語の問題を追加できます。
 *
 * 1問の共通形式:
 * {
 *   id: 'unique-id', question: 'もんだい', choices: ['ひだり', 'みぎ'],
 *   correctIndex: 0 または 1, explanation: 'かいせつ',
 *   visual: { type: '...' } (省略可), speech: '...' (英語のみ、省略可)
 * }
 *
 * file:// でも開けるように、JSONをfetchせず通常のscriptとして読み込みます。
 */
(function () {
  'use strict';

  const KANJI = [
    // grade 1: よみ / かき / じゅくご
    { id:'k1-yama', grade:1, kind:'reading', word:'山', answer:'やま', wrong:'かわ' },
    { id:'k1-kawa', grade:1, kind:'reading', word:'川', answer:'かわ', wrong:'うみ' },
    { id:'k1-mori', grade:1, kind:'reading', word:'森', answer:'もり', wrong:'はやし' },
    { id:'k1-ame', grade:1, kind:'reading', word:'雨', answer:'あめ', wrong:'ゆき' },
    { id:'k1-hana', grade:1, kind:'reading', word:'花', answer:'はな', wrong:'くさ' },
    { id:'k1-sora', grade:1, kind:'reading', word:'空', answer:'そら', wrong:'うみ' },
    { id:'k1-write-water', grade:1, kind:'writing', word:'みず', answer:'水', wrong:'木' },
    { id:'k1-write-fire', grade:1, kind:'writing', word:'ひ（もえる ひ）', answer:'火', wrong:'日' },
    { id:'k1-write-gold', grade:1, kind:'writing', word:'きん', answer:'金', wrong:'玉' },
    { id:'k1-write-tree', grade:1, kind:'writing', word:'き', answer:'木', wrong:'本' },
    { id:'k1-comp-school', grade:1, kind:'compound', word:'学校', answer:'がっこう', wrong:'がくこう' },
    { id:'k1-comp-blue', grade:1, kind:'compound', word:'青空', answer:'あおぞら', wrong:'あおから' },
    { id:'k1-comp-volcano', grade:1, kind:'compound', word:'火山', answer:'かざん', wrong:'ひやま' },
    { id:'k1-comp-book', grade:1, kind:'compound', word:'本日', answer:'ほんじつ', wrong:'ほんひ' },

    // grade 2
    { id:'k2-sea', grade:2, kind:'reading', word:'海', answer:'うみ', wrong:'いけ' },
    { id:'k2-spring', grade:2, kind:'reading', word:'春', answer:'はる', wrong:'あき' },
    { id:'k2-summer', grade:2, kind:'reading', word:'夏', answer:'なつ', wrong:'ふゆ' },
    { id:'k2-autumn', grade:2, kind:'reading', word:'秋', answer:'あき', wrong:'はる' },
    { id:'k2-winter', grade:2, kind:'reading', word:'冬', answer:'ふゆ', wrong:'なつ' },
    { id:'k2-read', grade:2, kind:'reading', word:'読む', answer:'よむ', wrong:'かく' },
    { id:'k2-write-sea', grade:2, kind:'writing', word:'うみ', answer:'海', wrong:'毎' },
    { id:'k2-write-spring', grade:2, kind:'writing', word:'はる', answer:'春', wrong:'秋' },
    { id:'k2-write-star', grade:2, kind:'writing', word:'ほし', answer:'星', wrong:'晴' },
    { id:'k2-write-paper', grade:2, kind:'writing', word:'かみ', answer:'紙', wrong:'雪' },
    { id:'k2-comp-train', grade:2, kind:'compound', word:'電車', answer:'でんしゃ', wrong:'てんしゃ' },
    { id:'k2-comp-weather', grade:2, kind:'compound', word:'天気', answer:'てんき', wrong:'でんき' },
    { id:'k2-comp-read', grade:2, kind:'compound', word:'読書', answer:'どくしょ', wrong:'とくしょ' },
    { id:'k2-comp-clock', grade:2, kind:'compound', word:'時計', answer:'とけい', wrong:'ときけい' },

    // grade 3
    { id:'k3-bridge', grade:3, kind:'reading', word:'橋', answer:'はし', wrong:'かわ' },
    { id:'k3-island', grade:3, kind:'reading', word:'島', answer:'しま', wrong:'やま' },
    { id:'k3-lake', grade:3, kind:'reading', word:'湖', answer:'みずうみ', wrong:'うみべ' },
    { id:'k3-swim', grade:3, kind:'reading', word:'泳ぐ', answer:'およぐ', wrong:'あそぶ' },
    { id:'k3-cold', grade:3, kind:'reading', word:'寒い', answer:'さむい', wrong:'あつい' },
    { id:'k3-travel', grade:3, kind:'reading', word:'旅', answer:'たび', wrong:'みち' },
    { id:'k3-write-bridge', grade:3, kind:'writing', word:'はし（川にかかる）', answer:'橋', wrong:'様' },
    { id:'k3-write-lake', grade:3, kind:'writing', word:'みずうみ', answer:'湖', wrong:'海' },
    { id:'k3-write-island', grade:3, kind:'writing', word:'しま', answer:'島', wrong:'鳥' },
    { id:'k3-write-swim', grade:3, kind:'writing', word:'およぐ', answer:'泳ぐ', wrong:'遊ぐ' },
    { id:'k3-comp-library', grade:3, kind:'compound', word:'図書館', answer:'としょかん', wrong:'ずしょかん' },
    { id:'k3-comp-exercise', grade:3, kind:'compound', word:'運動', answer:'うんどう', wrong:'うんとう' },
    { id:'k3-comp-travel', grade:3, kind:'compound', word:'旅行', answer:'りょこう', wrong:'りょうこう' },
    { id:'k3-comp-study', grade:3, kind:'compound', word:'勉強', answer:'べんきょう', wrong:'べんごう' },
    { id:'k3-comp-station', grade:3, kind:'compound', word:'駅前', answer:'えきまえ', wrong:'やくまえ' }
  ];

  const KANJI_SENTENCES = [
    {id:'ks1-day', grade:1, text:'きょうは よい 【日】 です。', target:'日', fillWrong:'目', reading:'ひ', readingWrong:'め'},
    {id:'ks1-tree', grade:1, text:'大きな 【木】 が あります。', target:'木', fillWrong:'本', reading:'き', readingWrong:'もり'},
    {id:'ks1-book', grade:1, text:'学校で 【本】 を よみます。', target:'本', fillWrong:'木', reading:'ほん', readingWrong:'もと'},
    {id:'ks1-river', grade:1, text:'【川】 で あそびます。', target:'川', fillWrong:'山', reading:'かわ', readingWrong:'うみ'},
    {id:'ks1-sky', grade:1, text:'あさ、【空】 が あおい。', target:'空', fillWrong:'天', reading:'そら', readingWrong:'うみ'},
    {id:'ks2-spring', grade:2, text:'【春】 に 花が さきます。', target:'春', fillWrong:'夏', reading:'はる', readingWrong:'あき'},
    {id:'ks2-summer', grade:2, text:'【夏】 は あついです。', target:'夏', fillWrong:'冬', reading:'なつ', readingWrong:'ふゆ'},
    {id:'ks2-train', grade:2, text:'【電車】 で 駅へ 行く。', target:'電車', fillWrong:'電気', reading:'でんしゃ', readingWrong:'てんしゃ'},
    {id:'ks2-rain', grade:2, text:'【雨】 の 日は かさを さします。', target:'雨', fillWrong:'雪', reading:'あめ', readingWrong:'ゆき'},
    {id:'ks2-star', grade:2, text:'大きな 【星】 を みつけた。', target:'星', fillWrong:'晴', reading:'ほし', readingWrong:'はれ'},
    {id:'ks3-library', grade:3, text:'【図書館】 で 本を かりた。', target:'図書館', fillWrong:'図書室', reading:'としょかん', readingWrong:'ずしょかん'},
    {id:'ks3-trip', grade:3, text:'【旅行】 に 行きます。', target:'旅行', fillWrong:'旅校', reading:'りょこう', readingWrong:'りょうこう'},
    {id:'ks3-bridge', grade:3, text:'川に かかる 【橋】 を わたる。', target:'橋', fillWrong:'様', reading:'はし', readingWrong:'はじ'},
    {id:'ks3-study', grade:3, text:'毎日、【勉強】 を がんばる。', target:'勉強', fillWrong:'努力', reading:'べんきょう', readingWrong:'べんごう'}
  ];

  const ENGLISH_WORDS = [
    { word:'apple', meaning:'りんご', emoji:'🍎' },
    { word:'banana', meaning:'バナナ', emoji:'🍌' },
    { word:'cat', meaning:'ねこ', emoji:'🐈' },
    { word:'dog', meaning:'いぬ', emoji:'🐕' },
    { word:'bird', meaning:'とり', emoji:'🐦' },
    { word:'fish', meaning:'さかな', emoji:'🐟' },
    { word:'car', meaning:'くるま', emoji:'🚗' },
    { word:'bus', meaning:'バス', emoji:'🚌' },
    { word:'book', meaning:'ほん', emoji:'📘' },
    { word:'pen', meaning:'ペン', emoji:'🖊️' },
    { word:'milk', meaning:'ぎゅうにゅう', emoji:'🥛' },
    { word:'water', meaning:'みず', emoji:'💧' },
    { word:'sun', meaning:'たいよう', emoji:'☀️' },
    { word:'moon', meaning:'つき', emoji:'🌙' },
    { word:'star', meaning:'ほし', emoji:'⭐' },
    { word:'piano', meaning:'ピアノ', emoji:'🎹' },
    { word:'tree', meaning:'き', emoji:'🌳' },
    { word:'flower', meaning:'はな', emoji:'🌼' },
    { word:'ball', meaning:'ボール', emoji:'⚽' },
    { word:'cake', meaning:'ケーキ', emoji:'🍰' },
    { word:'orange', meaning:'オレンジ', emoji:'🍊' },
    { word:'egg', meaning:'たまご', emoji:'🥚' },
    { word:'school', meaning:'がっこう', emoji:'🏫' },
    { word:'house', meaning:'いえ', emoji:'🏠' }
  ];

  const ENGLISH_SENTENCES = [
    { english:'I have a pen.', japanese:'わたしは ペンを もっています。' },
    { english:'My name is Bob.', japanese:'わたしの なまえは ボブです。' },
    { english:'How are you?', japanese:'げんきですか？' },
    { english:'I play the piano.', japanese:'わたしは ピアノを ひきます。' },
    { english:'Bob has a big pen.', japanese:'ボブは おおきな ペンを もっています。' },
    { english:'This is a cat.', japanese:'これは ねこです。' },
    { english:'I like bananas.', japanese:'わたしは バナナが すきです。' },
    { english:'She has a dog.', japanese:'かのじょは いぬを かっています。' },
    { english:'It is a red car.', japanese:'それは あかい くるまです。' },
    { english:'The sun is hot.', japanese:'たいようは あついです。' },
    { english:'I see a bird.', japanese:'わたしには とりが みえます。' },
    { english:'I have two books.', japanese:'わたしは ほんを 2さつ もっています。' },
    { english:'Good morning!', japanese:'おはよう！' },
    { english:'Thank you!', japanese:'ありがとう！' }
  ];

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const coin = () => Math.random() < 0.5;
  const fmt = (h, m) => `${h}時${String(m).padStart(2, '0')}分`;
  const clockHour = (h) => ((h - 1) % 12 + 12) % 12 + 1;
  const clockMinute = (m) => ((m % 60) + 60) % 60;
  const clockText = (h, m) => fmt(clockHour(h), clockMinute(m));

  function twoChoices(question, correct, wrong, extra = {}) {
    const correctText = String(correct);
    const wrongText = String(wrong);
    const isLabeledAB = new Set([correctText, wrongText]).size === 2
      && [correctText, wrongText].every(value => value === 'A' || value === 'B');
    const correctIndex = isLabeledAB ? (correctText === 'A' ? 0 : 1) : (coin() ? 0 : 1);
    const choices = isLabeledAB ? ['A', 'B'] : (correctIndex === 0 ? [correctText, wrongText] : [wrongText, correctText]);
    // 問題データを追加・変更しても、正解が選択肢から消えないようにする。
    if (!choices.includes(correctText)) choices[correctIndex] = correctText;
    return {
      id: question.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      interaction: 'route',
      choiceCount: 2,
      question: question.question || question.text || '',
      choices,
      correctIndex: choices.indexOf(correctText),
      answer: correctText,
      explanation: question.explanation || `せいかいは「${correct}」だよ。`,
      ...extra
    };
  }

  function multiChoices(question, choices, correctIndex, extra = {}) {
    const values = choices.map(String);
    return {
      id: question.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      interaction: 'route',
      choiceCount: values.length,
      question: question.question || question.text || '',
      choices: values,
      correctIndex,
      answer: values[correctIndex],
      explanation: question.explanation || `せいかいは「${values[correctIndex]}」だよ。`,
      ...extra
    };
  }

  function bossifyQuestion(q, subject) {
    if (!q || q.choiceCount > 2 || (q.visual?.type === 'compare' && (q.choices || []).every(choice => choice === 'A' || choice === 'B'))) return q;
    const correctText = String(q.answer ?? q.choices[q.correctIndex]);
    const pool = [];
    const numeric = Number(correctText.replaceAll(',', ''));
    if (/^-?\d+(\.\d+)?$/.test(correctText.replaceAll(',', '')) && Number.isFinite(numeric)) {
      const step = Math.max(1, Math.round(Math.abs(numeric) * .1));
      for (const delta of [step, -step, step * 2, -step * 2, 5, -5, 10, -10, 20, -20]) {
        const value = numeric + delta;
        if (value > 0 && Number.isFinite(value)) pool.push(Number.isInteger(value) ? String(value) : value.toFixed(1));
      }
    } else {
      const clock = correctText.match(/^(\d{1,2})時(\d{2})分$/);
      if (clock) {
        const hour = Number(clock[1]);
        const minute = Number(clock[2]);
        pool.push(clockText(hour + 1, minute), clockText(hour, minute + 5), clockText(hour, minute + 10));
      } else if (subject === 'kanji') {
        if (q.tag?.includes('ぶんしょうの かんじ')) pool.push(...KANJI_SENTENCES.map(entry => entry.target));
        else if (q.tag?.includes('ぶんしょうの よみ')) pool.push(...KANJI_SENTENCES.map(entry => entry.reading));
        else {
          const kind = q.tag?.includes('かんじの かきかた') ? 'writing' : q.tag?.includes('じゅくご') ? 'compound' : 'reading';
          pool.push(...KANJI.filter(entry => entry.kind === kind).map(entry => entry.answer));
        }
      } else if (subject === 'english') {
        const isEnglish = /^[A-Za-z]/.test(correctText);
        if (isEnglish && /[ .!?]/.test(correctText)) pool.push(...ENGLISH_SENTENCES.map(entry => entry.english));
        else if (isEnglish) pool.push(...ENGLISH_WORDS.map(entry => entry.word));
        else if (q.speech && q.speech.includes(' ')) pool.push(...ENGLISH_SENTENCES.map(entry => entry.japanese));
        else pool.push(...ENGLISH_WORDS.map(entry => entry.meaning));
      }
    }

    const targetCount = Math.random() < .5 ? 3 : 4;
    const choices = [correctText];
    for (const candidate of [...q.choices, ...pool].sort(() => Math.random() - .5)) {
      const text = String(candidate);
      if (!choices.includes(text)) choices.push(text);
      if (choices.length >= targetCount) break;
    }
    if (choices.length < 3) return q;
    const shuffled = [...choices].sort(() => Math.random() - .5);
    return {
      ...q,
      choices: shuffled,
      choiceCount: shuffled.length,
      correctIndex: shuffled.indexOf(correctText),
      answer: correctText,
      routeMode: 'boss',
      isBoss: true
    };
  }

  // 問題の組み立て方が増えても、正解値が選択肢から消えないよう最後に正規化する。
  function ensureAnswerChoice(q) {
    const choices = (q.choices || []).map(String);
    const answer = String(q.answer ?? choices[q.correctIndex] ?? '');
    let correctIndex = choices.indexOf(answer);
    if (correctIndex < 0) {
      choices[0] = answer;
      correctIndex = 0;
    }
    return {...q, choices, choiceCount: choices.length, correctIndex, answer};
  }

  function wrongNumber(correct, max = 999) {
    const delta = pick([1, 2, 3, 5, 10, 11, 20]);
    const cand = correct + (coin() ? delta : -delta);
    return cand > 0 && cand <= max ? cand : correct + (correct + delta <= max ? delta : -1);
  }

  function mathCalculation(type) {
    if (type === 'addsub') {
      const add = coin();
      let a, b, result;
      if (add) {
        a = rand(1, 949);
        b = rand(1, Math.min(999 - a, rand(10, 230)));
        result = a + b;
      } else {
        a = rand(2, 999);
        b = rand(1, a - 1); // 負の数も0も答えに出さない
        result = a - b;
      }
      const symbol = add ? '＋' : '－';
      return twoChoices({
        question:`${a} ${symbol} ${b} = ?`,
        explanation:`${a} ${symbol} ${b} = ${result} だよ。`
      }, result, wrongNumber(result));
    }
    if (type === 'multiply') {
      const long = Math.random() < 0.42;
      const a = long ? rand(10, 99) : rand(1, 9);
      const b = rand(1, 9);
      const result = a * b;
      return twoChoices({question:`${a} × ${b} = ?`, explanation:`${a} × ${b} = ${result} だよ。`}, result, wrongNumber(result));
    }
    const a = rand(1, 9);
    const b = rand(2, 9);
    const product = a * b;
    return twoChoices({question:`${product} ÷ ${b} = ?`, explanation:`${b} × ${a} = ${product} だから、こたえは ${a}。`}, a, wrongNumber(a, 12));
  }

  function mathBlocks() {
    const count = rand(5, 20);
    return twoChoices({question:'ブロックは ぜんぶで いくつ？', explanation:`ひとつずつ かぞえると、${count}こ あるよ。`}, count, wrongNumber(count, 24), {
      visual: {type:'blocks', count}
    });
  }

  function mathCompare(boss = false) {
    const mode = pick(['count', 'length', 'weight']);
    const a = rand(mode === 'count' ? 3 : 2, mode === 'count' ? 13 : 9);
    let b = rand(mode === 'count' ? 3 : 2, mode === 'count' ? 13 : 9);
    if (a === b) b = a === 9 ? a - 2 : a + 2;
    const count = boss ? (coin() ? 3 : 4) : 2;
    const values = [a, b];
    while (values.length < count) {
      const next = rand(mode === 'count' ? 3 : 2, mode === 'count' ? 13 : 9);
      if (!values.includes(next)) values.push(next);
    }
    const labels = values.map((_, index) => String.fromCharCode(65 + index));
    const correctIndex = values.indexOf(Math.max(...values));
    const correct = labels[correctIndex];
    const wrong = correct === 'A' ? 'B' : 'A';
    const subjectText = mode === 'count' ? 'ブロックが おおい' : mode === 'length' ? 'ぼうが ながい' : 'おもい';
    const unit = mode === 'weight' ? 'kg' : mode === 'count' ? 'こ' : '';
    if (boss) {
      return multiChoices({
        question: `${labels.join('・')}の なかで、どれが ${subjectText}？`,
        explanation: `${values.map((value, index) => `${labels[index]} は ${value}${unit}`).join('、')}。${correct} のほうだよ。`
      }, labels, correctIndex, {
        visual: {type:'compare', mode, items: values.map((value, index) => ({label:labels[index], value}))},
        routeMode: 'boss',
        isBoss: true
      });
    }
    const prompt = mode === 'count' ? 'AとB、どちらの ブロックが おおい？' : mode === 'length' ? 'AとB、どちらの ぼうが ながい？' : 'AとB、どちらが おもい？';
    return twoChoices({question:prompt, explanation:`A は ${a}${unit}、B は ${b}${unit}。${correct} のほうだよ。`}, correct, wrong, {
      visual: {type:'compare', mode, a, b}
    });
  }

  function mathClock() {
    const kind = pick(['read', 'find', 'after']);
    const h = rand(1, 12);
    // 基本は5分刻み、時々1分刻みの問題を出す
    const m = Math.random() < 0.7 ? rand(0, 11) * 5 : rand(0, 59);
    if (kind === 'read') {
      const wrongH = clockHour(h + 1);
      const correct = fmt(h, m);
      const wrong = coin() ? clockText(wrongH, m) : clockText(h, m + 5);
      return twoChoices({question:'この とけいは なんじ なんぷん？', explanation:`みじかい はりが「時」、ながい はりが「分」。${correct} だよ。`}, correct, wrong, {
        visual:{type:'clock', h, m}
      });
    }
    if (kind === 'find') {
      const otherH = clockHour(h + 1);
      const aIsCorrect = coin();
      const a = aIsCorrect ? {h, m} : {h:otherH, m};
      const b = aIsCorrect ? {h:otherH, m} : {h, m};
      return twoChoices({question:`${fmt(h, m)} は どちらの とけい？`, explanation:`${fmt(h, m)} は ${aIsCorrect ? 'A' : 'B'} の とけいだよ。`}, aIsCorrect ? 'A' : 'B', aIsCorrect ? 'B' : 'A', {
        visual:{type:'clock-pair', a, b}
      });
    }
    const hours = rand(1, 3);
    const afterH = clockHour(h + hours);
    const correct = clockText(afterH, m);
    const wrong = clockText(afterH + 1, m);
    return twoChoices({question:`この とけいの ${hours}時間後は？`, explanation:`${fmt(h, m)} から ${hours}時間 すすむと ${correct}。`}, correct, wrong, {
      visual:{type:'clock', h, m}
    });
  }

  function freshItem(items, recentIds) {
    const eligible = items.filter(x => !recentIds.includes(x.id));
    return pick(eligible.length ? eligible : items);
  }

  function kanjiQuestion(topic, grade, recentIds) {
    const kind = topic === 'mix' ? pick(['reading', 'writing', 'compound', 'sentence']) : topic;
    if (kind === 'sentence') {
      const mode = coin() ? 'fill' : 'reading';
      const filteredSentences = KANJI_SENTENCES.filter(x => x.grade <= grade);
      const e = freshItem(filteredSentences, recentIds);
      if (mode === 'fill') {
        const prompt = e.text.replace(`【${e.target}】`, '□');
        return twoChoices({id:`${e.id}-fill`, question:'文の □ に 入る かんじは どれ？', explanation:`文の □ に 入るのは「${e.target}」だよ。`}, e.target, e.fillWrong, {
          tag:'ぶんしょうの かんじ',
          gradeTag:`小学${e.grade}年生`,
          visual:{type:'sentence', text:prompt}
        });
      }
      return twoChoices({id:`${e.id}-reading`, question:`文の「${e.target}」は なんと よむ？`, explanation:`「${e.target}」は「${e.reading}」と よむよ。`}, e.reading, e.readingWrong, {
        tag:'ぶんしょうの よみ',
        gradeTag:`小学${e.grade}年生`,
        visual:{type:'sentence', text:e.text}
      });
    }
    const filtered = KANJI.filter(x => x.grade <= grade && x.kind === kind);
    const e = freshItem(filtered, recentIds);
    const prompt = kind === 'reading' ? `「${e.word}」の よみは？` : kind === 'writing' ? `「${e.word}」を かんじで かくと どれ？` : `「${e.word}」の よみは？`;
    return twoChoices({id:e.id, question:prompt, explanation:`「${e.word}」は「${e.answer}」だよ。`}, e.answer, e.wrong, {
      tag: kind === 'reading' ? 'かんじの よみ' : kind === 'writing' ? 'かんじの かきかた' : 'じゅくごの よみ',
      gradeTag: `小学${e.grade}年生`,
      visual: kind === 'writing' ? {type:'notebook'} : {type:'kanji', word:e.word}
    });
  }

  function englishQuestion(topic, recentIds) {
    const kind = topic === 'mix' ? (Math.random() < 0.58 ? 'words' : 'sentences') : topic;
    if (kind === 'words') {
      const entries = ENGLISH_WORDS.map(x => ({...x, id:`en-word-${x.word}`}));
      const e = freshItem(entries, recentIds);
      const other = pick(entries.filter(x=>x.word!==e.word));
      const fromPicture = coin();
      if (fromPicture) {
        return twoChoices({id:e.id, question:'この えの えいごは どっち？', explanation:`${e.emoji} は英語で「${e.word}」だよ。`}, e.word, other.word, {
          visual:{type:'emoji', emoji:e.emoji}, speech:e.word
        });
      }
      return twoChoices({id:e.id, question:`「${e.word}」の いみは？`, explanation:`${e.word} は「${e.meaning}」という いみだよ。`}, e.meaning, other.meaning, {
        visual:{type:'emoji', emoji:e.emoji}, speech:e.word
      });
    }
    const entries = ENGLISH_SENTENCES.map((x,i)=>({...x, id:`en-sentence-${i}`}));
    const e = freshItem(entries, recentIds);
    const other = pick(entries.filter(x=>x.id!==e.id));
    const toEnglish = Math.random() < 0.32;
    if (toEnglish) {
      return twoChoices({id:e.id, question:`「${e.japanese}」は えいごで？`, explanation:`「${e.english}」だよ。`}, e.english, other.english, {speech:e.english, tag:'えいぶん'});
    }
    return twoChoices({id:e.id, question:`「${e.english}」の いみは？`, explanation:`${e.english} = ${e.japanese}`, }, e.japanese, other.japanese, {speech:e.english, tag:'えいぶん'});
  }

  function generateQuestion({subject='math', topic='mix', grade=3, recentIds=[], boss=false}={}) {
    let question;
    if (subject === 'math') {
      const available = ['addsub', 'multiply', 'divide', 'count', 'compare', 'clock'];
      const kind = topic === 'mix' ? pick(available) : topic;
      if (['addsub','multiply','divide'].includes(kind)) question = {...mathCalculation(kind), tag: {addsub:'たし算・ひき算',multiply:'かけ算',divide:'わり算'}[kind]};
      else if (kind === 'count') question = {...mathBlocks(), tag:'かずを かぞえる'};
      else if (kind === 'compare') question = {...mathCompare(boss), tag:'くらべる'};
      else question = {...mathClock(), tag:'とけい'};
    } else if (subject === 'kanji') {
      question = kanjiQuestion(topic, Number(grade), recentIds);
    } else {
      question = englishQuestion(topic, recentIds);
    }
    question = boss && !question.isBoss ? bossifyQuestion(question, subject) : question;
    return ensureAnswerChoice(question);
  }

  // 開発コンソールからも参照できるように公開
  window.StudyQuestions = {
    generateQuestion,
    KANJI,
    ENGLISH_WORDS,
    ENGLISH_SENTENCES,
    KANJI_SENTENCES
  };
})();
