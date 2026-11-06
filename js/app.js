import { Matting, limitSize } from './matting.js';
import { Editor, RATIO_PRESETS, drawBackground, FONTS, measureTextItem } from './editor.js';
import { t, getLang, setLang, initLang, applyI18n } from './i18n.js';

const MAX_ASSETS = 30;
const MAX_BYTES = 5 * 1024 * 1024;

const $ = (id) => document.getElementById(id);

const state = {
  assets: new Map(),
  matting: new Matting(),
  ready: false,
  engineMode: 'loading',
};

/* ---------------- 通用 UI ---------------- */

function toast(msg, ms = 2600) {
  const box = $('toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 280);
  }, ms);
}

let dialogResolve = null;
function showDialog({ title, desc = '', mediaHTML = '', wide = false, actions = [{ label: t('dlg.ok'), kind: 'primary', value: true }] }) {
  const veil = $('dialog');
  veil.querySelector('.dialog-card').classList.toggle('is-wide', !!wide);
  $('dlgTitle').textContent = title;
  $('dlgDesc').textContent = desc;
  const media = $('dlgMedia');
  if (mediaHTML) {
    media.innerHTML = mediaHTML;
    media.hidden = false;
  } else {
    media.innerHTML = '';
    media.hidden = true;
  }
  const box = $('dlgActions');
  box.innerHTML = '';
  actions.forEach((a) => {
    const b = document.createElement('button');
    b.className = 'btn ' + (a.kind === 'primary' ? 'primary' : 'ghost');
    b.textContent = a.label;
    b.onclick = () => {
      closeDialog(a.value);
      a.onClick?.();
    };
    box.appendChild(b);
  });
  veil.hidden = false;
  return new Promise((resolve) => { dialogResolve = resolve; });
}
function closeDialog(value) {
  $('dialog').hidden = true;
  if (dialogResolve) { dialogResolve(value); dialogResolve = null; }
}

/* ---------------- 素材 ---------------- */

/**
 * 抠图状态全部挂在「画布上这一张」的实例上（item.mode / autoCut / mask）。
 * 素材库里永远只存原图，自动抠图与蒙版都不会回写素材，也不会影响同一素材的其它实例。
 */
function baseForItem(item, asset) {
  if (item.mode === 'auto') return item.autoCut || asset.orig;
  if (item.mode === 'mask') {
    return item.maskBase === 'auto' ? (item.autoCut || asset.orig) : asset.orig;
  }
  return asset.orig;
}

function ensureItemBuffers(item, asset) {
  const w = asset.orig.width;
  const h = asset.orig.height;
  if (!item.composed || item.composed.width !== w || item.composed.height !== h) {
    item.composed = makeCanvas(w, h);
  }
  if (!item.mask || item.mask.width !== w || item.mask.height !== h) {
    item.mask = makeCanvas(w, h);
  }
}

function composeItem(item, asset) {
  ensureItemBuffers(item, asset);
  const ctx = item.composed.getContext('2d');
  ctx.clearRect(0, 0, item.composed.width, item.composed.height);
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(baseForItem(item, asset), 0, 0);
  if (item.mode === 'mask') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(item.mask, 0, 0);
  }
  ctx.globalCompositeOperation = 'source-over';
}

function makeThumb(canvas, size = 220) {
  const k = Math.min(1, size / Math.max(canvas.width, canvas.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(canvas.width * k));
  c.height = Math.max(1, Math.round(canvas.height * k));
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  return c;
}

function createAsset(origCanvas, name) {
  const id = 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const asset = {
    id,
    name,
    orig: origCanvas,      // 原图（完整，不裁剪）—— 素材库只显示这一张
    base: origCanvas,      // 尺寸基准
    thumb: makeThumb(origCanvas),
    autoCutCache: null,    // 自动抠图纯缓存：同一素材多次拖入时不必重复推理
    cutPromise: null,
  };
  state.assets.set(id, asset);
  return asset;
}

function renderLibrary() {
  const lib = $('library');
  [...lib.querySelectorAll('.tile')].forEach((n) => n.remove());
  const empty = $('libEmpty');
  empty.style.display = state.assets.size ? 'none' : '';
  for (const asset of state.assets.values()) {
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.draggable = true;
    tile.dataset.id = asset.id;
    tile.title = '拖拽到画布，或点击放入画布中心';
    const img = document.createElement('img');
    img.src = asset.thumb;
    img.alt = asset.name;
    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '✕';
    del.title = '删除素材';
    del.onclick = (e) => {
      e.stopPropagation();
      requestDelete(asset);
    };
    tile.append(img, del);
    tile.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', asset.id);
      e.dataTransfer.effectAllowed = 'copy';
    });
    tile.addEventListener('click', () => {
      const c = editor.canvasRectScreen();
      const world = editor.screenToWorld(c.x + c.w / 2, c.y + c.h / 2);
      editor.addItemFromAsset(asset.id, world.x + (Math.random() - 0.5) * 40, world.y + (Math.random() - 0.5) * 40);
      updateChrome();
    });
    lib.appendChild(tile);
  }
  $('count').textContent = `${state.assets.size} / ${MAX_ASSETS}`;
  $('count').classList.toggle('is-full', state.assets.size >= MAX_ASSETS);
}

