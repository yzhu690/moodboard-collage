/**
 * 画布编辑器：场景渲染 / 拖拽 / 缩放 / 旋转 / 图层 / 构图骨架 / 导出
 * 预览与导出使用同一套绘制逻辑，导出时只保留中心画布区域（尺寸随比例变化）。
 */

import { t } from './i18n.js';

/** 画布比例预设：竖版两档对齐小红书常用尺寸 */
export const RATIO_PRESETS = [
  { id: '4:3', label: '4:3', w: 1200, h: 900, name: '横版', hint: '横版 1200 × 900' },
  { id: '1:1', label: '1:1', w: 1200, h: 1200, name: '方形', hint: '方形 1200 × 1200' },
  { id: '3:4', label: '3:4', w: 1080, h: 1440, name: '竖版', hint: '小红书竖版 1080 × 1440' },
  { id: '9:16', label: '9:16', w: 1080, h: 1920, name: '全屏竖版', hint: '全屏竖版 1080 × 1920' },
];

export const CANVAS_W = 1200;
export const CANVAS_H = 900;

/**
 * 字体：应用自带手写字体（随包分发，Mac / Win 表现一致）
 * 英文 → Caveat（MB Script），中文 → 马善政毛笔楷书（MB Brush），缺字用系统楷体兜底
 */
export const HAND_STACK = "'MB Script', 'MB Brush', 'Kaiti SC', 'STKaiti', 'KaiTi', '楷体', cursive";

export const FONTS = {
  title: {
    stack: HAND_STACK,
    weight: 700,
    lineHeight: 1.3,
  },
  body: {
    stack: HAND_STACK,
    weight: 400,
    lineHeight: 1.62,
  },
};

const measureCtx = document.createElement('canvas').getContext('2d');

export function fontOf(item) {
  const f = FONTS[item.tier] || FONTS.body;
  return `${f.weight} ${item.fontSize}px ${f.stack}`;
}

export function measureTextItem(item) {
  const f = FONTS[item.tier] || FONTS.body;
  measureCtx.font = fontOf(item);
  const lines = String(item.text ?? '').split('\n');
  let maxW = 0;
  for (const line of lines) maxW = Math.max(maxW, measureCtx.measureText(line || ' ').width);
  item.w = Math.max(24, maxW + 6);
  item.h = Math.max(item.fontSize * f.lineHeight, lines.length * item.fontSize * f.lineHeight);
  item.lines = lines;
}

function drawTextBlock(ctx, item) {
  const f = FONTS[item.tier] || FONTS.body;
  const lines = item.lines || String(item.text).split('\n');
  ctx.font = fontOf(item);
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const lh = item.fontSize * f.lineHeight;
  const startY = -((lines.length * lh) / 2);
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], -item.w / 2, startY + i * lh + (lh - item.fontSize) * 0.32);
  }
}

/* ---------------- 构图指引骨架 ---------------- */

