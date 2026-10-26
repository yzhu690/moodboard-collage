/**
 * 本地抠图引擎
 * - 主通道：u2netp (ONNX) + onnxruntime-web (WASM)，模型与运行时全部本地加载，
 *   图片数据只在浏览器内存里处理，绝不上传。
 * - 兜底通道：纯 JS 边缘泛洪分割（模型不可用时手动切换）
 */

const MODEL_URL = new URL('../models/u2netp.onnx', import.meta.url).href;
const VENDOR_URL = new URL('../vendor/', import.meta.url).href;
const INPUT_SIZE = 320;

export class Matting {
  constructor() {
    this.ort = null;
    this.session = null;
    this.mode = 'model';
    this.inputName = '';
    this.outputName = '';
  }

  static wasmSupported() {
    try {
      return typeof WebAssembly === 'object'
        && typeof WebAssembly.instantiate === 'function'
        && typeof WebAssembly.Memory === 'function';
    } catch (e) {
      return false;
    }
  }

  /** 加载运行时 + 模型，onProgress(0~1, 文案) */
  async init(onProgress = () => {}) {
    onProgress(0.04, '检查运行环境…');

    // 1) 运行时（WASM）
    onProgress(0.10, '加载本地推理运行时…');
    const ort = await import('../vendor/ort.wasm.min.mjs');
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.simd = true;
    ort.env.wasm.proxy = true;   // 推理放到 Worker，主线程不卡住
    ort.env.wasm.wasmPaths = VENDOR_URL;
    this.ort = ort;
    onProgress(0.28, '推理运行时已就绪');

    // 2) 模型文件（带下载进度）
    onProgress(0.32, '下载本地抠图模型…');
    const buf = await fetchWithProgress(MODEL_URL, (p) => {
      onProgress(0.32 + p * 0.5, `加载抠图模型 ${Math.round(p * 100)}%`);
    });

    onProgress(0.86, '初始化模型会话…');
    try {
      this.session = await ort.InferenceSession.create(buf, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      });
    } catch (err) {
      console.warn('Worker 推理不可用，回退主线程', err);
      ort.env.wasm.proxy = false;
      this.session = await ort.InferenceSession.create(buf, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      });
    }
    this.inputName = this.session.inputNames[0];
    this.outputName = this.session.outputNames[0];
    this.mode = 'model';
    onProgress(1, '模型已就绪');
  }

  /** 兼容模式：不依赖模型 */
  useHeuristic() {
    this.mode = 'heuristic';
  }

  get ready() {
    return this.mode === 'heuristic' || !!this.session;
  }

  /**
   * 输入一张 canvas（原图），输出抠好的透明底 canvas
   * opts.trim = false 时保持与原图同尺寸（用于在画布上与其它状态对齐切换）
   */
  async cutout(srcCanvas, opts = {}) {
    const doTrim = opts.trim !== false;
    const W = srcCanvas.width;
    const H = srcCanvas.height;

    let alphaMask;
    if (this.mode === 'model' && this.session) {
      try {
        alphaMask = await this._modelAlpha(srcCanvas);
      } catch (err) {
        console.warn('模型推理失败，退回兼容模式', err);
        alphaMask = this._heuristicAlpha(srcCanvas);
        this.mode = 'heuristic';
      }
    } else {
      alphaMask = this._heuristicAlpha(srcCanvas);
    }

    // 应用到原图
    const out = document.createElement('canvas');
    out.width = W;
    out.height = H;
    const ctx = out.getContext('2d');
    ctx.drawImage(srcCanvas, 0, 0);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(alphaMask, 0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';

    return doTrim ? trimCanvas(out, 3) : out;
  }

  /** 模型前向：输出与原图同尺寸的 alpha mask（灰度存于 alpha 通道） */
  async _modelAlpha(srcCanvas) {
    const ort = this.ort;
    const N = INPUT_SIZE;

    const small = document.createElement('canvas');
    small.width = N;
    small.height = N;
    const sctx = small.getContext('2d', { willReadFrequently: true });
    sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(srcCanvas, 0, 0, N, N);
    const px = sctx.getImageData(0, 0, N, N).data;

    const mean = [0.485, 0.456, 0.406];
    const std = [0.229, 0.224, 0.225];
    const area = N * N;
    const data = new Float32Array(3 * area);
    for (let i = 0; i < area; i++) {
      const r = px[i * 4] / 255;
      const g = px[i * 4 + 1] / 255;
      const b = px[i * 4 + 2] / 255;
      data[i] = (r - mean[0]) / std[0];
      data[area + i] = (g - mean[1]) / std[1];
      data[area * 2 + i] = (b - mean[2]) / std[2];
    }

    const tensor = new ort.Tensor('float32', data, [1, 3, N, N]);
    const feeds = {};
    feeds[this.inputName] = tensor;
    const results = await this.session.run(feeds);
    const pred = results[this.outputName].data;

    // min-max 归一化
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < pred.length; i++) {
      const v = pred[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const span = Math.max(1e-6, max - min);

    const maskSmall = document.createElement('canvas');
    maskSmall.width = N;
    maskSmall.height = N;
    const mctx = maskSmall.getContext('2d');
    const img = mctx.createImageData(N, N);
    for (let i = 0; i < area; i++) {
      let v = (pred[i] - min) / span;
      // 收紧一点点边缘，减少毛边光晕
      v = smoothstep(0.34, 0.74, v);
      img.data[i * 4] = 255;
      img.data[i * 4 + 1] = 255;
      img.data[i * 4 + 2] = 255;
      img.data[i * 4 + 3] = Math.round(v * 255);
    }
    mctx.putImageData(img, 0, 0);

    // 放大到原图尺寸，保留柔和过渡
    const W = srcCanvas.width;
    const H = srcCanvas.height;
    const mask = document.createElement('canvas');
    mask.width = W;
    mask.height = H;
    const ctx = mask.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(maskSmall, 0, 0, W, H);
    return this._refineAlpha(mask);
  }

  /** 用原图做一次边缘引导，让 alpha 边界贴合真实轮廓 */
  _refineAlpha(mask) {
    const w = mask.width;
    const h = mask.height;
    const ctx = mask.getContext('2d', { willReadFrequently: true });
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    // 轻微 S 曲线：让半透明过渡更干净，同时保留薄纱类柔边
    for (let i = 3; i < d.length; i += 4) {
      const a = d[i] / 255;
      const s = a * a * (3 - 2 * a);
      d[i] = Math.round((a * 0.25 + s * 0.75) * 255);
    }
    ctx.putImageData(img, 0, 0);
    return mask;
  }

  /** 兜底：从四边泛洪，按背景色相似度抠图 */
  _heuristicAlpha(srcCanvas) {
    const MAX = 900;
    let w = srcCanvas.width;
    let h = srcCanvas.height;
    const k = Math.min(1, MAX / Math.max(w, h));
    w = Math.max(1, Math.round(w * k));
    h = Math.max(1, Math.round(h * k));

    const tmp = document.createElement('canvas');
    tmp.width = w;
    tmp.height = h;
    const tctx = tmp.getContext('2d', { willReadFrequently: true });
    tctx.drawImage(srcCanvas, 0, 0, w, h);
    const img = tctx.getImageData(0, 0, w, h);
    const d = img.data;

    // 边框平均色
    let br = 0, bg = 0, bb = 0, n = 0;
    const sample = (x, y) => {
      const i = (y * w + x) * 4;
      br += d[i]; bg += d[i + 1]; bb += d[i + 2]; n++;
    };
    for (let x = 0; x < w; x += 2) { sample(x, 0); sample(x, h - 1); }
    for (let y = 0; y < h; y += 2) { sample(0, y); sample(w - 1, y); }
    br /= n; bg /= n; bb /= n;

    const tol = 42;
    const tol2 = tol * tol;
    const visited = new Uint8Array(w * h);
    const queue = new Int32Array(w * h);
    let qh = 0, qt = 0;

    const dist2 = (i) => {
      const r = d[i * 4] - br;
      const g = d[i * 4 + 1] - bg;
      const b = d[i * 4 + 2] - bb;
      return r * r + g * g + b * b;
    };
    const push = (idx) => {
      if (!visited[idx] && dist2(idx) < tol2 * 1.9) {
        visited[idx] = 1;
        queue[qt++] = idx;
      }
    };

    for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }

    while (qh < qt) {
      const idx = queue[qh++];
      const x = idx % w;
      const y = (idx - x) / w;
      const nb = [];
      if (x > 0) nb.push(idx - 1);
      if (x < w - 1) nb.push(idx + 1);
      if (y > 0) nb.push(idx - w);
      if (y < h - 1) nb.push(idx + w);
      for (const j of nb) {
        if (visited[j]) continue;
        if (dist2(j) < tol2) {
          visited[j] = 1;
          queue[qt++] = j;
        }
      }
    }

    const alpha = document.createElement('canvas');
    alpha.width = w;
    alpha.height = h;
    const actx = alpha.getContext('2d', { willReadFrequently: true });
    const out = actx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const a = visited[i] ? 0 : 255;
      out.data[i * 4] = 255;
      out.data[i * 4 + 1] = 255;
      out.data[i * 4 + 2] = 255;
      out.data[i * 4 + 3] = a;
    }
    actx.putImageData(out, 0, 0);

    // 羽化
    const soft = document.createElement('canvas');
    soft.width = w;
    soft.height = h;
    const sctx = soft.getContext('2d');
    sctx.filter = 'blur(1.2px)';
    sctx.drawImage(alpha, 0, 0);
    sctx.filter = 'none';

    // 回到原尺寸
    const mask = document.createElement('canvas');
    mask.width = srcCanvas.width;
    mask.height = srcCanvas.height;
    const mctx = mask.getContext('2d');
    mctx.imageSmoothingQuality = 'high';
    mctx.drawImage(soft, 0, 0, mask.width, mask.height);
    return mask;
  }
}

