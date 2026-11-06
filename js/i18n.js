/**
 * 界面文案（中 / 英）。
 * 静态节点用 data-i18n / data-i18n-title / data-i18n-ph 标记，
 * 动态文案（toast、弹窗、画布上的骨架标注）走 t()。
 */

const DICT = {
  zh: {
    'app.title': '拼贴台 · Moodboard',
    'brand.name': '拼贴台',
    'brand.sub': 'moodboard studio',

    'guide.0': '关闭',
    'guide.1': '锚点色块',
    'guide.2': '纵向叙事',
    'guide.3': '集群组团',
    'guide.4': '居中焦点',
    'guide.0.title': '关闭构图指引',
    'guide.1.title': '锚点色块式',
    'guide.2.title': '纵向叙事长条式',
    'guide.3.title': '集群组团式',
    'guide.4.title': '居中焦点式',
    'guide.1.title.canvas': 'COLOR ANCHORS · 色卡锚位',
    'guide.1.sub': 'FREE ZONE · 其余区域自由散放',
    'guide.2.title.canvas': 'VERTICAL STORY · 纵向叙事',
    'guide.2.sub': 'READ ↓ 由上至下分区叙事',
    'guide.3.title.canvas': 'CLUSTERS · 松散组团',
    'guide.3.sub': '留白 · 组团之间保持呼吸',
    'guide.4.title.canvas': 'FOCUS · 中心焦点',
    'guide.4.sub': '负空间 · negative space',
    'guide.meta': '构图指引 {index} / 4 · {name} · {count} 个位置 · 留白 ≈46%',
    'guide.name.1': '锚点色块式',
    'guide.name.2': '纵向叙事',
    'guide.name.3': '集群组团式',
    'guide.name.4': '居中焦点式',

    'top.saveWarn': '关闭窗口不保存 · 请及时导出',
    'top.saveWarn.title': '本工具不上传、不保存，刷新或关闭窗口后需要重新上传',
    'top.clear': '清空画布',
    'top.clear.title': '删除画布上的全部素材与文字（左侧素材库保留），会先二次确认',
    'top.reset': '重置视图',
    'top.reset.title': '只把视图恢复居中并回到合适缩放，不删除任何内容',
    'top.export': '导出 PNG',
    'top.lang': 'EN',
    'top.lang.title': 'Switch to English',

    'side.library': '素材库',
    'side.library.title': '素材库里保存的永远是原图；抠图与蒙版只作用于画布上选中的那一张',
    'side.upload': '上传图片',
    'side.hint1': '支持 JPG / PNG 单张 ≤ 5MB 可多选',
    'side.hint2': '图片仅在本地抠图 不会上传服务器',
    'engine.loading': '正在加载本地抠图模型…',
    'engine.ready': '本地抠图模型已就绪 · 图片不出本机',
    'engine.compatWasm': '兼容抠图模式（当前浏览器不支持 WASM）',
    'engine.compatHeuristic': '兼容抠图模式（边缘识别）',
    'side.text': '文字',
    'side.addTitle': '+ 标题',
    'side.addBody': '+ 正文',
    'side.bg': '背景',
    'side.bgAdd': '+ 背景图',
    'side.bgChange': '更换背景',
    'side.bgRemove': '移除',
    'side.bgEmpty': '可导入图片作为画布底图',
    'lib.empty': '还没有素材',
    'lib.emptySub': '上传图片开始拼贴吧',
    'side.foot1': '拖拽素材到画布或灰色暂放区',
    'side.foot2': '双击文字块可改写内容',
    'side.foot3': '导出仅包含中间画布区域',

    'canvas.empty': '把素材拖进来，或从左侧素材库拖入',
    'canvas.emptySub': '灰色区域是暂放区，不会被导出',
    'canvas.tag': '中心画布 {w} × {h} · {ratio} · 导出范围',
    'count.label': '位置圆',
    'count.3.title': '3 个大图位置 · 留白约 46%',
    'count.5.title': '5 个位置 · 留白约 46%',
    'count.8.title': '8 个位置 · 留白约 46%',
    'ratio.label': '画布',
    'busy.cut': '正在本地抠图，请稍候…',
    'text.hint': 'Enter 确认 · Shift+Enter 换行 · Esc 取消',

    'mode.original': '原图',
    'mode.original.title': '显示原始图片',
    'mode.auto': '自动抠图',
    'mode.auto.title': '在本地抠掉背景',
    'mode.mask': '蒙版修图',
    'mode.mask.title': '用画笔擦除 / 恢复边缘',
    'sel.front': '置顶',
    'sel.front.title': '置于顶层',
    'sel.back': '置底',
    'sel.back.title': '置于底层',
    'sel.delete': '删除',
    'sel.delete.title': '删除',

    'mask.title': '蒙版修图',
    'mask.desc': '默认显示完整图片，可自行擦除多余边缘；「恢复」把擦掉的细节刷回来（适合琉璃、薄纱这类半透明素材）',
    'mask.erase': '擦除',
    'mask.restore': '恢复',
    'mask.brush': '画笔',
    'mask.tip': '光标圆圈 = 实际笔刷大小',
    'mask.undo': '撤销（⌘/Ctrl + Z）',
    'mask.redo': '重做（⌘/Ctrl + Shift + Z）',
    'mask.resetBrushes': '清空所有笔迹',
    'mask.cancel': '取消',
    'mask.done': '完成',

    'bg.title': '画布背景',
    'bg.desc': '拖动画面调整位置，滑块缩放。背景按当前画布比例自动裁剪，导出时一并写入。',
    'bg.zoom': '缩放',
    'bg.ratio': '当前比例 {ratio} · {w} × {h}',
    'bg.remove': '移除背景',
    'bg.cancel': '取消',
    'bg.done': '完成',

    'loader.title': '正在加载本地抠图模型',
    'loader.sub': '模型在本机浏览器中运行，图片不会离开你的设备',
    'loader.step': '准备中…',

    'toast.fileFail': '「{name}」处理失败，请换一张图片试试',
    'toast.notReady': '抠图模型还在加载，请稍候…',
    'toast.busyUpload': '上一批图片还在处理中，请稍候',
    'toast.badType': '仅支持 JPG / PNG：{names} 已跳过',
    'toast.tooBig': '{names} 超过 5MB，已跳过',
    'toast.roomLimit': '素材库最多保存 {max} 个素材，本次先处理 {n} 张',
    'toast.assetDeleted': '素材已删除',
    'toast.cutFail': '自动抠图失败，可以改用「蒙版修图」手动擦除',
    'toast.maskUpdated': '蒙版已更新（只影响画布上这一张）',
    'toast.viewReset': '视图已重置：画布回到居中，内容没有任何删改',
    'toast.canvasEmpty': '画布已经是空的',
    'toast.canvasCleared': '画布已清空，素材库保留',
    'toast.noUndo': '没有可撤销的操作',
    'toast.noRedo': '没有可重做的操作',
    'toast.maskReset': '已清空所有蒙版笔迹',
    'toast.ratioChanged': '画布已切换为 {ratio}（{w} × {h}），素材保持原位，出画部分仍会保留',
    'toast.bgAdded': '背景已应用',
    'toast.bgRemoved': '背景已移除',
    'toast.bgFail': '这张图片读不出来，换一张试试',

    'dlg.assetMax.title': '素材库已满',
    'dlg.assetMax.desc': '素材库已满，请先删除不需要的素材再上传。',
    'dlg.ok': '知道了',
    'dlg.deleteAsset.title': '删除这个素材？',
    'dlg.deleteAsset.desc': '画布上使用它的素材也会一起移除，操作不可撤销。',
    'dlg.cancel': '取消',
    'dlg.delete': '删除',
    'dlg.export.title': '导出中心画布',
    'dlg.export.desc': '即将导出 {w} × {h}px 的 PNG（{ratio}），{bg}。\n灰色暂放区、构图指引与所有辅助线都不会被打入图片。',
    'dlg.export.bg': '带自定义背景',
    'dlg.export.noBg': '透明背景，带 Alpha 通道',
    'dlg.export.export': '导出',
    'dlg.done.title': 'PNG 已生成',
    'dlg.done.desc': '{w} × {h}px · {bg}\n如果浏览器没有自动下载，可能是下载被拦截：右键下方图片「存储为」即可保存原图，或在地址栏右侧允许本站下载后点「再次下载」。',
    'dlg.close': '关闭',
    'dlg.again': '再次下载',
    'dlg.fail.title': '导出失败',
    'dlg.fail.desc': '生成图片时出错：{msg}\n\n可以试试：\n· 在浏览器地址栏允许本站点下载文件\n· 关闭下载拦截插件后重试\n· 换用最新版 Chrome / Edge / Safari 打开本页面',
    'dlg.clear.title': '清空画布？',
    'dlg.clear.desc': '清空后当前拼图不会被保存，也无法撤销。\n左侧素材库会保留，可以重新拖入。',
    'dlg.clear.action': '清空',
  },

  en: {
    'app.title': 'Collage Board · Moodboard',
    'brand.name': 'Collage Board',
    'brand.sub': 'moodboard studio',

    'guide.0': 'Off',
    'guide.1': 'Anchors',
    'guide.2': 'Vertical',
    'guide.3': 'Clusters',
    'guide.4': 'Focus',
    'guide.0.title': 'Hide composition guide',
    'guide.1.title': 'Color anchors',
    'guide.2.title': 'Vertical story',
    'guide.3.title': 'Loose clusters',
    'guide.4.title': 'Center focus',
    'guide.1.title.canvas': 'COLOR ANCHORS',
    'guide.1.sub': 'FREE ZONE · keep the rest loose',
    'guide.2.title.canvas': 'VERTICAL STORY',
    'guide.2.sub': 'READ ↓ top to bottom',
    'guide.3.title.canvas': 'CLUSTERS',
    'guide.3.sub': 'BREATH · leave gaps between clusters',
    'guide.4.title.canvas': 'FOCUS',
    'guide.4.sub': 'NEGATIVE SPACE',
    'guide.meta': 'GUIDE {index} / 4 · {name} · {count} slots · ~46% whitespace',
    'guide.name.1': 'anchors',
    'guide.name.2': 'vertical story',
    'guide.name.3': 'clusters',
    'guide.name.4': 'center focus',

    'top.saveWarn': 'Not saved · export before closing',
    'top.saveWarn.title': 'Nothing is uploaded or saved. Refresh or close the window and your canvas is gone.',
    'top.clear': 'Clear canvas',
    'top.clear.title': 'Remove every image and text from the canvas (the library is kept). Asks for confirmation first.',
    'top.reset': 'Reset view',
    'top.reset.title': 'Re-center the canvas and zoom to fit. Nothing is deleted.',
    'top.export': 'Export PNG',
    'top.lang': '中文',
    'top.lang.title': '切换到中文',

    'side.library': 'Library',
    'side.library.title': 'The library always keeps the original image. Cutout and mask only affect the selected item on the canvas.',
    'side.upload': 'Upload images',
    'side.hint1': 'JPG / PNG · ≤5MB each · multi-select',
    'side.hint2': 'Cutout runs locally · nothing is uploaded',
    'engine.loading': 'Loading the local cutout model…',
    'engine.ready': 'Local cutout model ready · images never leave your device',
    'engine.compatWasm': 'Compatible mode (this browser has no WASM)',
    'engine.compatHeuristic': 'Compatible mode (edge detection)',
    'side.text': 'Text',
    'side.addTitle': '+ Title',
    'side.addBody': '+ Body',
    'side.bg': 'Background',
    'side.bgAdd': '+ Background',
    'side.bgChange': 'Change',
    'side.bgRemove': 'Remove',
    'side.bgEmpty': 'Import an image as the canvas background',
    'lib.empty': 'No images yet',
    'lib.emptySub': 'Upload an image to start',
    'side.foot1': 'Drag images onto the canvas or the grey area',
    'side.foot2': 'Double-click a text block to edit it',
    'side.foot3': 'Export only includes the canvas area',

    'canvas.empty': 'Drop images here, or drag them in from the library',
    'canvas.emptySub': 'The grey area is a staging zone — it is never exported',
    'canvas.tag': 'Canvas {w} × {h} · {ratio} · export area',
    'count.label': 'Slots',
    'count.3.title': '3 large slots · ~46% whitespace',
    'count.5.title': '5 slots · ~46% whitespace',
    'count.8.title': '8 slots · ~46% whitespace',
    'ratio.label': 'Canvas',
    'busy.cut': 'Cutting out locally, please wait…',
    'text.hint': 'Enter to confirm · Shift+Enter for a new line · Esc to cancel',

    'mode.original': 'Original',
    'mode.original.title': 'Show the original image',
    'mode.auto': 'Auto cutout',
    'mode.auto.title': 'Remove the background locally',
    'mode.mask': 'Mask',
    'mode.mask.title': 'Erase or restore edges with a brush',
    'sel.front': 'Front',
    'sel.front.title': 'Bring to front',
    'sel.back': 'Back',
    'sel.back.title': 'Send to back',
    'sel.delete': 'Delete',
    'sel.delete.title': 'Delete',

    'mask.title': 'Mask retouch',
    'mask.desc': 'The full image is shown. Erase the edges you do not want; "Restore" paints detail back (handy for glass or sheer fabric).',
    'mask.erase': 'Erase',
    'mask.restore': 'Restore',
    'mask.brush': 'Brush',
    'mask.tip': 'The cursor circle is the real brush size',
    'mask.undo': 'Undo (⌘/Ctrl + Z)',
    'mask.redo': 'Redo (⌘/Ctrl + Shift + Z)',
    'mask.resetBrushes': 'Clear all strokes',
    'mask.cancel': 'Cancel',
    'mask.done': 'Done',

    'bg.title': 'Canvas background',
    'bg.desc': 'Drag to reposition, slide to zoom. The background is cropped to the current canvas ratio and baked into the export.',
    'bg.zoom': 'Zoom',
    'bg.ratio': 'Current ratio {ratio} · {w} × {h}',
    'bg.remove': 'Remove',
    'bg.cancel': 'Cancel',
    'bg.done': 'Done',

    'loader.title': 'Loading the local cutout model',
    'loader.sub': 'The model runs in your browser — your images never leave this device',
    'loader.step': 'Preparing…',

    'toast.fileFail': 'Could not process "{name}". Try another image.',
    'toast.notReady': 'The cutout model is still loading, one moment…',
    'toast.busyUpload': 'The previous batch is still processing, please wait',
    'toast.badType': 'JPG / PNG only — skipped: {names}',
    'toast.tooBig': 'Over 5MB, skipped: {names}',
    'toast.roomLimit': 'The library holds {max} images. Processing the first {n} this time.',
    'toast.assetDeleted': 'Image deleted',
    'toast.cutFail': 'Auto cutout failed. Use "Mask" to erase the edges by hand.',
    'toast.maskUpdated': 'Mask updated (only this item on the canvas)',
    'toast.viewReset': 'View reset — canvas centered, nothing deleted',
    'toast.canvasEmpty': 'The canvas is already empty',
    'toast.canvasCleared': 'Canvas cleared — the library is kept',
    'toast.noUndo': 'Nothing to undo',
    'toast.noRedo': 'Nothing to redo',
    'toast.maskReset': 'All mask strokes cleared',
    'toast.ratioChanged': 'Canvas set to {ratio} ({w} × {h}). Items stay in place; anything outside is kept.',
    'toast.bgAdded': 'Background applied',
    'toast.bgRemoved': 'Background removed',
    'toast.bgFail': 'That image could not be read. Try another one.',

    'dlg.assetMax.title': 'Library is full',
    'dlg.assetMax.desc': 'The library is full. Delete an image before uploading more.',
    'dlg.ok': 'OK',
    'dlg.deleteAsset.title': 'Delete this image?',
    'dlg.deleteAsset.desc': 'Every copy placed on the canvas is removed too. This cannot be undone.',
    'dlg.cancel': 'Cancel',
    'dlg.delete': 'Delete',
    'dlg.export.title': 'Export the canvas',
    'dlg.export.desc': 'About to export a {w} × {h}px PNG ({ratio}), {bg}.\nThe grey staging area, guides and every helper line stay out of the image.',
    'dlg.export.bg': 'with your custom background',
    'dlg.export.noBg': 'transparent, with an alpha channel',
    'dlg.export.export': 'Export',
    'dlg.done.title': 'PNG ready',
    'dlg.done.desc': '{w} × {h}px · {bg}\nIf it did not download automatically, the download may be blocked: right-click the image below and "Save image as", or allow downloads for this site and hit "Download again".',
    'dlg.close': 'Close',
    'dlg.again': 'Download again',
    'dlg.fail.title': 'Export failed',
    'dlg.fail.desc': 'Something went wrong while rendering: {msg}\n\nTry: allow downloads for this site, turn off download blockers, or use the latest Chrome / Edge / Safari.',
    'dlg.clear.title': 'Clear the canvas?',
    'dlg.clear.desc': 'The current collage will not be saved and cannot be undone.\nYour library is kept, so you can drag images back in.',
    'dlg.clear.action': 'Clear',
  },
};

const STORE_KEY = 'mb-lang';
let lang = 'zh';

export function getLang() {
  return lang;
}

export function setLang(next) {
  lang = DICT[next] ? next : 'zh';
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  try { localStorage.setItem(STORE_KEY, lang); } catch (e) { /* ignore */ }
  return lang;
}

export function initLang() {
  let saved = null;
  try { saved = localStorage.getItem(STORE_KEY); } catch (e) { /* ignore */ }
  if (saved) {
    setLang(saved);
  } else {
    const nav = (navigator.language || 'zh').toLowerCase();
    setLang(nav.startsWith('zh') ? 'zh' : 'en');
  }
  return lang;
}

export function t(key, vars) {
  const table = DICT[lang] || DICT.zh;
  let s = table[key];
  if (s == null) s = DICT.zh[key];
  if (s == null) return key;
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
}

/** 把 data-i18n* 标记的静态节点刷成当前语言 */
export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
  });
  document.title = t('app.title');
}
