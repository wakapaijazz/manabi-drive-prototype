const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = {window: {}, Math};
vm.runInNewContext(fs.readFileSync('questions.js', 'utf8'), context);
const generateQuestion = context.window.StudyQuestions.generateQuestion;
const mathLevels = context.window.StudyQuestions.MATH_LEVELS;
const {
  KANJI, KANJI_SENTENCES, ENGLISH_WORDS, ENGLISH_SENTENCES,
  JUNIOR_ENGLISH_WORDS, JUNIOR_ENGLISH_IDIOMS, JUNIOR_ENGLISH_DIALOGUES, JUNIOR_ENGLISH_FILLINS
} = context.window.StudyQuestions;

assert.equal(KANJI.length, 100, 'the kanji question bank should contain 100 entries');
assert.equal(KANJI_SENTENCES.length, 100, 'the kanji sentence bank should contain 100 entries');
assert.equal(ENGLISH_WORDS.length, 100, 'the English word bank should contain 100 entries');
assert.equal(ENGLISH_SENTENCES.length, 100, 'the English sentence bank should contain 100 entries');
assert.ok(JUNIOR_ENGLISH_WORDS.length >= 40, 'junior English should have a substantial word bank');
assert.ok(JUNIOR_ENGLISH_IDIOMS.length >= 30, 'junior English should have a substantial idiom bank');
assert.ok(JUNIOR_ENGLISH_DIALOGUES.length >= 25, 'junior English should have a substantial dialogue bank');
assert.ok(JUNIOR_ENGLISH_FILLINS.length >= 35, 'junior English should have a substantial fill-in bank');
const allQuestionIds = [...KANJI, ...KANJI_SENTENCES].map(entry => entry.id);
assert.equal(new Set(allQuestionIds).size, allQuestionIds.length, 'kanji question IDs should be unique');
assert.equal(new Set(ENGLISH_WORDS.map(entry => entry.word)).size, ENGLISH_WORDS.length, 'English words should be unique');
for (const entry of KANJI_SENTENCES) {
  assert.ok(entry.text.includes(`【${entry.target}】`), `sentence must contain its target: ${entry.id}`);
}

for (const boss of [false, true]) {
  for (let i = 0; i < 5000; i++) {
    const question = generateQuestion({subject: 'math', topic: 'clock', boss});
    assert.ok(question.choices.length >= 2, 'clock questions must have at least two choices');
    assert.ok(Number.isInteger(question.correctIndex), 'clock correctIndex must be an integer');
    assert.ok(question.correctIndex >= 0 && question.correctIndex < question.choices.length, 'clock correctIndex must be in range');
    assert.equal(question.choices[question.correctIndex], question.answer, 'the answer must be present at correctIndex');
    assert.ok(question.choices.includes(question.answer), 'clock choices must include the answer');
    if (question.visual?.type === 'clock' && question.question.includes('この とけいは')) {
      assert.equal(question.answer, `${question.visual.h}時${String(question.visual.m).padStart(2, '0')}分`, 'read-the-clock answer must match the displayed hands');
    }
  }
}

assert.equal(mathLevels.length, 8, 'the learning path should have eight math levels');
for (const level of mathLevels) {
  for (const boss of [false, true]) {
    for (let i = 0; i < 250; i++) {
      const question = generateQuestion({subject: 'math', topic: 'mix', mathLevel: level.level, boss});
      assert.equal(question.level, level.level, 'mix questions must use the requested math level');
      assert.equal(question.levelTag, level.label, 'math questions must expose their level label');
      const expectedTime = level.level <= 2 ? 10 : level.level <= 4 ? 15 : level.level <= 6 ? 17 : 20;
      assert.equal(question.timeLimitSec, expectedTime, 'math difficulty should set the expected time limit');
      assert.ok(question.choices.includes(question.answer), 'levelled math choices must include the answer');
      assert.equal(question.choices[question.correctIndex], question.answer, 'levelled math answer must match correctIndex');
      if (level.type === 'divideRemainder') {
        assert.match(question.answer, /^\d+ あまり \d+$/, 'remainder division answers must show quotient and remainder');
      }
      if (boss) assert.ok(question.choices.length >= 3, 'boss math questions should have at least three choices');
    }
  }
}

for (const grade of [1, 2, 3]) {
  const question = generateQuestion({subject: 'kanji', topic: 'mix', grade});
  const actualGrade = Number(question.gradeTag.match(/小学(\d)年生/)[1]);
  const expectedTime = actualGrade === 1 ? 10 : actualGrade === 2 ? 15 : 20;
  assert.equal(question.timeLimitSec, expectedTime, 'kanji grade should set the expected time limit');
}

let sentenceFillCount = 0;
let sentenceReadingCount = 0;
for (const boss of [false, true]) {
  for (let i = 0; i < 500; i++) {
    const question = generateQuestion({subject: 'kanji', topic: 'sentence', grade: 3, boss});
    assert.ok(question.visual?.type === 'sentence', 'sentence kanji questions must show a sentence');
    assert.ok(question.choices.includes(question.answer), 'sentence kanji choices must include the answer');
    assert.equal(question.choices[question.correctIndex], question.answer, 'sentence kanji answer must match correctIndex');
    if (question.tag === 'ぶんしょうの かんじ') sentenceFillCount++;
    if (question.tag === 'ぶんしょうの よみ') sentenceReadingCount++;
  }
}
assert.ok(sentenceFillCount > 0, 'sentence kanji questions must include fill-in questions');
assert.ok(sentenceReadingCount > 0, 'sentence kanji questions must include reading questions');

for (let i = 0; i < 500; i++) {
  const question = generateQuestion({subject: 'kanji', topic: 'writing', grade: 3});
  assert.ok(!question.question.includes('に あう かんじ'), 'writing prompts should use natural wording');
}

for (const topic of ['mix', 'words', 'idioms', 'dialogue', 'fill']) {
  for (const boss of [false, true]) {
    for (let i = 0; i < 250; i++) {
      const question = generateQuestion({subject: 'juniorEnglish', topic, boss});
      assert.ok(question.choices.length >= 2, 'junior English questions must have at least two choices');
      assert.ok(question.choices.includes(question.answer), 'junior English choices must include the answer');
      assert.equal(question.choices[question.correctIndex], question.answer, 'junior English answer must match correctIndex');
      assert.match(question.tag, /^中学英語・/, 'junior English questions should identify their section');
      if (topic === 'fill') assert.equal(question.visual?.type, 'sentence', 'fill-in questions should show the sentence');
    }
  }
}

console.log('Clock and sentence-based kanji questions always include their answers.');
