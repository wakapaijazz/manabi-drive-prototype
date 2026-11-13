'use strict';
const preview = new DriveScene(document.getElementById('preview'));
let count = 2;
for (const button of document.querySelectorAll('[data-count]')) {
  button.addEventListener('click', () => { count = Number(button.dataset.count); preview.reset(count); });
}
document.getElementById('view').addEventListener('click', event => {
  preview.debugTopDown = !preview.debugTopDown;
  event.currentTarget.textContent = preview.debugTopDown ? '走行視点に戻す' : '上から見る';
});
document.getElementById('left').addEventListener('click', () => preview.startTurn(0, true));
document.getElementById('right').addEventListener('click', () => preview.startTurn(count - 1, true));
function seekTurn(index, progress) {
  preview.reset(count);
  preview.startTurn(index, true);
  preview.phaseStartedAt -= preview.turnDuration * 1000 * progress;
  preview.update(.25, performance.now() / 1000);
}
document.getElementById('left-middle').addEventListener('click', () => seekTurn(0, .72));
document.getElementById('right-end').addEventListener('click', () => seekTurn(count - 1, .98));
let last = performance.now();
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000);
  last = now;
  preview.update(dt, now / 1000);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