function dashCircle(ctx, cx, cy, r, opt = {}) {
  ctx.save();
  ctx.beginPath();
  // 轻微抖动，做出手绘虚线圈的感觉
  const seg = 88;
  const seed = (cx * 0.013 + cy * 0.017) % 6.28;
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const rr = r + Math.sin(a * 3 + seed) * 0.9 + Math.sin(a * 7 + seed * 2) * 0.55;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  if (opt.fill) {
    ctx.fillStyle = opt.fill;
    ctx.fill();
  }
  ctx.setLineDash(opt.dash || [4, 6]);
  ctx.lineWidth = opt.lw || 1;
  ctx.strokeStyle = opt.stroke || 'rgba(112, 100, 84, .46)';
  ctx.stroke();
  if (opt.dot !== false) {
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(cx, cy, 1.6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(118, 106, 90, .30)';
    ctx.fill();
  }
  ctx.restore();
}

/** 主轴曲线：Catmull-Rom 转贝塞尔，虚线手绘感 */
function axisLine(ctx, pts, opt = {}) {
  if (pts.length < 2) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    ctx.bezierCurveTo(c1x, c1y, c2x, c2y, p2[0], p2[1]);
  }
  ctx.setLineDash([7, 9]);
  ctx.lineWidth = opt.lw || 1.25;
  ctx.strokeStyle = opt.stroke || 'rgba(112, 100, 84, .38)';
  ctx.stroke();

  // 主轴两端的小端点
  ctx.setLineDash([]);
  for (const p of [pts[0], pts[pts.length - 1]]) {
    ctx.beginPath();
    ctx.arc(p[0], p[1], 2.2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(118, 106, 90, .30)';
    ctx.fill();
  }
  ctx.restore();
}

function tag(ctx, text, x, y, opt = {}) {
  ctx.save();
  ctx.fillStyle = opt.fill || 'rgba(108, 97, 82, .62)';
  ctx.font = `600 ${opt.size || 10}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = opt.align || 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  ctx.restore();
}

/* 四套骨架 × 三档位置圆（3 / 5 / 8）
   坐标全部归一化（nx, ny 相对画布宽高，rr 相对画布宽度），
   由 solveGuide() 按当前画布比例反解缩放系数，保证每组圆的并集覆盖 ≈54%（留白 ≈46%）。
   这样 4:3 / 1:1 / 3:4 / 9:16 都能维持同一套构图密度，切换比例骨架自动适配。 */
const GUIDE_LAYOUTS = {
  wide: {
    1: {
      3: [[0.250, 0.333, 0.2117], [0.750, 0.333, 0.2117], [0.500, 0.689, 0.2117]],
      5: [[0.250, 0.333, 0.1933], [0.750, 0.333, 0.1933], [0.500, 0.689, 0.1933],
          [0.500, 0.283, 0.1117], [0.888, 0.711, 0.0967]],
      8: [[0.250, 0.333, 0.1842], [0.750, 0.333, 0.1842], [0.500, 0.689, 0.1842],
          [0.500, 0.283, 0.1067], [0.888, 0.711, 0.0925], [0.154, 0.728, 0.0733],
          [0.642, 0.139, 0.0625], [0.379, 0.883, 0.0550]],
    },
    2: {
      3: [[0.342, 0.302, 0.2242], [0.658, 0.502, 0.2242], [0.358, 0.711, 0.2242]],
      5: [[0.342, 0.302, 0.2042], [0.658, 0.502, 0.2042], [0.358, 0.711, 0.2042],
          [0.658, 0.200, 0.1125], [0.583, 0.842, 0.1025]],
      8: [[0.342, 0.302, 0.1900], [0.658, 0.502, 0.1900], [0.358, 0.711, 0.1900],
          [0.658, 0.200, 0.1050], [0.583, 0.842, 0.0950], [0.171, 0.478, 0.0758],
          [0.840, 0.678, 0.0683], [0.500, 0.111, 0.0575]],
    },
    3: {
      3: [[0.250, 0.333, 0.2117], [0.508, 0.711, 0.2117], [0.742, 0.367, 0.2117]],
      5: [[0.250, 0.333, 0.2067], [0.508, 0.711, 0.2067], [0.742, 0.367, 0.2067],
          [0.379, 0.222, 0.1133], [0.667, 0.672, 0.1033]],
      8: [[0.250, 0.333, 0.1925], [0.508, 0.711, 0.1925], [0.742, 0.367, 0.1925],
          [0.379, 0.222, 0.1058], [0.667, 0.672, 0.0958], [0.104, 0.772, 0.0767],
          [0.871, 0.689, 0.0692], [0.583, 0.161, 0.0575]],
    },
    4: {
      3: [[0.500, 0.500, 0.2183], [0.215, 0.287, 0.2183], [0.785, 0.713, 0.2183]],
      5: [[0.500, 0.500, 0.1942], [0.215, 0.287, 0.1942], [0.785, 0.713, 0.1942],
          [0.785, 0.287, 0.1067], [0.215, 0.713, 0.0975]],
      8: [[0.500, 0.500, 0.1842], [0.215, 0.287, 0.1842], [0.785, 0.713, 0.1842],
          [0.785, 0.287, 0.1017], [0.215, 0.713, 0.0925], [0.500, 0.887, 0.0742],
          [0.500, 0.120, 0.0625], [0.893, 0.500, 0.0517]],
    },
  },
  tall: {
    1: {
      3: [[0.300, 0.235, 0.2050], [0.700, 0.245, 0.2050], [0.500, 0.635, 0.2050]],
      5: [[0.300, 0.235, 0.1930], [0.700, 0.245, 0.1930], [0.500, 0.635, 0.1930],
          [0.500, 0.115, 0.1050], [0.815, 0.705, 0.0920]],
      8: [[0.300, 0.235, 0.1830], [0.700, 0.245, 0.1830], [0.500, 0.635, 0.1830],
          [0.500, 0.115, 0.1000], [0.815, 0.705, 0.0880], [0.165, 0.795, 0.0720],
          [0.275, 0.455, 0.0620], [0.615, 0.905, 0.0540]],
    },
    2: {
      3: [[0.355, 0.185, 0.2000], [0.645, 0.480, 0.2000], [0.365, 0.775, 0.2000]],
      5: [[0.355, 0.185, 0.1880], [0.645, 0.480, 0.1880], [0.365, 0.775, 0.1880],
          [0.665, 0.315, 0.0980], [0.675, 0.895, 0.0850]],
      8: [[0.355, 0.185, 0.1780], [0.645, 0.480, 0.1780], [0.365, 0.775, 0.1780],
          [0.665, 0.315, 0.0930], [0.675, 0.895, 0.0810], [0.165, 0.545, 0.0700],
          [0.820, 0.625, 0.0600], [0.500, 0.055, 0.0520]],
    },
    3: {
      3: [[0.325, 0.275, 0.1950], [0.630, 0.545, 0.1950], [0.385, 0.795, 0.1950]],
      5: [[0.325, 0.275, 0.1860], [0.630, 0.545, 0.1860], [0.385, 0.795, 0.1860],
          [0.715, 0.185, 0.1000], [0.215, 0.585, 0.0900]],
      8: [[0.325, 0.275, 0.1760], [0.630, 0.545, 0.1760], [0.385, 0.795, 0.1760],
          [0.715, 0.185, 0.0950], [0.215, 0.585, 0.0850], [0.630, 0.880, 0.0780],
          [0.150, 0.155, 0.0620], [0.835, 0.735, 0.0580]],
    },
    4: {
      3: [[0.500, 0.455, 0.2150], [0.265, 0.245, 0.1900], [0.740, 0.665, 0.1900]],
      5: [[0.500, 0.455, 0.1920], [0.265, 0.245, 0.1760], [0.740, 0.665, 0.1760],
          [0.735, 0.255, 0.0980], [0.255, 0.655, 0.0900]],
      8: [[0.500, 0.455, 0.1820], [0.265, 0.245, 0.1660], [0.740, 0.665, 0.1660],
          [0.735, 0.255, 0.0930], [0.255, 0.655, 0.0860], [0.500, 0.140, 0.0750],
          [0.500, 0.855, 0.0700], [0.135, 0.880, 0.0550]],
    },
  },
};

/** 主轴：同样归一化，横版偏横向铺陈，竖版偏纵向串联 */
const GUIDE_AXES = {
  wide: {
    1: [[0.073, 0.329], [0.275, 0.302], [0.500, 0.287], [0.727, 0.298], [0.927, 0.329]],
    2: [[0.498, 0.107], [0.482, 0.298], [0.523, 0.522], [0.493, 0.896]],
    3: [[0.223, 0.340], [0.358, 0.522], [0.500, 0.718], [0.658, 0.618], [0.733, 0.373]],
    4: [[0.110, 0.629], [0.350, 0.556], [0.500, 0.513], [0.658, 0.551], [0.887, 0.618]],
  },
  tall: {
    1: [[0.065, 0.255], [0.320, 0.235], [0.500, 0.228], [0.690, 0.235], [0.935, 0.258]],
    2: [[0.500, 0.045], [0.470, 0.230], [0.530, 0.500], [0.480, 0.740], [0.500, 0.955]],
    3: [[0.180, 0.300], [0.330, 0.430], [0.500, 0.560], [0.660, 0.640], [0.790, 0.740]],
    4: [[0.090, 0.520], [0.350, 0.480], [0.500, 0.455], [0.660, 0.480], [0.910, 0.520]],
  },
};

const GUIDE_TARGET = 0.54;   // 圆的并集覆盖画布 54%，留白 46%
const guidePoolCache = new Map();

/** 反解缩放系数：让这一组圆的并集面积恰好占画布 54% */
function solveGuide(layout, W, H) {
  const N = 80;
  const stepX = W / N;
  const stepY = H / N;
  let lo = 0.08;
  let hi = 4;
  for (let it = 0; it < 24; it++) {
    const k = (lo + hi) / 2;
    let hit = 0;
    for (let iy = 0; iy < N; iy++) {
      const py = (iy + 0.5) * stepY;
      for (let ix = 0; ix < N; ix++) {
        const px = (ix + 0.5) * stepX;
        for (let j = 0; j < layout.length; j++) {
          const cx = layout[j][0] * W;
          const cy = layout[j][1] * H;
          const r = layout[j][2] * W * k;
          const dx = px - cx;
          const dy = py - cy;
          if (dx * dx + dy * dy <= r * r) { hit++; break; }
        }
      }
    }
    if (hit / (N * N) < GUIDE_TARGET) lo = k; else hi = k;
  }
  const k = (lo + hi) / 2;
  return layout.map(([nx, ny, rr]) => [nx * W, ny * H, rr * W * k]);
}

function guidePool(index, count, W, H) {
  const orient = H > W ? 'tall' : 'wide';
  const key = `${orient}-${index}-${count}-${W}x${H}`;
  if (guidePoolCache.has(key)) return guidePoolCache.get(key);
  const layout = (GUIDE_LAYOUTS[orient][index] || {})[count] || [];
  const pool = layout.length ? solveGuide(layout, W, H) : [];
  guidePoolCache.set(key, pool);
  return pool;
}

function drawGuide(ctx, index, count, W, H) {
  const FILL = 'rgba(118, 106, 90, .03)';
  const S = 'rgba(112, 100, 84, .50)';
  const SS = 'rgba(112, 100, 84, .30)';
  const n = [3, 5, 8].includes(count) ? count : 5;
  const pool = guidePool(index, n, W, H);
  const orient = H > W ? 'tall' : 'wide';
  const axis = (GUIDE_AXES[orient][index] || []).map(([nx, ny]) => [nx * W, ny * H]);

  ctx.save();
  ctx.lineJoin = 'round';

  // 主轴：一条贯穿构图的虚线
  axisLine(ctx, axis);

  // 纵向骨架的两条极淡阅读轨道
  if (index === 2) {
    for (const fx of [0.25, 0.75]) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(fx * W, H * 0.10);
      ctx.lineTo(fx * W, H * 0.94);
      ctx.setLineDash([2, 10]);
      ctx.strokeStyle = 'rgba(118, 106, 90, .12)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
  }

  const marks = {
    1: ['01', '02', '03'],
    2: ['Ⅰ', 'Ⅱ', 'Ⅲ'],
    3: ['A', 'B', 'C'],
    4: [],
  }[index] || [];

  for (let i = 0; i < pool.length; i++) {
    const [cx, cy, r] = pool[i];
    dashCircle(ctx, cx, cy, r, { fill: FILL, stroke: i < 3 ? S : SS });
    if (marks[i]) {
      tag(ctx, marks[i], cx, cy - r - 11, {
        size: index === 2 ? 12 : 9,
        align: 'center',
        fill: 'rgba(108, 97, 82, .48)',
      });
    }
  }

  // 文案：边距按画布尺寸取比例，竖版不会跑出画面
  const padX = W * 0.075;
  const padTop = H * 0.052;
  const padBot = H * 0.045;
  const soft = 'rgba(108, 97, 82, .48)';

  if (index === 1) {
    tag(ctx, t('guide.1.title.canvas'), padX, padTop, { size: 10 });
    tag(ctx, t('guide.1.sub'), W / 2, H - padBot, { align: 'center', size: 10, fill: soft });
  } else if (index === 2) {
    tag(ctx, t('guide.2.title.canvas'), padX, padTop, { size: 10 });
    tag(ctx, t('guide.2.sub'), padX, H - padBot, { size: 10, fill: soft });
  } else if (index === 3) {
    tag(ctx, t('guide.3.title.canvas'), padX, padTop, { size: 10 });
    tag(ctx, t('guide.3.sub'), padX, H - padBot, { size: 10, fill: soft });
  } else if (index === 4) {
    dashCircle(ctx, W / 2, H / 2, W * 0.08, { fill: 'transparent', stroke: SS, dash: [2, 9] });
    tag(ctx, t('guide.4.title.canvas'), padX, padTop, { size: 10 });
    tag(ctx, t('guide.4.sub'), padX, H - padBot, { size: 10, fill: soft });
  }

  if (index > 0) {
    tag(ctx, t('guide.meta', {
      index, name: t(`guide.name.${index}`), count: n,
    }), W - W * 0.06, H - padBot, {
      size: 9, align: 'right', fill: 'rgba(108, 97, 82, .38)',
    });
  }
  ctx.restore();
}

/* ---------------- 编辑器 ---------------- */

export class Editor {
  constructor({ scene, overlay, workspace, getAsset, onChange }) {
    this.scene = scene;
    this.overlay = overlay;
    this.workspace = workspace;
    this.getAsset = getAsset;
    this.onChange = onChange || (() => {});

    this.ctx = scene.getContext('2d');
    this.octx = overlay.getContext('2d');

    this.items = [];
    this.selected = null;
    this.cam = { x: 0, y: 0, z: 1 };
    this.tgt = { x: 0, y: 0, z: 1 };

    // 画布尺寸：默认 4:3 横版，可在四档比例间切换
    this.canvasW = CANVAS_W;
    this.canvasH = CANVAS_H;
    this.ratio = '4:3';

    // 自定义背景：{ src, cx, cy, zoom }（cx/cy 是图片上对齐画布中心的归一化位置）
    this.bg = null;

    this.guideIndex = 0;
    this.guideAlpha = 0;
    this.guideCount = 5;
    this.guidePrev = 0;
    this.guidePrevAlpha = 0;

    this.drag = null;
    this.hover = null;
    this.spaceDown = false;
    this.dirty = true;
    this._lastZ = -1;
    this.lastT = performance.now();
    this._fitPending = true;
    this._loop = this._loop.bind(this);
    this._checker = null;

    this._bind();
    this._observe();
    requestAnimationFrame(this._loop);
  }

  /* ---- 尺寸 / 背景 ---- */
  _observe() {
    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(this.workspace);
    this.resize();
  }

  resize() {
    const rect = this.workspace.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(1, rect.width);
    this.h = Math.max(1, rect.height);
    this.dpr = dpr;
    for (const c of [this.scene, this.overlay]) {
      c.width = Math.round(this.w * dpr);
      c.height = Math.round(this.h * dpr);
      c.style.width = this.w + 'px';
      c.style.height = this.h + 'px';
    }
    if (this._fitPending) {
      this.fit(false);
      this._fitPending = false;
    }
    this.dirty = true;
  }

  fit(animate = true) {
    const padX = 96;
    const padY = 88;
    const z = Math.min((this.w - padX * 2) / this.canvasW, (this.h - padY * 2) / this.canvasH);
    const zz = Math.max(0.08, Math.min(1.4, z));
    const tx = (this.w - this.canvasW * zz) / 2;
    const ty = (this.h - this.canvasH * zz) / 2;
    if (animate) {
      this.tgt = { x: tx, y: ty, z: zz };
    } else {
      this.cam = { x: tx, y: ty, z: zz };
      this.tgt = { ...this.cam };
    }
    this.dirty = true;
  }

  /**
   * 切换画布比例。素材不重排、不缩放，只整体平移 (Δw/2, Δh/2)，
   * 让原有构图仍然居中：出画的素材留在原处，导出时按新画布裁切。
   */
  setCanvasSize(w, h, ratioId) {
    if (w === this.canvasW && h === this.canvasH) {
      if (ratioId) this.ratio = ratioId;
      return false;
    }
    const dx = (w - this.canvasW) / 2;
    const dy = (h - this.canvasH) / 2;
    for (const it of this.items) {
      it.x += dx;
      it.y += dy;
    }
    this.canvasW = w;
    this.canvasH = h;
    if (ratioId) this.ratio = ratioId;
    this.fit(true);
    this.dirty = true;
    this.emitChange();
    return true;
  }

  setBackground(bg) {
    this.bg = bg || null;
    this.dirty = true;
    this.emitChange();
  }

  resetView() {
    this.fit(true);
    this.selected = null;
    this.syncSelectionUI();
  }

  zoomBy(factor, cx = this.w / 2, cy = this.h / 2) {
    this.zoomAt(cx, cy, this.tgt.z * factor);
  }

  zoomAt(sx, sy, newZ) {
    const z0 = this.tgt.z;
    const z1 = Math.min(4, Math.max(0.1, newZ));
    if (Math.abs(z1 - z0) < 1e-5) return;
    const wx = (sx - this.tgt.x) / z0;
    const wy = (sy - this.tgt.y) / z0;
    this.tgt.z = z1;
    this.tgt.x = sx - wx * z1;
    this.tgt.y = sy - wy * z1;
    this.dirty = true;
  }

  screenToWorld(sx, sy) {
    return { x: (sx - this.cam.x) / this.cam.z, y: (sy - this.cam.y) / this.cam.z };
  }

  canvasRectScreen() {
    const { x, y, z } = this.cam;
    return { x, y, w: this.canvasW * z, h: this.canvasH * z };
  }

  /* ---- 素材 ---- */
  addItemFromAsset(assetId, worldX, worldY, extra = {}) {
    const asset = this.getAsset(assetId);
    if (!asset) return null;
    const box = 300;
    const ar = asset.base.width / asset.base.height;
    let w = box;
    let h = box;
    if (ar > 1) h = box / ar; else w = box * ar;
    const item = {
      id: 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      type: 'image',
      assetId,
      x: worldX,
      y: worldY,
      w, h,
      rot: 0,
      // 抠图状态挂在“画布上的这一张”上：素材库永远保持原图
      mode: 'original',   // original | auto | mask
      autoCut: null,      // 该实例的自动抠图结果
      mask: null,         // 该实例的擦除蒙版
      maskBase: 'orig',   // 蒙版作用在哪个底图上：orig | auto
      composed: null,     // 该实例当前合成结果（原图模式为 null，直接画原图）
      ...extra,
    };
    this.items.push(item);
    this.select(item);
    this.emitChange();
    this.dirty = true;
    return item;
  }

  addText(tier, worldX, worldY) {
    const isTitle = tier === 'title';
    const item = {
      id: 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      type: 'text',
      tier,
      text: isTitle ? '标题文字' : '在这里写下你的想法',
      fontSize: isTitle ? 64 : 26,
      x: worldX,
      y: worldY,
      w: 0, h: 0,
      rot: 0,
    };
    measureTextItem(item);
    this.items.push(item);
    this.select(item);
    this.emitChange();
    this.dirty = true;
    return item;
  }

  removeSelected() {
    if (!this.selected) return;
    const idx = this.items.indexOf(this.selected);
    if (idx >= 0) this.items.splice(idx, 1);
    this.selected = null;
    this.syncSelectionUI();
    this.emitChange();
    this.dirty = true;
  }

  removeItemsByAsset(assetId) {
    const before = this.items.length;
    this.items = this.items.filter((it) => it.assetId !== assetId);
    if (this.selected && this.selected.assetId === assetId) {
      this.selected = null;
      this.syncSelectionUI();
    }
    if (before !== this.items.length) {
      this.emitChange();
      this.dirty = true;
    }
  }

  select(item) {
    this.selected = item || null;
    this.syncSelectionUI();
    this.dirty = true;
  }

  syncSelectionUI() {
    this.emitChange();
  }

  emitChange() {
    this.onChange(this.selected);
  }

  bringToFront() {
    if (!this.selected) return;
    const i = this.items.indexOf(this.selected);
    if (i < 0) return;
    this.items.splice(i, 1);
    this.items.push(this.selected);
    this.dirty = true;
  }

  sendToBack() {
    if (!this.selected) return;
    const i = this.items.indexOf(this.selected);
    if (i < 0) return;
    this.items.splice(i, 1);
    this.items.unshift(this.selected);
    this.dirty = true;
  }

  setGuideCount(n) {
    this.guideCount = n;
    if (this.guideAlpha > 0.45) this.guideAlpha = 0.45;
    this.dirty = true;
  }

  /** 当前画布比例下某套骨架的位置圆（供渲染与自检使用） */
  guidePool(index = this.guideIndex, count = this.guideCount) {
    return guidePool(index, count, this.canvasW, this.canvasH);
  }

  setGuide(i) {
    if (i === this.guideIndex) return;
    this.guidePrev = this.guideIndex;
    this.guidePrevAlpha = this.guideAlpha;
    this.guideIndex = i;
    this.guideAlpha = 0;
    this.dirty = true;
  }

  /* ---- 命中检测 ---- */
  itemCorners(item) {
    const c = Math.cos(item.rot);
    const s = Math.sin(item.rot);
    const hw = item.w / 2;
    const hh = item.h / 2;
    const local = [
      [-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh],
    ];
    const z = this.cam.z;
    return local.map(([lx, ly]) => ({
      x: (item.x + lx * c - ly * s) * z + this.cam.x,
      y: (item.y + lx * s + ly * c) * z + this.cam.y,
    }));
  }

  topCenter(item) {
    const c = Math.cos(item.rot);
    const s = Math.sin(item.rot);
    const z = this.cam.z;
    return {
      x: (item.x - (item.h / 2) * s) * z + this.cam.x,
      y: (item.y - (item.h / 2) * c) * z + this.cam.y,
      nx: s, ny: -c,
    };
  }

  rotateHandlePos(item) {
    const t = this.topCenter(item);
    return { x: t.x + t.nx * 30, y: t.y + t.ny * 30 };
  }

  hitHandle(sx, sy) {
    if (!this.selected) return null;
    const r = this.rotateHandlePos(this.selected);
    if (Math.hypot(sx - r.x, sy - r.y) <= 13) return { kind: 'rotate' };
    const corners = this.itemCorners(this.selected);
    for (let i = 0; i < 4; i++) {
      if (Math.hypot(sx - corners[i].x, sy - corners[i].y) <= 11) {
        return { kind: 'scale', index: i };
      }
    }
    return null;
  }

  hitItem(sx, sy) {
    const p = this.screenToWorld(sx, sy);
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      const c = Math.cos(-it.rot);
      const s = Math.sin(-it.rot);
      const dx = p.x - it.x;
      const dy = p.y - it.y;
      const lx = dx * c - dy * s;
      const ly = dx * s + dy * c;
      if (Math.abs(lx) <= it.w / 2 && Math.abs(ly) <= it.h / 2) return it;
    }
    return null;
  }

  /* ---- 交互 ---- */
  _bind() {
    const el = this.overlay;

    el.addEventListener('pointerdown', (e) => {
      if (e.button === 2) return;
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      el.setPointerCapture(e.pointerId);
      const handle = this.hitHandle(sx, sy);

      if (this.spaceDown || e.button === 1 || (!handle && !this.hitItem(sx, sy))) {
        if (!handle && !this.hitItem(sx, sy)) this.select(null);
        this.drag = {
          kind: 'pan', sx, sy, cx: this.cam.x, cy: this.cam.y,
          tx: this.tgt.x, ty: this.tgt.y,
        };
        el.style.cursor = 'grabbing';
        return;
      }

      if (handle) {
        const item = this.selected;
        const world = this.screenToWorld(sx, sy);
        const centerDist = Math.hypot(world.x - item.x, world.y - item.y);
        this.drag = {
          kind: handle.kind,
          item,
          sx, sy,
          startRot: item.rot,
          startAngle: Math.atan2(world.y - item.y, world.x - item.x),
          startW: item.w,
          startH: item.h,
          startFont: item.fontSize || 0,
          centerDist: Math.max(8, centerDist),
          startPos: { x: item.x, y: item.y },
        };
        return;
      }

      const hit = this.hitItem(sx, sy);
      if (hit) {
        this.select(hit);
        const world = this.screenToWorld(sx, sy);
        this.drag = {
          kind: 'move', item: hit, sx, sy,
          wx: world.x, wy: world.y,
          startX: hit.x, startY: hit.y,
          moved: false,
        };
        el.style.cursor = 'grabbing';
      }
    });

    el.addEventListener('pointermove', (e) => {
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const d = this.drag;

      if (!d) {
        // hover 光标
        const h = this.hitHandle(sx, sy);
        if (h) el.style.cursor = h.kind === 'rotate' ? 'grab' : 'nwse-resize';
        else el.style.cursor = this.hitItem(sx, sy) ? 'move' : (this.spaceDown ? 'grab' : 'default');
        return;
      }

      if (d.kind === 'pan') {
        const dx = sx - d.sx;
        const dy = sy - d.sy;
        this.cam.x = d.cx + dx;
        this.cam.y = d.cy + dy;
        this.tgt.x = this.cam.x;
        this.tgt.y = this.cam.y;
        this.dirty = true;
        return;
      }

      if (d.kind === 'move') {
        const world = this.screenToWorld(sx, sy);
        d.item.x = d.startX + (world.x - d.wx);
        d.item.y = d.startY + (world.y - d.wy);
        if (Math.abs(sx - d.sx) + Math.abs(sy - d.sy) > 2) d.moved = true;
        this.dirty = true;
        return;
      }

      if (d.kind === 'scale') {
        const world = this.screenToWorld(sx, sy);
        const dist = Math.hypot(world.x - d.item.x, world.y - d.item.y);
        const factor = Math.max(0.05, dist / d.centerDist);
        if (d.item.type === 'text') {
          const fs = Math.max(8, Math.min(420, d.startFont * factor));
          d.item.fontSize = fs;
          measureTextItem(d.item);
        } else {
          d.item.w = Math.max(24, d.startW * factor);
          d.item.h = Math.max(24, d.startH * factor);
        }
        this.dirty = true;
        return;
      }

      if (d.kind === 'rotate') {
        const world = this.screenToWorld(sx, sy);
        const ang = Math.atan2(world.y - d.item.y, world.x - d.item.x);
        let rot = d.startRot + (ang - d.startAngle);
        if (e.shiftKey) rot = Math.round(rot / (Math.PI / 12)) * (Math.PI / 12);
        d.item.rot = rot;
        this.dirty = true;
      }
    });

    const endDrag = (e) => {
      if (!this.drag) return;
      this.drag = null;
      el.style.cursor = 'default';
      this.emitChange();
      try { el.releasePointerCapture(e.pointerId); } catch (err) { /* noop */ }
    };
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);

    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * 0.0016);
      this.zoomAt(e.clientX - rect.left, e.clientY - rect.top, this.tgt.z * factor);
    }, { passive: false });

    el.addEventListener('dblclick', (e) => {
      const rect = el.getBoundingClientRect();
      const hit = this.hitItem(e.clientX - rect.left, e.clientY - rect.top);
      if (hit && hit.type === 'text') {
        this.select(hit);
        this.onEditText?.(hit);
      }
    });

    window.addEventListener('keydown', (e) => {
      const tag = (e.target?.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || e.target?.isContentEditable;
      if (e.code === 'Space' && !typing) {
        this.spaceDown = true;
        if (!this.drag) this.overlay.style.cursor = 'grab';
      }
      if (typing) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && this.selected) {
        e.preventDefault();
        this.removeSelected();
      }
      if (e.key === 'Escape') this.select(null);
      if (this.selected && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        if (e.key === 'ArrowLeft') this.selected.x -= step;
        if (e.key === 'ArrowRight') this.selected.x += step;
        if (e.key === 'ArrowUp') this.selected.y -= step;
        if (e.key === 'ArrowDown') this.selected.y += step;
        this.dirty = true;
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        this.spaceDown = false;
        if (!this.drag) this.overlay.style.cursor = 'default';
      }
    });
  }

  /* ---- 渲染循环 ---- */
  _loop(t) {
    const dt = Math.min(60, t - this.lastT);
    this.lastT = t;

    // 相机缓动
    const k = 1 - Math.pow(0.001, dt / 1000);
    let anim = false;
    if (Math.abs(this.tgt.z - this.cam.z) > 1e-4) {
      this.cam.z += (this.tgt.z - this.cam.z) * k;
      anim = true;
    }
    if (Math.abs(this.tgt.x - this.cam.x) > 0.15) {
      this.cam.x += (this.tgt.x - this.cam.x) * k;
      anim = true;
    }
    if (Math.abs(this.tgt.y - this.cam.y) > 0.15) {
      this.cam.y += (this.tgt.y - this.cam.y) * k;
      anim = true;
    }
    if (anim) {
      this.dirty = true;
      if (Math.abs(this.tgt.z - this._lastZ) > 0.0005) {
        this._lastZ = this.tgt.z;
        this.onCameraChange?.(this.cam.z);
      }
    }

    // 骨架淡入淡出
    const targetAlpha = this.guideIndex === 0 ? 0 : 1;
    if (Math.abs(this.guideAlpha - targetAlpha) > 0.004) {
      this.guideAlpha += (targetAlpha - this.guideAlpha) * Math.min(1, dt / 150);
      this.dirty = true;
    } else if (this.guideAlpha !== targetAlpha) {
      this.guideAlpha = targetAlpha;
      this.dirty = true;
    }
    if (this.guidePrevAlpha > 0.004) {
      this.guidePrevAlpha *= Math.pow(0.02, dt / 260);
      this.dirty = true;
    } else if (this.guidePrevAlpha !== 0) {
      this.guidePrevAlpha = 0;
      this.dirty = true;
    }

    if (this.dirty) {
      this.dirty = false;
      this.render();
      this.renderOverlay();
    }
    requestAnimationFrame(this._loop);
  }

  _makeChecker() {
    const c = document.createElement('canvas');
    c.width = 24;
    c.height = 24;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fdfbf6';
    ctx.fillRect(0, 0, 24, 24);
    ctx.fillStyle = '#faf6ee';
    ctx.fillRect(0, 0, 12, 12);
    ctx.fillRect(12, 12, 12, 12);
    return c;
  }

  render() {
    const ctx = this.ctx;
    const { dpr, w, h } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // 灰色暂放区
    ctx.fillStyle = '#e8e3da';
    ctx.fillRect(0, 0, w, h);
    this._drawDots(ctx);

    const r = this.canvasRectScreen();

    // 中心画布（透明底提示 + 轻微投影）
    ctx.save();
    ctx.shadowColor = 'rgba(88, 72, 53, .16)';
    ctx.shadowBlur = 34;
    ctx.shadowOffsetY = 12;
    ctx.fillStyle = '#fdfbf6';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    if (!this._checker) this._checker = this._makeChecker();
    ctx.fillStyle = ctx.createPattern(this._checker, 'repeat');
    ctx.globalAlpha = 0.6;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.globalAlpha = 1;

    // 自定义背景（在画布内、素材之下）
    if (this.bg) {
      ctx.save();
      ctx.translate(this.cam.x, this.cam.y);
      ctx.scale(this.cam.z, this.cam.z);
      drawBackground(ctx, this.canvasW, this.canvasH, this.bg);
      ctx.restore();
    }
    ctx.restore();

    // 构图骨架（位于内容之下）
    if (this.guidePrevAlpha > 0.004 && this.guidePrev > 0) {
      this._drawGuideLayer(ctx, this.guidePrev, this.guidePrevAlpha, r);
    }
    if (this.guideAlpha > 0.004 && this.guideIndex > 0) {
      this._drawGuideLayer(ctx, this.guideIndex, this.guideAlpha, r);
    }

    // 素材 & 文字
    for (const item of this.items) this._drawItem(ctx, item, this.cam);

    // 画布边界提示
    this._drawFrame(ctx, r);
  }

  _drawDots(ctx) {
    const gap = 26;
    ctx.save();
    ctx.fillStyle = 'rgba(120, 106, 88, .085)';
    for (let y = gap / 2; y < this.h; y += gap) {
      for (let x = gap / 2; x < this.w; x += gap) {
        ctx.fillRect(x, y, 1, 1);
      }
    }
    ctx.restore();
  }

  _drawGuideLayer(ctx, index, alpha, r) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    ctx.globalAlpha = alpha;
    ctx.translate(this.cam.x, this.cam.y);
    ctx.scale(this.cam.z, this.cam.z);
    drawGuide(ctx, index, this.guideCount, this.canvasW, this.canvasH);
    ctx.restore();
  }

  _drawFrame(ctx, r) {
    ctx.save();
    ctx.strokeStyle = 'rgba(160, 143, 120, .55)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 6]);
    ctx.strokeRect(r.x + .5, r.y + .5, r.w - 1, r.h - 1);
    ctx.setLineDash([]);

    // 四角记号
    ctx.strokeStyle = 'rgba(150, 130, 105, .8)';
    ctx.lineWidth = 1.6;
    const arm = 14;
    const pts = [
      [r.x, r.y, 1, 1], [r.x + r.w, r.y, -1, 1],
      [r.x, r.y + r.h, 1, -1], [r.x + r.w, r.y + r.h, -1, -1],
    ];
    for (const [x, y, sx, sy] of pts) {
      ctx.beginPath();
      ctx.moveTo(x + sx * arm, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + sy * arm);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawItem(ctx, item, cam, exportMode = false) {
    if (item.type === 'image') {
      const asset = this.getAsset(item.assetId);
      const src = item.composed || (asset && (asset.orig || asset.base));
      if (!src) return;
      ctx.save();
      ctx.translate(item.x * cam.z + cam.x, item.y * cam.z + cam.y);
      ctx.scale(cam.z, cam.z);
      ctx.rotate(item.rot);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(src, -item.w / 2, -item.h / 2, item.w, item.h);
      ctx.restore();
    } else {
      if (!item.lines) measureTextItem(item);
      ctx.save();
      ctx.translate(item.x * cam.z + cam.x, item.y * cam.z + cam.y);
      ctx.scale(cam.z, cam.z);
      ctx.rotate(item.rot);
      drawTextBlock(ctx, item);
      ctx.restore();
    }
  }

  renderOverlay() {
    const ctx = this.octx;
    const { dpr, w, h } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const sel = this.selected;
    if (!sel) return;

    const corners = this.itemCorners(sel);

    // 浅色外框
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(corners[i].x, corners[i].y);
    ctx.closePath();
    ctx.strokeStyle = 'rgba(176, 138, 104, .95)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 253, 249, .75)';
    ctx.lineWidth = 2.6;
    ctx.globalAlpha = .5;
    ctx.stroke();
    ctx.restore();

    // 旋转手柄
    const t = this.topCenter(sel);
    const rot = this.rotateHandlePos(sel);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(t.x, t.y);
    ctx.lineTo(rot.x, rot.y);
    ctx.strokeStyle = 'rgba(176, 138, 104, .75)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(rot.x, rot.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#fffdf9';
    ctx.fill();
    ctx.stroke();
    // 旋转小弧
    ctx.beginPath();
    ctx.arc(rot.x, rot.y, 2.6, 0.4, Math.PI * 1.55);
    ctx.strokeStyle = 'rgba(150, 113, 79, .95)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();

    // 四角缩放手柄
    ctx.save();
    for (const c of corners) {
      ctx.beginPath();
      ctx.rect(c.x - 4.5, c.y - 4.5, 9, 9);
      ctx.fillStyle = '#fffdf9';
      ctx.fill();
      ctx.strokeStyle = 'rgba(164, 126, 92, .95)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ---- 导出 ---- */
  async exportPNG(superSample = 2) {
    const W = this.canvasW;
    const H = this.canvasH;
    // 先在 2 倍尺寸无背景绘制，再降采样到实际画布尺寸，边缘更干净（超采样抗锯齿）
    const big = document.createElement('canvas');
    big.width = W * superSample;
    big.height = H * superSample;
    const bctx = big.getContext('2d');
    bctx.setTransform(superSample, 0, 0, superSample, 0, 0);
    bctx.save();
    bctx.beginPath();
    bctx.rect(0, 0, W, H);
    bctx.clip();
    if (this.bg) drawBackground(bctx, W, H, this.bg);
    for (const item of this.items) {
      this._drawItem(bctx, item, { x: 0, y: 0, z: 1 }, true);
    }
    bctx.restore();

    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(big, 0, 0, W, H);

    const blob = await new Promise((resolve) => c.toBlob(resolve, 'image/png'));
    return { blob, canvas: c };
  }
}

/**
 * 背景绘制：把图片按「铺满画布」缩放后再乘 zoom，并以 (cx, cy) 对齐画布中心。
 * 存的是归一化位置而不是裁切矩形，所以切换画布比例时背景会自动重新铺满。
 */
export function drawBackground(ctx, W, H, bg) {
  if (!bg || !bg.src) return;
  const { src, zoom = 1 } = bg;
  const cx = bg.cx ?? 0.5;
  const cy = bg.cy ?? 0.5;
  const s = Math.max(W / src.width, H / src.height) * zoom;
  const dw = src.width * s;
  const dh = src.height * s;
  ctx.drawImage(src, W / 2 - cx * dw, H / 2 - cy * dh, dw, dh);
}