function requestDelete(asset) {
  showDialog({
    title: t('dlg.deleteAsset.title'),
    desc: t('dlg.deleteAsset.desc'),
    actions: [
      { label: t('dlg.cancel'), value: false },
      { label: t('dlg.delete'), kind: 'primary', value: true },
    ],
  }).then((ok) => {
    if (!ok) return;
    state.assets.delete(asset.id);
    editor.removeItemsByAsset(asset.id);
    renderLibrary();
    updateChrome();
    toast(t('toast.assetDeleted'));
  });
}

/* ---------------- 上传 & 抠图 ---------------- */

function pendingTile(name) {
  const lib = $('library');
  const el = document.createElement('div');
  el.className = 'tile loading';
  const badge = document.createElement('div');
  badge.className = 'badge';
  badge.textContent = '读取中…';
  el.appendChild(badge);
  lib.appendChild(el);
  return el;
}

async function addFile(file) {
  const tile = pendingTile(file.name);
  try {
    const bitmap = await loadBitmap(file);
    const MAXW = 1600;
    const k = Math.min(1, MAXW / Math.max(bitmap.width, bitmap.height));
    const src = document.createElement('canvas');
    src.width = Math.max(1, Math.round(bitmap.width * k));
    src.height = Math.max(1, Math.round(bitmap.height * k));
    src.getContext('2d').drawImage(bitmap, 0, 0, src.width, src.height);
    bitmap.close?.();

    // 只读取原图，不自动抠图 —— 抠图在画布上选中素材后手动触发
    const orig = limitSize(src, 1400);
    if (!orig || orig.width < 2 || orig.height < 2) throw new Error('图片尺寸无效');
    createAsset(orig, file.name.replace(/\.[^.]+$/, ''));
    tile.remove();
    renderLibrary();
    return true;
  } catch (err) {
    console.error(err);
    tile.remove();
    renderLibrary();
    toast(t('toast.fileFail', { name: file.name }));
    return false;
  }
}

function loadBitmap(file) {
  if (window.createImageBitmap) {
    return createImageBitmap(file).catch(() => loadImageEl(file));
  }
  return loadImageEl(file);
}
function loadImageEl(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      resolve(c);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片解码失败')); };
    img.src = url;
  });
}

let processing = false;
async function handleFiles(fileList) {
  if (!state.ready) {
    toast(t('toast.notReady'));
    return;
  }
  if (processing) {
    toast(t('toast.busyUpload'));
    return;
  }
  const files = Array.from(fileList || []);
  if (!files.length) return;

  const accepted = [];
  const rejectedType = [];
  const rejectedSize = [];
  for (const f of files) {
    const okType = /^image\/(jpeg|png)$/.test(f.type) || /\.(jpe?g|png)$/i.test(f.name);
    if (!okType) { rejectedType.push(f.name); continue; }
    if (f.size > MAX_BYTES) { rejectedSize.push(f.name); continue; }
    accepted.push(f);
  }
  if (rejectedType.length) {
    const names = rejectedType.slice(0, 2).join('、') + (rejectedType.length > 2 ? (getLang() === 'zh' ? ' 等' : ', …') : '');
    toast(t('toast.badType', { names }), 3200);
  }
  if (rejectedSize.length) {
    const names = rejectedSize[0] + (rejectedSize.length > 1 ? (getLang() === 'zh' ? ' 等' : ' +') : '');
    toast(t('toast.tooBig', { names }), 3200);
  }

  const room = MAX_ASSETS - state.assets.size;
  if (room <= 0) {
    showDialog({
      title: t('dlg.assetMax.title'),
      desc: t('dlg.assetMax.desc'),
      actions: [{ label: t('dlg.ok'), kind: 'primary', value: true }],
    });
    return;
  }
  let queue = accepted;
  if (queue.length > room) {
    toast(t('toast.roomLimit', { max: MAX_ASSETS, n: room }), 3400);
    queue = queue.slice(0, room);
  }

  processing = true;
  $('btnUpload').disabled = true;
  try {
    for (const f of queue) {
      await addFile(f);
      await new Promise((r) => setTimeout(r, 20));
    }
  } finally {
    processing = false;
    $('btnUpload').disabled = !state.ready;
    updateChrome();
  }
}

/* ---------------- 编辑器 ---------------- */

const editor = new Editor({
  scene: $('scene'),
  overlay: $('overlay'),
  workspace: $('workspace'),
  getAsset: (id) => state.assets.get(id),
  onChange: () => updateChrome(),
});

window.__editor = editor;
editor.onCameraChange = (z) => { $('zoomLabel').textContent = Math.round(z * 100) + '%'; };
window.__state = state;

function updateChrome() {
  const sel = editor.selected;
  const bar = $('selbar');
  if (sel) {
    bar.hidden = false;
    const isImg = sel.type === 'image';
    $('imgMode').hidden = !isImg;
    $('imgModeSep').hidden = !isImg;
    if (isImg) {
      const mode = sel.mode || 'original';
      [...$('imgMode').children].forEach((b) => {
        b.classList.toggle('is-on', b.dataset.mode === mode);
      });
    }
  } else {
    bar.hidden = true;
  }
  $('emptyTip').style.opacity = editor.items.length ? '0' : '1';
  $('canvasTag').style.opacity = editor.items.length ? '1' : '0.9';
  $('canvasTag').textContent = t('canvas.tag', {
    w: editor.canvasW, h: editor.canvasH, ratio: editor.ratio,
  });
  $('zoomLabel').textContent = Math.round(editor.cam.z * 100) + '%';
}

