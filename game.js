'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const startScreen = document.getElementById('start-screen');
const startRecords = document.getElementById('start-records');
const startStats = document.getElementById('start-stats');
const playBtn = document.getElementById('play-btn');
const resetRecordsBtn = document.getElementById('reset-records-btn');
const gameoverExtra = document.getElementById('gameover-extra');
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');
const gameoverRecords = document.getElementById('gameover-records');
const gameStats = document.getElementById('game-stats');

const RECORDS_KEY = 'tetris.records';
const MAX_RECORDS = 5;

let gridColor = '#22222e';
let ghostAlpha = 0.2;

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let combo = 0, maxCombo = 0, pendingSave = false;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  const before = lines;
  clearLines();
  // combo: bloqueos consecutivos que limpian al menos una línea
  if (lines > before) {
    combo++;
    maxCombo = Math.max(maxCombo, combo);
  } else {
    combo = 0;
  }
  spawn();
}

function loadRecords() {
  const empty = { top: [], bestCombo: 0, maxLines: 0 };
  try {
    const data = JSON.parse(localStorage.getItem(RECORDS_KEY));
    if (!data || !Array.isArray(data.top)) return empty;
    return {
      top: data.top.filter(e => e && Number.isFinite(e.score)).slice(0, MAX_RECORDS),
      bestCombo: Number(data.bestCombo) || 0,
      maxLines: Number(data.maxLines) || 0,
    };
  } catch (e) {
    return empty;
  }
}

function saveRecords(rec) {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(rec));
  } catch (e) { /* sin almacenamiento: el juego sigue funcionando */ }
}

function qualifies(rec, s) {
  return s > 0 && (rec.top.length < MAX_RECORDS || s > rec.top[rec.top.length - 1].score);
}

function renderRecords(container, rec, highlight) {
  const table = document.createElement('table');
  table.className = 'records-table';
  const head = table.createTHead().insertRow();
  ['#', 'NOMBRE', 'PUNTOS', 'LÍNEAS', 'NIVEL'].forEach(t => {
    const th = document.createElement('th');
    th.textContent = t;
    head.appendChild(th);
  });
  const body = table.createTBody();
  if (!rec.top.length) {
    const td = body.insertRow().insertCell();
    td.colSpan = 5;
    td.className = 'empty';
    td.textContent = 'Sin récords todavía';
  }
  rec.top.forEach((e, i) => {
    const row = body.insertRow();
    if (i === highlight) row.className = 'highlight';
    [i + 1, e.name || 'Anónimo', e.score.toLocaleString(), e.lines ?? 0, e.level ?? 1].forEach(v => {
      row.insertCell().textContent = v;
    });
    if (e.date) row.title = e.date;
  });
  container.replaceChildren(table);
}

function recordsStatsText(rec) {
  return `Mejor combo: ${rec.bestCombo} · Máx. líneas: ${rec.maxLines}`;
}

function showStartScreen() {
  const rec = loadRecords();
  renderRecords(startRecords, rec, -1);
  startStats.textContent = recordsStatsText(rec);
  startScreen.classList.remove('hidden');
  playBtn.focus();
}

function submitName() {
  if (!pendingSave) return;
  const rec = loadRecords();
  const entry = {
    name: nameInput.value.trim() || 'Anónimo',
    score, lines, level,
    date: new Date().toISOString().slice(0, 10),
  };
  const top = rec.top.concat(entry).sort((a, b) => b.score - a.score).slice(0, MAX_RECORDS);
  rec.top = top;
  saveRecords(rec);
  pendingSave = false;
  nameForm.classList.add('hidden');
  renderRecords(gameoverRecords, rec, top.lastIndexOf(entry));
  restartBtn.focus();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, ghostAlpha);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');

  const rec = loadRecords();
  rec.bestCombo = Math.max(rec.bestCombo, maxCombo);
  rec.maxLines = Math.max(rec.maxLines, lines);
  saveRecords(rec);
  gameStats.textContent = `Esta partida: combo ${maxCombo} · líneas ${lines} — ${recordsStatsText(rec)}`;
  gameoverExtra.classList.remove('hidden');
  renderRecords(gameoverRecords, rec, -1);
  if (qualifies(rec, score)) {
    pendingSave = true;
    nameInput.value = '';
    nameForm.classList.remove('hidden');
    nameInput.focus();
  } else {
    pendingSave = false;
    nameForm.classList.add('hidden');
  }
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  if (gameOver || paused) return;
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  // endGame() puede dispararse desde lockPiece() dentro de este mismo frame;
  // su cancelAnimationFrame no detiene el frame en curso, así que no reprogramamos
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function applyTheme(theme) {
  const light = theme === 'light';
  document.documentElement.dataset.theme = theme;
  themeToggle.setAttribute('aria-checked', String(light));
  themeToggle.textContent = light ? '🌙 Tema oscuro' : '☀ Tema claro';
  themeToggle.setAttribute('aria-label', light ? 'Tema oscuro' : 'Tema claro');
  // los colores del canvas se cachean aquí para no leer estilos en cada frame
  const styles = getComputedStyle(document.documentElement);
  gridColor = styles.getPropertyValue('--grid').trim();
  ghostAlpha = parseFloat(styles.getPropertyValue('--ghost-alpha'));
  // repinta aunque el juego esté en pausa o terminado
  if (current) draw();
  else if (board) drawIdle();
}

function drawIdle() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  combo = 0;
  maxCombo = 0;
  pendingSave = false;
  gameoverExtra.classList.add('hidden');
  startScreen.classList.add('hidden');
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  // al escribir el nombre no se procesan teclas de juego
  if (e.target instanceof HTMLInputElement) return;
  // Space sobre un botón enfocado lo activa; no debe además provocar una caída dura
  if (e.code === 'Space' && e.target instanceof HTMLButtonElement) return;
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);
playBtn.addEventListener('click', init);
nameForm.addEventListener('submit', e => {
  e.preventDefault();
  submitName();
});
resetRecordsBtn.addEventListener('click', () => {
  if (!confirm('¿Borrar todos los récords?')) return;
  try {
    localStorage.removeItem(RECORDS_KEY);
  } catch (e) { /* sin almacenamiento */ }
  showStartScreen();
});
themeToggle.addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
});

// el juego no arranca hasta pulsar "Jugar"
board = createBoard();
gameOver = true;
applyTheme('dark');
showStartScreen();
