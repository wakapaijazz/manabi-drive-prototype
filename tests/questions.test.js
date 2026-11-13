const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = {window: {}, Math};
vm.runInNewContext(fs.readFileSync('questions.js', 'utf8'), context);
const generateQuestion = context.window.StudyQuestions.generateQuestion;

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

console.log('Clock questions always include the answer, including boss and minute-39 cases.');