/* ---------------- 工具 ---------------- */

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function fetchWithProgress(url, onProgress) {
  return fetch(url).then(async (resp) => {
    if (!resp.ok) throw new Error(`模型请求失败 (${resp.status})`);
    const total = Number(resp.headers.get('content-length') || 0);
    if (!resp.body || !total) {
      const ab = await resp.arrayBuffer();
      onProgress(1);
      return ab;
    }
    const reader = resp.body.getReader();
    const chunks = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      onProgress(Math.min(1, received / total));
    }
    const buf = new Uint8Array(received);
    let off = 0;
    for (const c of chunks) { buf.set(c, off); off += c.length; }
    return buf.buffer;
  });
}

/** 裁掉四周透明边，返回新 canvas */
export function trimCanvas(canvas, pad = 0) {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const data = ctx.getImageData(0, 0, w, h).data;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 6) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return canvas; // 全透明，原样返回
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad);
  maxY = Math.min(h - 1, maxY + pad);

  const tw = maxX - minX + 1;
  const th = maxY - minY + 1;
  const out = document.createElement('canvas');
  out.width = tw;
  out.height = th;
  out.getContext('2d').drawImage(canvas, minX, minY, tw, th, 0, 0, tw, th);
  return out;
}

/** 过大素材降采样，控制内存 */
export function limitSize(canvas, maxDim = 1400) {
  const m = Math.max(canvas.width, canvas.height);
  if (m <= maxDim) return canvas;
  const k = maxDim / m;
  const out = document.createElement('canvas');
  out.width = Math.round(canvas.width * k);
  out.height = Math.round(canvas.height * k);
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, out.width, out.height);
  return out;
}