/* ---------------- 文字编辑 ---------------- */

let editing = null;
editor.onEditText = (item) => openTextEditor(item);

function openTextEditor(item) {
  const box = $('textEditor');
  const ta = $('textInput');
  editing = { item, original: item.text };
  const corners = editor.itemCorners(item);
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const width = Math.max(180, Math.max(...xs) - left);

  box.hidden = false;
  ta.value = item.text;
  const f = FONTS[item.tier] || FONTS.body;
  ta.style.fontFamily = f.stack;
  ta.style.fontWeight = String(f.weight);
  ta.style.lineHeight = String(f.lineHeight);
  ta.style.fontSize = Math.max(12, item.fontSize * editor.cam.z) + 'px';
  ta.style.width = Math.min(520, Math.max(180, width + 24)) + 'px';
  box.style.left = Math.max(8, left - 12) + 'px';
  box.style.top = Math.max(8, top - 8) + 'px';

  const autosize = () => {
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
  };
  autosize();
  setTimeout(() => { ta.focus(); ta.select(); }, 0);

  const sync = () => {
    const it = editing.item;
    it.text = ta.value || ' ';
    measureTextItem(it);
    editor.dirty = true;
  };
  ta.oninput = () => { autosize(); sync(); };
  ta.onkeydown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      finish(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      finish(false);
    }
    e.stopPropagation();
  };
  ta.onblur = () => finish(true);

  function finish(commit) {
    if (!editing) return;
    const it = editing.item;
    if (!commit) it.text = editing.original;
    it.text = (it.text || '').trim() || ' ';
    measureTextItem(it);
    editing = null;
    box.hidden = true;
    ta.onblur = null;
    editor.dirty = true;
    updateChrome();
  }
}

/* ---------------- 蒙版修图 ---------------- */

const maskState = {
  open: false,
  item: null,        // 正在修图的那一张（画布实例，不是素材）
  asset: null,
  tmp: null,
  baseCanvas: null,
  maskBase: 'orig',
  dw: 0,
  dh: 0,
  dpr: 1,
  mode: 'erase',
  brush: 26,
  drawing: false,
  last: null,
  undo: [],
  redo: [],
  canvas: null,
  ctx: null,
  cursor: null,
};

/* ---------- 自动抠图（按需触发，不在上传时执行） ---------- */

function setModeBusy(busy) {
  [...$('imgMode').children].forEach((b) => { b.disabled = busy; });
  $('selbar').classList.toggle('is-busy', busy);
  $('busyChip').hidden = !busy;
}

async function ensureAutoCut(item, asset) {
  if (item.autoCut) return item.autoCut;
  setModeBusy(true);
  try {
    if (!asset.autoCutCache) {
      if (!asset.cutPromise) {
        asset.cutPromise = state.matting.cutout(asset.orig, { trim: false });
      }
      let cut;
      try {
        cut = await asset.cutPromise;
      } catch (err) {
        asset.cutPromise = null;
        throw err;
      }
      if (!cut || cut.width < 2) {
        asset.cutPromise = null;
        throw new Error('抠图结果为空');
      }
      asset.autoCutCache = cut;
    }
    item.autoCut = asset.autoCutCache;
    return item.autoCut;
  } catch (err) {
    console.error(err);
    toast(t('toast.cutFail'), 3200);
    return null;
  } finally {
    setModeBusy(false);
  }
}

/** 切换「画布上这一张」的显示模式，素材库不受影响 */
async function setItemMode(item, mode) {
  if (!item || item.type !== 'image') return;
  const asset = state.assets.get(item.assetId);
  if (!asset) return;
  if (mode === 'mask') { openMask(); return; }

  if (mode === 'auto') {
    const cut = await ensureAutoCut(item, asset);
    if (!cut) { updateChrome(); return; }
    item.mode = 'auto';
    item.maskBase = 'auto';
    composeItem(item, asset);
  } else {
    // 回到原图：直接丢掉落图缓存，按原始像素绘制，最清晰
    item.mode = 'original';
    item.composed = null;
  }
  editor.dirty = true;
  updateChrome();
}

/* ---------- 蒙版修图 ---------- */

function openMask() {
  const sel = editor.selected;
  if (!sel || sel.type !== 'image') return;
  const asset = state.assets.get(sel.assetId);
  if (!asset) return;
  ensureItemBuffers(sel, asset);

  const maskBase = sel.mode === 'auto' ? 'auto' : sel.mode === 'mask' ? (sel.maskBase || 'orig') : 'orig';
  const baseCanvas = maskBase === 'auto' ? (sel.autoCut || asset.orig) : asset.orig;

  const stage = $('maskStage');
  const canvas = $('maskCanvas');
  $('maskModal').hidden = false;
  const rect = stage.getBoundingClientRect();
  const pad = 24;
  const availW = Math.max(120, rect.width - pad * 2);
  const availH = Math.max(120, rect.height - pad * 2);
  const scale = Math.min(availW / baseCanvas.width, availH / baseCanvas.height);
  const dw = Math.round(baseCanvas.width * scale);
  const dh = Math.round(baseCanvas.height * scale);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(dw * dpr);
  canvas.height = Math.round(dh * dpr);
  canvas.style.width = dw + 'px';
  canvas.style.height = dh + 'px';

  const tmp = makeCanvas(baseCanvas.width, baseCanvas.height);
  tmp.getContext('2d').drawImage(sel.mask, 0, 0);

  maskState.open = true;
  maskState.item = sel;
  maskState.asset = asset;
  maskState.tmp = tmp;
  maskState.baseCanvas = baseCanvas;
  maskState.maskBase = maskBase;
  maskState.scale = scale;
  maskState.dw = dw;
  maskState.dh = dh;
  maskState.dpr = dpr;
  maskState.canvas = canvas;
  maskState.ctx = canvas.getContext('2d');
  maskState.undo = [];
  maskState.redo = [];
  maskState.drawing = false;
  maskState.last = null;
  maskState.mode = 'erase';
  updateMaskHistory();
  [...$('maskMode').children].forEach((x) => x.classList.toggle('is-on', x.dataset.mode === 'erase'));
  $('brushVal').textContent = maskState.brush;
  drawMaskPreview();
}

function drawMaskPreview(cursor) {
  const { ctx, baseCanvas, tmp, dw: w, dh: h, dpr } = maskState;
  if (!ctx) return;
  maskState.cursor = cursor || null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  // 透明底格纹
  const s = 10;
  ctx.save();
  ctx.fillStyle = '#f9f5ee';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#eee7db';
  for (let y = 0; y < h; y += s) {
    for (let x = 0; x < w; x += s) {
      if (((x / s) + (y / s)) % 2 === 0) ctx.fillRect(x, y, s, s);
    }
  }
  ctx.restore();

  // 底图 + 擦除蒙版（默认状态就是完整图片）
  ctx.save();
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(baseCanvas, 0, 0, w, h);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.drawImage(tmp, 0, 0, w, h);
  ctx.restore();

  // 边界（方便看半透明边缘）
  ctx.save();
  ctx.strokeStyle = 'rgba(150,130,105,.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(.5, .5, w - 1, h - 1);
  ctx.restore();

  // 笔刷光标：与真实笔刷同尺寸
  if (cursor) {
    const r = maskState.brush / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cursor.x, cursor.y, r, 0, Math.PI * 2);
    ctx.fillStyle = maskState.mode === 'erase' ? 'rgba(176, 106, 92, .10)' : 'rgba(143, 161, 126, .12)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(45, 38, 30, .72)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cursor.x, cursor.y, Math.max(0.5, r - 1.4), 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, .9)';
    ctx.lineWidth = 1.1;
    ctx.stroke();
    // 圆心十字
    ctx.beginPath();
    ctx.moveTo(cursor.x - 3.5, cursor.y);
    ctx.lineTo(cursor.x + 3.5, cursor.y);
    ctx.moveTo(cursor.x, cursor.y - 3.5);
    ctx.lineTo(cursor.x, cursor.y + 3.5);
    ctx.strokeStyle = 'rgba(45, 38, 30, .55)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }
}

function maskPos(e) {
  const rect = maskState.canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  return {
    x, y,
    ax: (x / rect.width) * maskState.baseCanvas.width,
    ay: (y / rect.height) * maskState.baseCanvas.height,
  };
}

function snapshotTmp() {
  const snap = makeCanvas(maskState.tmp.width, maskState.tmp.height);
  snap.getContext('2d').drawImage(maskState.tmp, 0, 0);
  return snap;
}

function updateMaskHistory() {
  $('maskUndo').disabled = maskState.undo.length === 0;
  $('maskRedo').disabled = maskState.redo.length === 0;
}

/** 新的一笔会清空重做栈 */
function pushUndo() {
  maskState.undo.push(snapshotTmp());
  if (maskState.undo.length > 20) maskState.undo.shift();
  maskState.redo.length = 0;
  updateMaskHistory();
}

function restoreTmp(snap) {
  const ctx = maskState.tmp.getContext('2d');
  ctx.clearRect(0, 0, maskState.tmp.width, maskState.tmp.height);
  ctx.drawImage(snap, 0, 0);
  drawMaskPreview(maskState.cursor);
  updateMaskHistory();
}

function doMaskUndo() {
  if (!maskState.undo.length) return false;
  maskState.redo.push(snapshotTmp());
  restoreTmp(maskState.undo.pop());
  return true;
}

function doMaskRedo() {
  if (!maskState.redo.length) return false;
  maskState.undo.push(snapshotTmp());
  restoreTmp(maskState.redo.pop());
  return true;
}

function strokeTo(p, prev) {
  const { tmp, baseCanvas } = maskState;
  const ctx = tmp.getContext('2d');
  const s = baseCanvas.width / maskState.dw;
  const w = maskState.brush * s;
  ctx.globalCompositeOperation = maskState.mode === 'erase' ? 'source-over' : 'destination-out';
  ctx.strokeStyle = '#000';
  ctx.fillStyle = '#000';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = w;
  try { ctx.filter = 'blur(1px)'; } catch (e) { /* noop */ }
  if (prev) {
    ctx.beginPath();
    ctx.moveTo(prev.ax, prev.ay);
    ctx.lineTo(p.ax, p.ay);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(p.ax, p.ay, w / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  try { ctx.filter = 'none'; } catch (e) { /* noop */ }
  ctx.globalCompositeOperation = 'source-over';
}

function bindMaskCanvas() {
  const canvas = $('maskCanvas');
  canvas.addEventListener('pointerdown', (e) => {
    if (!maskState.open) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    maskState.drawing = true;
    pushUndo();
    const p = maskPos(e);
    maskState.last = p;
    strokeTo(p, null);
    drawMaskPreview(p);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!maskState.open) return;
    const p = maskPos(e);
    if (maskState.drawing) {
      strokeTo(p, maskState.last);
      maskState.last = p;
    }
    drawMaskPreview(p);
  });
  const up = () => { maskState.drawing = false; maskState.last = null; };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('pointerleave', () => {
    if (!maskState.drawing) drawMaskPreview();
  });
}

function closeMask(apply) {
  if (!maskState.open) return;
  const item = maskState.item;
  const asset = maskState.asset;
  if (apply && item && asset) {
    const ctx = item.mask.getContext('2d');
    ctx.clearRect(0, 0, item.mask.width, item.mask.height);
    ctx.drawImage(maskState.tmp, 0, 0);
    item.maskBase = maskState.maskBase;
    item.mode = 'mask';
    composeItem(item, asset);
    editor.dirty = true;
    toast(t('toast.maskUpdated'));
  }
  maskState.open = false;
  maskState.item = null;
  maskState.asset = null;
  maskState.tmp = null;
  maskState.baseCanvas = null;
  $('maskModal').hidden = true;
  updateChrome();
}

/* ---------------- 自定义背景 ---------------- */

const bgState = {
  open: false,
  src: null,
  cx: 0.5,
  cy: 0.5,
  zoom: 1,
  dragging: false,
  lastX: 0,
  lastY: 0,
  w: 0,
  h: 0,
  dpr: 1,
};

function updateBgButton() {
  const has = !!editor.bg;
  $('btnBg').textContent = has ? t('side.bgChange') : t('side.bgAdd');
  $('btnBg').title = t('side.bgEmpty');
  $('btnBgRemove').hidden = !has;
}

/** 背景统一转成 canvas：ImageBitmap 是可 close 的对象，直接留着会在导出时变成 detached */
function normalizeBgSource(bitmap) {
  const MAX = 2400;
  const k = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
  const c = makeCanvas(Math.round(bitmap.width * k), Math.round(bitmap.height * k));
  c.getContext('2d').drawImage(bitmap, 0, 0, c.width, c.height);
  return c;
}

async function loadBgImage(file) {
  try {
    const bitmap = await loadBitmap(file);
    const src = normalizeBgSource(bitmap);
    bitmap.close?.();
    openBgModal(src);
  } catch (err) {
    console.error(err);
    toast(t('toast.bgFail'));
  }
}

function openBgModal(src) {
  bgState.src = src;
  bgState.cx = 0.5;
  bgState.cy = 0.5;
  bgState.zoom = 1;
  bgState.open = true;

  $('bgModal').hidden = false;
  $('bgZoom').value = '100';
  $('bgZoomVal').textContent = '100%';
  $('bgRemove').hidden = !editor.bg;
  $('bgRatioTip').textContent = t('bg.ratio', {
    ratio: editor.ratio, w: editor.canvasW, h: editor.canvasH,
  });
  layoutBgCanvas();
  drawBgPreview();
}

/** 预览画布按当前画布比例铺满弹窗，所见即导出结果 */
function layoutBgCanvas() {
  const stage = $('bgStage');
  const rect = stage.getBoundingClientRect();
  const pad = 18;
  const availW = Math.max(120, rect.width - pad * 2);
  const availH = Math.max(120, rect.height - pad * 2);
  const k = Math.min(availW / editor.canvasW, availH / editor.canvasH);
  const dw = Math.max(80, Math.round(editor.canvasW * k));
  const dh = Math.max(80, Math.round(editor.canvasH * k));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const c = $('bgCanvas');
  c.width = Math.round(dw * dpr);
  c.height = Math.round(dh * dpr);
  c.style.width = dw + 'px';
  c.style.height = dh + 'px';
  bgState.w = dw;
  bgState.h = dh;
  bgState.dpr = dpr;
}

function bgMetrics() {
  const { src, w, h, zoom } = bgState;
  if (!src) return { dw: w, dh: h };
  const s = Math.max(w / src.width, h / src.height) * zoom;
  return { dw: src.width * s, dh: src.height * s };
}

function clampBg() {
  const { dw, dh } = bgMetrics();
  const mx = bgState.w / (2 * dw);
  const my = bgState.h / (2 * dh);
  bgState.cx = Math.min(1 - mx, Math.max(mx, bgState.cx));
  bgState.cy = Math.min(1 - my, Math.max(my, bgState.cy));
}

function drawBgPreview() {
  const c = $('bgCanvas');
  const ctx = c.getContext('2d');
  const { dpr, w, h } = bgState;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.clip();
  if (bgState.src) {
    ctx.imageSmoothingQuality = 'high';
    drawBackground(ctx, w, h, bgState);
  }
  ctx.restore();

  // 三分线
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 253, 249, .38)';
  ctx.lineWidth = 1;
  for (const f of [1 / 3, 2 / 3]) {
    ctx.beginPath();
    ctx.moveTo(Math.round(w * f) + .5, 0);
    ctx.lineTo(Math.round(w * f) + .5, h);
    ctx.moveTo(0, Math.round(h * f) + .5);
    ctx.lineTo(w, Math.round(h * f) + .5);
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(160, 143, 120, .55)';
  ctx.lineWidth = 1;
  ctx.strokeRect(.5, .5, w - 1, h - 1);
  ctx.restore();
}

function bgPos(e) {
  const r = $('bgCanvas').getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function closeBg(apply, remove = false) {
  if (!bgState.open) return;
  if (apply) {
    if (remove) {
      editor.setBackground(null);
      toast(t('toast.bgRemoved'));
    } else if (bgState.src) {
      clampBg();
      editor.setBackground({
        src: bgState.src,
        cx: bgState.cx,
        cy: bgState.cy,
        zoom: bgState.zoom,
      });
      toast(t('toast.bgAdded'));
    }
  }
  bgState.open = false;
  bgState.dragging = false;
  $('bgModal').hidden = true;
  updateBgButton();
  updateChrome();
}

function bindBgCanvas() {
  const c = $('bgCanvas');
  c.addEventListener('pointerdown', (e) => {
    if (!bgState.open) return;
    e.preventDefault();
    c.setPointerCapture(e.pointerId);
    bgState.dragging = true;
    const p = bgPos(e);
    bgState.lastX = p.x;
    bgState.lastY = p.y;
    c.style.cursor = 'grabbing';
  });
  c.addEventListener('pointermove', (e) => {
    if (!bgState.open || !bgState.dragging) return;
    const p = bgPos(e);
    const { dw, dh } = bgMetrics();
    bgState.cx -= (p.x - bgState.lastX) / dw;
    bgState.cy -= (p.y - bgState.lastY) / dh;
    bgState.lastX = p.x;
    bgState.lastY = p.y;
    clampBg();
    drawBgPreview();
  });
  const up = () => {
    bgState.dragging = false;
    c.style.cursor = 'grab';
  };
  c.addEventListener('pointerup', up);
  c.addEventListener('pointercancel', up);
}

/* ---------------- 导出 ---------------- */

async function doExport() {
  const W = editor.canvasW;
  const H = editor.canvasH;
  const bgText = editor.bg ? t('dlg.export.bg') : t('dlg.export.noBg');
  const ok = await showDialog({
    title: t('dlg.export.title'),
    wide: true,
    desc: t('dlg.export.desc', { w: W, h: H, ratio: editor.ratio, bg: bgText }),
    actions: [
      { label: t('dlg.cancel'), value: false },
      { label: t('dlg.export.export'), kind: 'primary', value: true },
    ],
  });
  if (!ok) return;

  try {
    const { blob, canvas } = await editor.exportPNG(2);
    if (!blob) throw new Error('encode failed');

    const url = URL.createObjectURL(blob);
    const name = `moodboard-${editor.ratio.replace(':', 'x')}-${stamp()}.png`;
    triggerDownload(url, name);
    setTimeout(() => URL.revokeObjectURL(url), 120000);

    showDialog({
      title: t('dlg.done.title'),
      desc: t('dlg.done.desc', {
        w: canvas.width, h: canvas.height, bg: bgText,
      }),
      mediaHTML: `<img src="${url}" alt="export preview" />`,
      actions: [
        { label: t('dlg.close'), value: false },
        { label: t('dlg.again'), kind: 'primary', value: true, onClick: () => triggerDownload(url, name) },
      ],
    });
  } catch (err) {
    console.error(err);
    showDialog({
      title: t('dlg.fail.title'),
      desc: t('dlg.fail.desc', { msg: err.message || 'unknown' }),
      actions: [{ label: t('dlg.ok'), kind: 'primary', value: true }],
    });
  }
}

function triggerDownload(url, name) {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => a.remove(), 0);
}
function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

/* ---------------- 模型加载 ---------------- */

function setProgress(p, step) {
  const pct = Math.round(Math.max(0, Math.min(1, p)) * 100);
  $('loaderBar').style.width = pct + '%';
  $('loaderPct').textContent = pct + '%';
  if (step) $('loaderStep').textContent = step;
}

function setEngineTag(mode) {
  state.engineMode = mode;
  refreshEngineTag();
}

/** 语言切换后需要重刷的引擎状态文案 */
function refreshEngineTag() {
  const map = {
    loading: ['', t('engine.loading')],
    ready: ['ready', t('engine.ready')],
    compatWasm: ['warn', t('engine.compatWasm')],
    compatHeuristic: ['warn', t('engine.compatHeuristic')],
  };
  const [cls, text] = map[state.engineMode] || map.loading;
  const tag = $('engineTag');
  tag.className = 'engine-tag ' + cls;
  $('engineText').textContent = text;
}

function unlock() {
  state.ready = true;
  $('btnUpload').disabled = false;
}

/** 模型不可用时静默切到兼容抠图，直接进入界面，不弹任何错误提示 */
function fallbackToCompat(mode) {
  state.matting.useHeuristic();
  setEngineTag(mode || 'compatHeuristic');
  unlock();
  $('loader').hidden = true;
}

async function boot() {
  if (!Matting.wasmSupported()) {
    fallbackToCompat('compatWasm');
    return;
  }
  try {
    await state.matting.init((p, step) => setProgress(p, step));
    setProgress(1, t('engine.ready'));
    setEngineTag('ready');
    unlock();
    setTimeout(() => { $('loader').hidden = true; }, 320);
  } catch (err) {
    console.warn('本地抠图模型加载失败，自动使用兼容模式', err);
    fallbackToCompat('compatHeuristic');
  }
}

/* ---------------- 事件绑定 ---------------- */

function bind() {
  $('btnUpload').onclick = () => $('fileInput').click();
  $('fileInput').onchange = (e) => {
    handleFiles(e.target.files);
    e.target.value = '';
  };

  // 上传区拖拽
  const up = document.querySelector('.upload');
  ['dragenter', 'dragover'].forEach((t) => up.addEventListener(t, (e) => {
    e.preventDefault();
    up.classList.add('dragover');
  }));
  ['dragleave', 'drop'].forEach((t) => up.addEventListener(t, (e) => {
    e.preventDefault();
    up.classList.remove('dragover');
  }));
  up.addEventListener('drop', (e) => {
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
  });

  // 工作区拖拽（素材库拖入 / 文件拖入）
  const ws = $('workspace');
  ws.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  ws.addEventListener('drop', (e) => {
    e.preventDefault();
    const rect = ws.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const id = e.dataTransfer.getData('text/plain');
    if (id && state.assets.has(id)) {
      const w = editor.screenToWorld(sx, sy);
      editor.addItemFromAsset(id, w.x, w.y);
      updateChrome();
      return;
    }
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
  });

  // 顶栏
  $('btnReset').onclick = () => {
    editor.resetView();
    updateChrome();
    toast(t('toast.viewReset'));
  };
  $('btnExport').onclick = doExport;
  $('btnClear').onclick = async () => {
    if (!editor.items.length) { toast(t('toast.canvasEmpty')); return; }
    const ok = await showDialog({
      title: t('dlg.clear.title'),
      desc: t('dlg.clear.desc'),
      actions: [
        { label: t('dlg.cancel'), value: false },
        { label: t('dlg.clear.action'), kind: 'primary', value: true },
      ],
    });
    if (!ok) return;
    editor.items = [];
    editor.select(null);
    editor.dirty = true;
    updateChrome();
    toast(t('toast.canvasCleared'));
  };

  // 语言切换（界面为静态文案，切换后整页重刷 + 画布骨架重绘）
  $('btnLang').onclick = () => {
    setLang(getLang() === 'zh' ? 'en' : 'zh');
    applyI18n();
    $('btnLang').textContent = t('top.lang');
    $('btnLang').title = t('top.lang.title');
    refreshEngineTag();
    updateBgButton();
    updateChrome();
    editor.dirty = true;
  };

  // 画布比例
  $('ratioSeg').addEventListener('click', (e) => {
    const b = e.target.closest('.seg-btn');
    if (!b) return;
    const preset = RATIO_PRESETS.find((p) => p.id === b.dataset.ratio);
    if (!preset) return;
    [...$('ratioSeg').children].forEach((x) => x.classList.toggle('is-on', x === b));
    const changed = editor.setCanvasSize(preset.w, preset.h, preset.id);
    updateChrome();
    if (changed) {
      toast(t('toast.ratioChanged', { ratio: preset.id, w: preset.w, h: preset.h }));
    }
  });

  // 骨架切换
  $('guideSwitch').addEventListener('click', (e) => {
    const btn = e.target.closest('.guide-btn');
    if (!btn) return;
    const i = Number(btn.dataset.guide);
    editor.setGuide(i);
    [...$('guideSwitch').children].forEach((b) => b.classList.toggle('is-on', b === btn));
    $('countBar').hidden = i === 0;
    if (i !== 0) editor.setGuideCount(Number($('countSeg .is-on')?.dataset.count || 5));
  });

  // 位置圆数量（三档）
  $('countSeg').addEventListener('click', (e) => {
    const b = e.target.closest('.seg-btn');
    if (!b) return;
    [...$('countSeg').children].forEach((x) => x.classList.toggle('is-on', x === b));
    editor.setGuideCount(Number(b.dataset.count));
  });

  // 文字
  $('btnAddTitle').onclick = () => {
    const c = editor.canvasRectScreen();
    const w = editor.screenToWorld(c.x + c.w / 2, c.y + c.h / 2);
    editor.addText('title', w.x, w.y - 60);
    updateChrome();
  };
  $('btnAddBody').onclick = () => {
    const c = editor.canvasRectScreen();
    const w = editor.screenToWorld(c.x + c.w / 2, c.y + c.h / 2);
    editor.addText('body', w.x, w.y + 30);
    updateChrome();
  };

  // 选中工具条：图层 + 删除
  $('selbar').addEventListener('click', (e) => {
    const btn = e.target.closest('.selbtn');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'front') editor.bringToFront();
    if (act === 'back') editor.sendToBack();
    if (act === 'delete') editor.removeSelected();
    editor.dirty = true;
    updateChrome();
  });

  // 图片模式：原图 / 自动抠图 / 蒙版修图（只作用于画布上选中的这一张）
  $('imgMode').addEventListener('click', async (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn || btn.disabled) return;
    const sel = editor.selected;
    if (!sel || sel.type !== 'image') return;
    await setItemMode(sel, btn.dataset.mode);
  });

  // 缩放
  $('zoombar').addEventListener('click', (e) => {
    const b = e.target.closest('.zoom-btn');
    if (!b) return;
    const f = b.dataset.zoom === 'in' ? 1.2 : 1 / 1.2;
    editor.zoomBy(f);
    setTimeout(updateChrome, 260);
  });

  // 蒙版
  $('maskClose').onclick = () => closeMask(false);
  $('maskCancel').onclick = () => closeMask(false);
  $('maskDone').onclick = () => closeMask(true);
  $('maskMode').addEventListener('click', (e) => {
    const b = e.target.closest('.seg-btn');
    if (!b) return;
    maskState.mode = b.dataset.mode;
    [...$('maskMode').children].forEach((x) => x.classList.toggle('is-on', x === b));
  });
  $('brushSize').oninput = (e) => {
    maskState.brush = Number(e.target.value);
    $('brushVal').textContent = maskState.brush;
    drawMaskPreview(maskState.cursor);
  };
  $('maskUndo').onclick = () => {
    if (!doMaskUndo()) toast(t('toast.noUndo'));
  };
  $('maskRedo').onclick = () => {
    if (!doMaskRedo()) toast(t('toast.noRedo'));
  };
  $('maskReset').onclick = () => {
    pushUndo();
    const ctx = maskState.tmp.getContext('2d');
    ctx.clearRect(0, 0, maskState.tmp.width, maskState.tmp.height);
    drawMaskPreview(maskState.cursor);
    toast(t('toast.maskReset'));
  };

  // 快捷键：⌘/Ctrl + Z 撤销，⌘/Ctrl + Shift + Z 重做
  window.addEventListener('keydown', (e) => {
    if (!maskState.open) return;
    const meta = e.metaKey || e.ctrlKey;
    if (!meta || e.key.toLowerCase() !== 'z') return;
    e.preventDefault();
    if (e.shiftKey) doMaskRedo(); else doMaskUndo();
  });
  $('maskModal').addEventListener('pointerdown', (e) => {
    if (e.target === $('maskModal')) closeMask(false);
  });
  bindMaskCanvas();

  // 画布背景
  $('btnBg').onclick = () => $('bgFile').click();
  $('bgFile').onchange = (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (f) loadBgImage(f);
  };
  $('btnBgRemove').onclick = () => {
    editor.setBackground(null);
    updateBgButton();
    updateChrome();
    toast(t('toast.bgRemoved'));
  };
  $('bgClose').onclick = () => closeBg(false);
  $('bgCancel').onclick = () => closeBg(false);
  $('bgDone').onclick = () => closeBg(true);
  $('bgRemove').onclick = () => closeBg(true, true);
  $('bgZoom').oninput = (e) => {
    bgState.zoom = Number(e.target.value) / 100;
    $('bgZoomVal').textContent = e.target.value + '%';
    clampBg();
    drawBgPreview();
  };
  $('bgModal').addEventListener('pointerdown', (e) => {
    if (e.target === $('bgModal')) closeBg(false);
  });
  bindBgCanvas();

  // 弹窗背景关闭
  $('dialog').addEventListener('pointerdown', (e) => {
    if (e.target === $('dialog')) closeDialog(false);
  });

  window.addEventListener('resize', () => {
    updateChrome();
    if (bgState.open) {
      layoutBgCanvas();
      drawBgPreview();
    }
  });
  window.addEventListener('beforeunload', (e) => {
    if (editor.items.length) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

/* ---------------- 字体 ---------------- */

/** 自带手写字体必须先落到 document.fonts，canvas 才能用同一套字体绘制与导出 */
function loadHandFonts() {
  if (!document.fonts) return Promise.resolve();
  const faces = [
    '400 24px "MB Script"', '700 24px "MB Script"',
    '400 24px "MB Brush"', '700 24px "MB Brush"',
  ];
  return Promise.all(faces.map((f) => document.fonts.load(f).catch(() => null)))
    .then(() => document.fonts.ready)
    .then(() => {
      for (const it of editor.items) if (it.type === 'text') measureTextItem(it);
      editor.dirty = true;
    })
    .catch(() => {});
}

/* ---------------- 启动 ---------------- */

initLang();
applyI18n();
$('btnLang').textContent = t('top.lang');
$('btnLang').title = t('top.lang.title');

renderLibrary();
updateBgButton();
bind();
updateChrome();
setProgress(0.02, t('loader.step'));
loadHandFonts();
boot();
