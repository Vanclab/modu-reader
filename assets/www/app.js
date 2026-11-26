/* ============ 墨读 · 书架核心 ============ */
const BG_PRESETS = ['#F7F5F0', '#FFFFFF', '#E9EFE4', '#F3E8D8', '#2B2B2B', '#000000'];
const FG_PRESETS = ['#24292F', '#5A5A5A', '#3A2E22', '#1F3B2C', '#C9C9C9', '#8FA88F'];

const DEFAULT_READER = {
  bg: '#F7F5F0', color: '#24292F', fontSize: 17.5,
  lineHeight: 2.0, padX: 22, padY: 64, flip: 'scroll', bgImage: null, weight: 400
};


const S = {
  books: [],
  sort: 'time',
  order: 'desc',
  goal: { date: '', minutes: 0, target: 30 },
  edit: false,
  pickKind: 'novel',
  pendingSeries: '',
  pendingTag: '',
  filterTag: '',
  selecting: false,
  selected: {},
  pendingDelete: null,
  selMode: 'book',
  selSeries: '',
  seriesCovers: {},
  coverForSeries: null,
  scope: 'book',
  activeBookId: null,
  reader: JSON.parse(JSON.stringify(DEFAULT_READER))
};

const FORMATS = {
  txt: 'novel', md: 'novel', markdown: 'novel',
  epub: 'novel', pdf: 'novel',
  mobi: 'novel', azw: 'novel', azw3: 'novel', azw4: 'novel',
  cbz: 'comic', zip: 'comic', cbr: 'comic', rar: 'comic', '7z': 'comic'
};
const COMIC_EXT = ['cbz', 'zip', 'cbr', 'rar', '7z'];
const NEED_PDF = ['pdf'];
const KNOWN = ['epub', 'txt', 'md', 'markdown', 'pdf', 'cbz', 'zip',
  'mobi', 'azw3', 'azw4', 'azw', 'cbr', 'rar', '7z'];

/* ---------- 存储 ---------- */
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}
function load() {
  try {
    const raw = Native.loadLibrary();
    const o = JSON.parse(raw || '[]');
    if (Array.isArray(o)) {
      S.books = o;
    } else {
      S.books = o.books || [];
      S.sort = o.sort || 'time';
      S.order = o.order || 'desc';
      S.goal = o.goal || S.goal;
      S.reader = Object.assign({}, DEFAULT_READER, o.reader || {});
      S.seriesCovers = o.seriesCovers || {};
    }
  } catch (e) { S.books = []; }
  if (S.goal.date !== todayStr()) {
    S.goal = { date: todayStr(), minutes: 0, target: 30 };
  }
}
let saveTimer = null;
let savePending = false;

function writeLibrary() {
  savePending = false;
  clearTimeout(saveTimer);
  saveTimer = null;
  try {
    Native.saveLibrary(JSON.stringify({
      books: S.books, sort: S.sort, order: S.order, goal: S.goal,
      reader: S.reader, seriesCovers: S.seriesCovers
    }));
  } catch (e) { }
}

function save() {
  savePending = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(writeLibrary, 300);
}

/* 立刻落盘（切后台、退出、改设置时调用） */
function flushSave() {
  if (savePending) writeLibrary();
}

/* ---------- 工具 ---------- */
function b64ToBytes(b64) {
  const bin = atob(b64), n = bin.length, out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function extOf(name) {
  const m = /\.([a-z0-9]+)$/i.exec(name || '');
  return m ? m[1].toLowerCase() : '';
}
function baseName(name) {
  return (name || '').replace(/\.[^.]+$/, '');
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}
function toast(t) { try { Native.toast(t); } catch (e) { } }
function notYet(t) { closeAll(); toast(t + ' 功能开发中'); }

/* ---------- 渲染 ---------- */
function sortedBooks() {
  let arr = S.books.slice();
  if (S.filterTag) arr = arr.filter(b => (b.tags || []).indexOf(S.filterTag) >= 0);
  const dir = S.order === 'asc' ? 1 : -1;
  arr.sort((a, b) => {
    let r = 0;
    if (S.sort === 'name') r = (a.title || '').localeCompare(b.title || '', 'zh');
    else if (S.sort === 'author') r = (a.author || '').localeCompare(b.author || '', 'zh');
    else if (S.sort === 'recent') r = (a.lastRead || 0) - (b.lastRead || 0);
    else r = (a.added || 0) - (b.added || 0);
    return r * dir;
  });
  return arr;
}

function coverHtml(b, big) {
  if (b.cover) return '<img class="cover-img" alt="" src="' + b.cover + '">';
  return '<div class="placeholder">BOOK</div>';
}

function bookCard(b, opts) {
  opts = opts || {};
  const count = opts.count || '';
  return '<div class="book' + (S.selected[b.id] ? ' sel' : '') + '" data-id="' + b.id + '" onclick="onBookTap(\'' + b.id + '\')">' +
    coverHtml(b) +
    (count ? '<div class="badge-top">' + count + '</div>' : '') +
    (b.series ? '<div class="badge-right">系列</div>' : '') +
    '<div class="pick"></div>' +
    '<div class="title">' + esc(b.title) + '</div>' +
    '</div>';
}

function render() {
  const cont = document.getElementById('continueCard');
  const recent = S.books.filter(b => b.lastRead).sort((a, b) => b.lastRead - a.lastRead)[0];
  if (recent) {
    cont.style.display = 'flex';
    cont.innerHTML =
      '<div class="cov" ' + (recent.cover ? 'style="background-image:url(' + recent.cover + ')"' : '') + '>' +
      (recent.cover ? '' : '封面') + '</div>' +
      '<div class="info"><b>' + esc(recent.title) + '</b>' +
      '<span>' + esc(recent.author || '未知作者') + ' · 已读完 ' + Math.round(recent.progress || 0) + '%</span></div>';
  } else {
    cont.style.display = 'none';
  }

  const seriesMap = {};
  S.books.forEach(b => {
    if (b.series) {
      (seriesMap[b.series] = seriesMap[b.series] || []).push(b);
    }
  });
  const seriesNames = Object.keys(seriesMap);
  const row = document.getElementById('seriesRow');
  row.innerHTML = seriesNames.map(n => {
    const arr = seriesMap[n];
    const first = arr[0];
    const allSel = arr.length > 0 && arr.every(function (b) { return S.selected[b.id]; });
    return '<div class="book' + (allSel ? ' sel' : '') + '" data-series="' + esc(n) + '" onclick="onSeriesTap(this)">' +
      (S.seriesCovers[n] ? '<img class="cover-img" alt="" src="' + S.seriesCovers[n] + '">' : coverHtml(first)) +
      '<div class="badge-top">' + arr.length + '</div>' +
      '<div class="badge-right">系列</div>' +
      '<div class="pick"></div>' +
      '<div class="title">' + esc(n) + '</div></div>';
  }).join('') || '<div style="color:#9AA3AF;font-size:13px;padding:6px 4px">暂无系列</div>';

  const singles = sortedBooks().filter(b => !b.series);
  document.getElementById('bookGrid').innerHTML = singles.map(b => bookCard(b)).join('');
  document.getElementById('emptyHint').style.display = S.books.length ? 'none' : 'block';
  document.body.classList.toggle('edit-mode', S.edit);

  updateSelbarLabel();
  renderGoal();
  renderCat();
  renderStat();
  renderSet();
  updateSortChecks();
}

function renderGoal() {
  if (!document.getElementById('goalPct')) return;
  const g = S.goal;
  const pct = Math.min(100, Math.round((g.minutes / g.target) * 100));
  document.getElementById('goalPct').textContent = pct + '%';
  document.getElementById('goalLeft').textContent = '还剩 ' + Math.max(0, g.target - Math.floor(g.minutes)) + ' 分钟';
  const arc = document.getElementById('ringArc');
  if (arc) arc.setAttribute('stroke-dashoffset', String(326.7 * (1 - pct / 100)));
}

function updateSortChecks() {
  document.querySelectorAll('.pop-item .check').forEach(el => {
    const k = el.dataset.k;
    el.classList.toggle('on', k === 'sort' ? S.sort === el.parentElement.dataset.v : false);
  });
  document.querySelectorAll('#popSort .pop-item').forEach((el, i) => {
    const key = ['time', 'name', 'author', 'recent', 'asc', 'desc'][i];
    const chk = el.querySelector('.check');
    if (!chk) return;
    if (key === 'asc' || key === 'desc') {
      chk.classList.toggle('on', S.order === key);
    } else {
      chk.classList.toggle('on', S.sort === key);
    }
  });
}

/* ---------- 阅读外观 ---------- */
function isDark(hex) {
  var h = (hex || '').replace('#', '');
  if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
  if (h.length !== 6) return false;
  var r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16);
  return (r * 0.299 + g * 0.587 + b * 0.114) < 120;
}

function currentBook() {
  if (!S.activeBookId) return null;
  return S.books.find(function (b) { return b.id === S.activeBookId; }) || null;
}

/* 生效设置：全局默认 + 本书覆盖 */
function currentReader() {
  var b = currentBook();
  if (b && b.reader) return b.reader;
  return S.reader;
}

/* 当前编辑目标 */
function readerTarget() {
  var b = currentBook();
  if (!b) return S.reader;
  if (!b.reader) b.reader = JSON.parse(JSON.stringify(S.reader));
  return b.reader;
}

function applyReaderStyle() {
  var r = currentReader(), rd = document.getElementById('reader');
  if (!rd) return;
  rd.style.setProperty('--rd-bg', r.bg);
  rd.style.setProperty('--rd-bg2', r.bgImage ? '#F7F5F0' : r.bg);
  rd.style.setProperty('--rd-color', r.color);
  rd.style.setProperty('--rd-size', r.fontSize + 'px');
  rd.style.setProperty('--rd-lh', r.lineHeight);
  rd.style.setProperty('--rd-padx', r.padX + 'px');
  rd.style.setProperty('--rd-pady', r.padY + 'px');
  rd.style.setProperty('--rd-weight', r.weight || 400);
  if (r.bgImage) {
    rd.style.backgroundImage = 'url(' + r.bgImage + ')';
  } else {
    rd.style.backgroundImage = '';
  }
  rd.classList.toggle('darkbg', isDark(r.bg) && !r.bgImage);
  if (typeof relayoutReader === 'function') relayoutReader();
}

function openReaderSettings() {
  buildReaderSettings(document.getElementById('rsBody'), {});
  showChromeIfReader();
  document.getElementById('sheetReader').classList.add('on');
  showMask();
}
function closeReaderSettings() {
  document.getElementById('sheetReader').classList.remove('on');
  hideMask();
}
function showChromeIfReader() { /* 打开设置时保持顶栏可见 */ }

function rangeRow(label, key, min, max, step, val, id) {
  return '<div class="rs-row"><label>' + label + '</label>' +
    '<input type="range" id="' + id + '" min="' + min + '" max="' + max + '" step="' + step +
    '" value="' + val + '"><span class="rs-val" id="' + id + 'Val">' + val + '</span></div>';
}

/* 构建阅读设置控件（阅读器面板和设置页共用） */
function buildReaderSettings(host, opts) {
  if (!host) return;
  opts = opts || {};
  var r = currentReader();
  var html = '';

  html += '<div class="rs-row"><label>背景</label><div class="swatches" id="swBg">' +
    BG_PRESETS.map(function (c) {
      return '<div class="sw' + (!r.bgImage && r.bg === c ? ' on' : '') +
        '" style="background:' + c + '" data-bg="' + c + '"></div>';
    }).join('') + '</div></div>';

  html += '<div class="rs-row"><label>文字</label><div class="swatches" id="swColor">' +
    FG_PRESETS.map(function (c) {
      return '<div class="sw' + (r.color === c ? ' on' : '') +
        '" style="background:' + c + '" data-fg="' + c + '"></div>';
    }).join('') + '</div></div>';

  html += rangeRow('字号', 'fontSize', 13, 28, 0.5, r.fontSize, 'rgSize');
  html += rangeRow('行距', 'lineHeight', 1.2, 2.6, 0.05, r.lineHeight, 'rgLh');
  html += rangeRow('边距', 'padX', 8, 44, 1, r.padX, 'rgPad');
  html += rangeRow('字重', 'weight', 200, 800, 25, r.weight || 400, 'rgWeight');

  html += '<div class="rs-row"><label>翻页</label><div class="seg" id="segFlip">' +
    '<button data-mode="scroll"' + (r.flip === 'scroll' ? ' class="on"' : '') + '>上下滚动</button>' +
    '<button data-mode="page"' + (r.flip === 'page' ? ' class="on"' : '') + '>左右翻页</button>' +
    '</div></div>';

  html += '<button class="rs-img" onclick="pickBgImage()">从相册选择背景图片</button>';
  if (currentBook() && currentBook().reader) {
    html += '<button class="rs-img rs-reset" onclick="resetBookReader()">恢复默认阅读设置</button>';
  }
  host.innerHTML = html;

  host.querySelector('#swBg').addEventListener('click', function (e) {
    var el = e.target.closest('.sw'); if (!el) return;
    var tgt = readerTarget();
    tgt.bg = el.dataset.bg;
    tgt.bgImage = null;
    buildReaderSettings(host, opts);
    applyReaderStyle(); save(); flushSave();
  });

  host.querySelector('#swColor').addEventListener('click', function (e) {
    var el = e.target.closest('.sw'); if (!el) return;
    readerTarget().color = el.dataset.fg;
    buildReaderSettings(host, opts);
    applyReaderStyle(); save(); flushSave();
  });

  function bindRange(id, key, parse) {
    var el = host.querySelector('#' + id);
    if (!el) return;
    el.addEventListener('input', function () {
      readerTarget()[key] = parse(this.value);
      var v = host.querySelector('#' + id + 'Val');
      if (v) v.textContent = this.value;
      applyReaderStyle(); save();
    });
    el.addEventListener('change', function () { flushSave(); });
  }
  bindRange('rgSize', 'fontSize', parseFloat);
  bindRange('rgLh', 'lineHeight', parseFloat);
  bindRange('rgPad', 'padX', function (v) { return parseInt(v, 10); });
  bindRange('rgWeight', 'weight', function (v) { return parseInt(v, 10); });

  host.querySelector('#segFlip').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    readerTarget().flip = b.dataset.mode;
    buildReaderSettings(host, opts);
    applyReaderStyle(); save(); flushSave();
  });
}

function resetBookReader() {
  var b = currentBook();
  if (!b) return;
  delete b.reader;
  save(); flushSave();
  buildReaderSettings(document.getElementById('rsBody'), {});
  applyReaderStyle();
  toast('已恢复默认设置');
}

function pickBgImage() {
  S.bgForReader = true;
  setTimeout(function () {
    try { Native.pickFiles('bg'); } catch (e) { toast('无法打开图片选择器'); }
  }, 100);
}

/* ---------- 交互 ---------- */
function onBookTap(id) {
  if (longFired) { longFired = false; return; }
  const b = S.books.find(function (x) { return x.id === id; });
  if (!b) { toast('没找到这本书'); return; }
  if (S.selecting) { toggleSelect(id); return; }
  try {
    openReader(b);
  } catch (e) {
    toast('打开失败：' + (e && e.message ? e.message : e));
  }
}
function openSeries(name) {
  toast('系列「' + name + '」暂以单册展示');
}

function togglePop(id, other) {
  const el = document.getElementById(id);
  const on = el.classList.contains('on');
  closePops();
  if (!on) { el.classList.add('on'); showMask(); }
}
function closePops() {
  document.querySelectorAll('.popover').forEach(e => e.classList.remove('on'));
  if (!document.querySelector('.sheet.on') && !document.querySelector('.dialog.on')) hideMask();
}
function showMask() { document.getElementById('mask').classList.add('on'); blurBg(true); }
function hideMask() { document.getElementById('mask').classList.remove('on'); blurBg(false); }
function blurBg(on) {
  document.querySelectorAll('.topbar, .scroll, .tabbar').forEach(function (el) {
    if (on) el.classList.add('blurred'); else el.classList.remove('blurred');
  });
}
function closeAll() {
  closePops();
  document.querySelectorAll('.sheet').forEach(e => e.classList.remove('on'));
  document.querySelectorAll('.dialog').forEach(e => e.classList.remove('on'));
  hideMask();
}
function toggleLibSwitch() { toast('书库 · 全部书籍'); }

function openEditMode() {
  closeAll();
  S.edit = !S.edit;
  if (!S.edit) S.books.forEach(b => b._sel = false);
  document.body.classList.toggle('edit-mode', S.edit);
  toast(S.edit ? '进入编辑模式，点击书籍选择' : '退出编辑模式');
}

function setSort(k) {
  S.sort = k; save(); render(); closePops();
  toast('已按' + ({ time: '时间', name: '名称', author: '作者', recent: '最近阅读' }[k]) + '排序');
}
function setOrder(k) {
  S.order = k; save(); render(); closePops();
  toast(k === 'asc' ? '升序' : '降序');
}
function openFilter() {
  closeAll();
  const tags = {};
  S.books.forEach(b => (b.tags || []).forEach(t => tags[t] = (tags[t] || 0) + 1));
  const list = Object.keys(tags);
  if (!list.length) { toast('还没有标签'); return; }
  toast('标签：' + list.join('、'));
}

/* ---------- 导入 ---------- */
function startImport(mode) {
  closeAll();
  showMask();
  document.getElementById('sheetImport').classList.add('on');
}
function pickSeries() {
  askInput('添加到系列', '输入系列名称，留空则不加入', S.pendingSeries, function (v) {
    S.pendingSeries = v;
    document.getElementById('tileSeries').textContent = v || '未选择';
  });
}
function pickTag() {
  askInput('加入标签', '输入标签名称，留空则不加入', S.pendingTag, function (v) {
    S.pendingTag = v;
    document.getElementById('tileTag').textContent = v || '未选择';
  });
}

/* 通用输入框（WebView 不支持 window.prompt） */
let inputCb = null;
function askInput(title, hint, def, cb) {
  inputCb = cb;
  document.getElementById('inpTitle').textContent = title;
  const inp = document.getElementById('inpField');
  inp.value = def || '';
  inp.placeholder = hint || '';
  document.getElementById('dlgInput').classList.add('on');
  showMask();
  setTimeout(() => inp.focus(), 100);
}
function confirmInput() {
  const v = (document.getElementById('inpField').value || '').trim();
  document.getElementById('dlgInput').classList.remove('on');
  hideMask();
  if (inputCb) { inputCb(v); inputCb = null; }
}
function directImport(kind) {
  S.pickKind = kind || 'novel';
  closeAll();
  setTimeout(function () {
    try { Native.pickFiles(S.pickKind); }
    catch (e) { toast('无法打开文件选择器'); }
  }, 120);
}
function doImport(kind) {
  S.pickKind = kind;
  closeAll();
  try { Native.pickFiles(kind); } catch (e) { toast('无法打开文件选择器'); }
}
function showFormats() {
  closeAll();
  document.getElementById('dlgFormats').classList.add('on');
  showMask();
}

window.onPicked = function (kind, arr) {
  if (!arr || !arr.length) return;
  if (kind === 'bg') {
    readBgImage(arr[0]);
    return;
  }
  if (kind === 'cover') {
    if (S.coverForSeries) {
      var sn = S.coverForSeries;
      S.coverForSeries = null;
      prepareImage(arr[0], 480, 720, function (url) {
        S.seriesCovers[sn] = url;
        save(); render(); toast('系列封面已更新');
      });
      return;
    }
    var target = S.books.find(function (x) { return x.id === S.coverFor; });
    if (target) applyCover(target, arr[0]);
    S.coverFor = null;
    return;
  }
  let added = 0, skipped = 0;
  arr.forEach(f => {
    const ext = extOf(f.name);
    if (KNOWN.indexOf(ext) < 0) { skipped++; return; }
    if (S.books.some(b => b.uri === f.uri)) return;
    const book = {
      id: 'b' + Date.now() + Math.random().toString(36).slice(2, 7),
      uri: f.uri,
      name: f.name,
      title: baseName(f.name),
      author: '',
      ext: ext,
      kind: (FORMATS[ext] === 'comic' || kind === 'comic') && COMIC_EXT.indexOf(ext) >= 0 ? 'comic'
        : (ext === 'pdf' ? 'novel' : (FORMATS[ext] || 'novel')),
      cover: null,
      size: f.size || 0,
      progress: 0,
      lastRead: 0,
      added: Date.now(),
      series: S.pendingSeries || '',
      tags: S.pendingTag ? [S.pendingTag] : []
    };
    if (COMIC_EXT.indexOf(ext) >= 0) book.kind = 'comic';
    S.books.push(book);
    added++;
    buildCover(book);
  });
  S.pendingSeries = ''; S.pendingTag = '';
  document.getElementById('tileSeries').textContent = '未选择';
  document.getElementById('tileTag').textContent = '未选择';
  save(); render();
  if (added) toast('已导入 ' + added + ' 本');
  if (skipped) toast('跳过 ' + skipped + ' 个不支持的文件');
};

/* 抽取封面 */
function buildCover(book) {
  try {
    if (book.ext === 'pdf') {
      const img = Native.pdfPage(book.uri, 0, 320);
      if (img) { book.cover = img; save(); render(); }
      return;
    }
    if (['epub', 'cbz', 'zip'].indexOf(book.ext) < 0) return;
    const raw = Native.readBase64(book.uri);
    if (!raw) return;
    const zip = new JSZip();
    zip.loadAsync(b64ToBytes(raw)).then(() => {
      if (book.ext === 'epub') {
        return epubCover(zip).then(b64 => {
          if (b64) { book.cover = b64; save(); render(); }
        });
      }
      const imgs = zip.file(/\.(jpe?g|png|webp|gif)$/i);
      if (!imgs.length) return;
      const f = imgs[0];
      return f.async('base64').then(b64 => {
        book.cover = 'data:image/' + (/png$/i.test(f.name) ? 'png' : 'jpeg') + ';base64,' + b64;
        save(); render();
      });
    }).catch(e => { });
  } catch (e) { }
}

function epubCover(zip) {
  const files = zip.file(/\.(jpe?g|png|webp)$/i);
  if (!files.length) return Promise.resolve(null);
  const f = files[0];
  return f.async('base64').then(b64 =>
    'data:image/' + (/png$/i.test(f.name) ? 'png' : 'jpeg') + ';base64,' + b64);
}

/* ---------- 长按书籍菜单 ---------- */
var pressTimer = null, pressedId = null, pressedSeries = null, longFired = false;

function bindLongPress() {
  document.addEventListener('touchstart', function (e) {
    var card = e.target && e.target.closest ? e.target.closest('.book[data-id], .book[data-series]') : null;
    if (!card) return;
    if (card.closest('#cat')) return;   // 书架页不支持长按
    pressedId = card.getAttribute('data-id');
    pressedSeries = card.getAttribute('data-series');
    longFired = false;
    clearTimeout(pressTimer);
    pressTimer = setTimeout(function () {
      longFired = true;
      if (navigator.vibrate) { try { navigator.vibrate(18); } catch (err) { } }
      if (pressedSeries) enterSeriesSelection(pressedSeries);
      else enterSelection(pressedId);
    }, 480);
  }, { passive: true });

  document.addEventListener('touchmove', function () { clearTimeout(pressTimer); }, { passive: true });
  document.addEventListener('touchend', function () { clearTimeout(pressTimer); }, { passive: true });
  document.addEventListener('touchcancel', function () { clearTimeout(pressTimer); }, { passive: true });
}

/* ---------- 多选 ---------- */
function enterSelection(id) {
  S.selecting = true;
  S.selMode = 'book';
  S.selSeries = '';
  S.selected = {};
  if (id) S.selected[id] = true;
  document.body.classList.add('selecting');
  document.body.classList.remove('mode-series');
  longFired = false;
  render();
}

function enterSeriesSelection(name) {
  S.selecting = true;
  S.selMode = 'series';
  S.selSeries = name;
  S.selected = {};
  S.books.forEach(function (b) { if (b.series === name) S.selected[b.id] = true; });
  document.body.classList.add('selecting');
  document.body.classList.add('mode-series');
  longFired = false;
  render();
}

function toggleSeriesSelection(name) {
  var arr = S.books.filter(function (b) { return b.series === name; });
  var all = arr.length > 0 && arr.every(function (b) { return S.selected[b.id]; });
  arr.forEach(function (b) {
    if (all) delete S.selected[b.id];
    else S.selected[b.id] = true;
  });
  if (!Object.keys(S.selected).length) { exitSelection(); return; }
  render();
}

function onSeriesTap(el) {
  var name = el.getAttribute('data-series');
  if (S.selecting) { toggleSeriesSelection(name); return; }
  openSeriesPanel(name);
}

function openSeriesPanel(name) {
  var arr = S.books.filter(function (b) { return b.series === name; });
  document.getElementById('seriesTitle').textContent = name + ' · ' + arr.length + ' 本';
  document.getElementById('seriesList').innerHTML = arr.map(function (b) {
    return '<div class="series-row" data-id="' + b.id + '" onclick="openReaderById(\'' + b.id + '\')">' +
      '<div class="c" ' + (b.cover ? 'style="background-image:url(' + b.cover + ')"' : '') + '></div>' +
      '<div class="t"><b>' + esc(b.title) + '</b>' +
      '<span>' + (b.author ? esc(b.author) + ' · ' : '') + '已读 ' + Math.round(b.progress || 0) + '%</span></div>' +
      '</div>';
  }).join('') || '<div class="toc-empty">这个系列里还没有书</div>';
  document.getElementById('sheetSeries').classList.add('on');
  showMask();
  bindSeriesRows();
}

/* 系列内长按书籍 → 四项操作 */
function bindSeriesRows() {
  var list = document.getElementById('seriesList');
  var timer = null, moved = false, startY = 0;
  list.addEventListener('touchstart', function (e) {
    var row = e.target.closest('.series-row');
    if (!row) return;
    moved = false;
    startY = e.touches[0].clientY;
    clearTimeout(timer);
    timer = setTimeout(function () {
      if (moved) return;
      try { if (navigator.vibrate) navigator.vibrate(18); } catch (x) { }
      openBookMenu(row.getAttribute('data-id'));
    }, 480);
  }, { passive: true });
  list.addEventListener('touchmove', function (e) {
    if (Math.abs(e.touches[0].clientY - startY) > 10) { moved = true; clearTimeout(timer); }
  }, { passive: true });
  list.addEventListener('touchend', function () { clearTimeout(timer); }, { passive: true });
}

function exitSelection() {
  S.selecting = false;
  S.selMode = 'book';
  S.selSeries = '';
  S.selected = {};
  document.body.classList.remove('selecting');
  document.body.classList.remove('mode-series');
  render();
}

function toggleSelect(id) {
  if (S.selected[id]) delete S.selected[id];
  else S.selected[id] = true;
  if (Object.keys(S.selected).length === 0) { exitSelection(); return; }
  render();
}

function selectedBooks() {
  return S.books.filter(function (b) { return S.selected[b.id]; });
}

function seriesRename() {
  var old = S.selSeries;
  if (!old) return;
  askInput('修改系列名', '输入新的系列名称', old, function (v) {
    if (!v || v === old) return;
    S.books.forEach(function (b) { if (b.series === old) b.series = v; });
    if (S.seriesCovers[old]) { S.seriesCovers[v] = S.seriesCovers[old]; delete S.seriesCovers[old]; }
    save(); exitSelection(); render();
    toast('系列已改名为「' + v + '」');
  });
}

function seriesCover() {
  if (!S.selSeries) return;
  S.coverForSeries = S.selSeries;
  setTimeout(function () {
    try { Native.pickFiles('cover'); } catch (e) { toast('无法打开图片选择器'); }
  }, 100);
}

function seriesDissolve() {
  var name = S.selSeries;
  if (!name) return;
  S.books.forEach(function (b) { if (b.series === name) b.series = ''; });
  delete S.seriesCovers[name];
  save(); exitSelection(); render();
  toast('系列「' + name + '」已解散，书籍回到单册');
}

function selRename() {
  var list = selectedBooks();
  if (list.length !== 1) { toast('重命名只能选一本书'); return; }
  var b = list[0];
  askInput('重命名', '输入新的书名', b.title, function (v) {
    if (!v) return;
    b.title = v; save(); render();
    toast('已重命名');
  });
}

function selSeries() {
  if (!selectedBooks().length) return;
  openSeriesDialog();
}

function selSeriesToggle() {
  var list = selectedBooks();
  if (!list.length) return;
  var allIn = list.every(function (b) { return !!b.series; });
  if (allIn) {
    list.forEach(function (b) { b.series = ''; });
    save(); exitSelection(); render();
    toast('已移出系列');
    return;
  }
  openSeriesDialog();
}

function updateSelbarLabel() {
  var lbl = document.getElementById('selAddSeriesLabel');
  if (!lbl) return;
  var list = selectedBooks();
  var allIn = list.length > 0 && list.every(function (b) { return !!b.series; });
  lbl.textContent = allIn ? '移出系列' : '加入系列';
}

var seriesPick = '';

function openSeriesDialog() {
  seriesPick = '';
  var names = {};
  S.books.forEach(function (b) { if (b.series) names[b.series] = (names[b.series] || 0) + 1; });
  var keys = Object.keys(names);
  document.getElementById('seriesChips').innerHTML = keys.map(function (n) {
    return '<div class="s-chip" data-name="' + esc(n) + '">' + esc(n) +
      ' <span style="opacity:.65">' + names[n] + '</span></div>';
  }).join('');
  var inp = document.getElementById('seriesInput');
  inp.value = '';
  closeAll();
  document.getElementById('dlgSeries').classList.add('on');
  showMask();
}

function confirmSeries() {
  var inp = document.getElementById('seriesInput');
  var v = (inp.value || '').trim() || seriesPick;
  closeAll();
  var list = selectedBooks();
  if (!list.length) return;
  list.forEach(function (b) { b.series = v; });
  save(); render();
  toast(v ? '已加入系列「' + v + '」' : '已移出系列');
}

function selCover() {
  var list = selectedBooks();
  if (list.length !== 1) { toast('改封面只能选一本书'); return; }
  S.coverFor = list[0].id;
  setTimeout(function () {
    try { Native.pickFiles('cover'); } catch (e) { toast('无法打开图片选择器'); }
  }, 100);
}

function selDelete() {
  var list = selectedBooks();
  if (!list.length) return;
  document.getElementById('cfText').textContent =
    list.length === 1
      ? '确定从书架移除《' + list[0].title + '》吗？原始文件不会被删除。'
      : '确定从书架移除这 ' + list.length + ' 本书吗？原始文件不会被删除。';
  S.pendingDelete = list.map(function (b) { return b.id; });
  document.getElementById('dlgConfirm').classList.add('on');
  showMask();
}

var menuBookId = null;
function openBookMenu(id) {
  var b = S.books.find(function (x) { return x.id === id; });
  if (!b) return;
  menuBookId = id;
  document.getElementById('bmTitle').textContent = b.title;
  var lbl = document.getElementById('bmSeriesLabel');
  if (lbl) lbl.textContent = b.series ? '移出系列' : '加入系列';
  closeAll();
  document.getElementById('sheetBook').classList.add('on');
  showMask();
}

function menuBook() {
  return S.books.find(function (x) { return x.id === menuBookId; });
}

function renameBook() {
  var b = menuBook(); if (!b) return;
  closeAll();
  askInput('重命名', '输入新的书名', b.title, function (v) {
    if (!v) return;
    b.title = v; save(); render(); toast('已重命名');
  });
}

function seriesBook() {
  var b = menuBook(); if (!b) return;
  if (b.series) {
    var old = b.series;
    b.series = '';
    save(); closeAll(); render();
    toast('已移出系列「' + old + '」');
    return;
  }
  S.selected = {}; S.selected[b.id] = true;
  openSeriesDialog();
}

function changeCover() {
  var b = menuBook(); if (!b) return;
  S.coverFor = b.id;
  closeAll();
  setTimeout(function () {
    try { Native.pickFiles('cover'); }
    catch (e) { toast('无法打开图片选择器'); }
  }, 120);
}

function askDelete() {
  var b = menuBook(); if (!b) return;
  document.getElementById('cfText').textContent =
    '确定从书架移除《' + b.title + '》吗？原始文件不会被删除。';
  closeAll();
  document.getElementById('dlgConfirm').classList.add('on');
  showMask();
}

function confirmDelete() {
  closeAll();
  var ids = S.pendingDelete || (menuBookId ? [menuBookId] : []);
  S.books = S.books.filter(function (x) { return ids.indexOf(x.id) < 0; });
  S.pendingDelete = null;
  save(); render();
  exitSelection();
  toast('已删除');
}

/* 阅读背景图：压缩后存为 dataURL */
function readBgImage(file) {
  var b64;
  try { b64 = Native.readBase64(file.uri); } catch (e) { b64 = ''; }
  if (!b64) { toast('读取图片失败'); return; }
  var mime = /\.png$/i.test(file.name) ? 'png' : /\.webp$/i.test(file.name) ? 'webp' : 'jpeg';
  var src = 'data:image/' + mime + ';base64,' + b64;
  var img = new Image();
  img.onload = function () {
    try {
      var maxW = 1080;
      var sc = Math.min(1, maxW / img.width);
      var cv = document.createElement('canvas');
      cv.width = Math.round(img.width * sc);
      cv.height = Math.round(img.height * sc);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      readerTarget().bgImage = cv.toDataURL('image/jpeg', 0.8);
    } catch (e) {
      readerTarget().bgImage = src;
    }
    applyReaderStyle(); save(); flushSave(); toast('背景已更新');
  };
  img.onerror = function () {
    readerTarget().bgImage = src; applyReaderStyle(); save(); flushSave(); toast('背景已更新');
  };
  img.src = src;
}

/* 给书籍设置封面：先读图，压到合适尺寸再存 */
function prepareImage(file, maxW, maxH, cb) {
  var b64;
  try { b64 = Native.readBase64(file.uri); } catch (e) { b64 = ''; }
  if (!b64) { toast('读取图片失败'); return; }
  var mime = /\.png$/i.test(file.name) ? 'png'
    : /\.webp$/i.test(file.name) ? 'webp'
      : /\.gif$/i.test(file.name) ? 'gif' : 'jpeg';
  var src = 'data:image/' + mime + ';base64,' + b64;
  var img = new Image();
  img.onload = function () {
    try {
      var sc = Math.min(1, maxW / img.width, maxH / img.height);
      var cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(img.width * sc));
      cv.height = Math.max(1, Math.round(img.height * sc));
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      cb(cv.toDataURL('image/jpeg', 0.82));
    } catch (e) { cb(src); }
  };
  img.onerror = function () { cb(src); };
  img.src = src;
}

function applyCover(book, file) {
  prepareImage(file, 480, 720, function (url) {
    book.cover = url;
    save(); render(); toast('封面已更新');
  });
}

/* ---------- 阅读入口 ---------- */
function continueReading() {
  const recent = S.books.filter(b => b.lastRead).sort((a, b) => b.lastRead - a.lastRead)[0];
  if (recent) openReader(recent);
  else if (S.books.length) openReader(S.books[0]);
  else startImport('local');
}

/* ---------- 底部导航 ---------- */
const TAB_ORDER = { lib: 0, cat: 1, stat: 2, set: 3 };

function activateScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  var el = document.getElementById(id);
  if (el) el.classList.add('active');
  document.querySelectorAll('.tabbar .tab').forEach(function (t, i) {
    t.classList.toggle('active', TAB_ORDER[id] === i);
  });
  if (id === 'cat') renderCat();
}

function switchTab(id, el) {
  activateScreen(id);
}

function renderCat() {
  var body = document.getElementById('catBody');
  if (!body) return;

  if (!S.books.length) {
    body.innerHTML = '<div class="empty"><p>书架还是空的</p>' +
      '<span style="font-size:13px">导入的书会按系列分组显示在这里</span></div>';
    return;
  }

  var groups = {};
  S.books.forEach(function (b) {
    var k = b.series || '';
    (groups[k] = groups[k] || []).push(b);
  });

  var names = Object.keys(groups).filter(function (k) { return k; })
    .sort(function (a, b) { return a.localeCompare(b, 'zh'); });

  var html = '';
  names.forEach(function (n) { html += shelfGroup(n, groups[n]); });
  var un = groups[''] || [];
  if (un.length) html += shelfGroup('未分组', un);

  body.innerHTML = html;
}

function shelfGroup(name, arr) {
  var cards = arr.map(function (b) {
    return '<div class="book" data-id="' + b.id + '" onclick="openReaderById(\'' + b.id + '\')">' +
      (b.cover ? '<img class="cover-img" alt="" src="' + b.cover + '">' : '<div class="placeholder">BOOK</div>') +
      '<div class="pick"></div>' +
      '<div class="title">' + esc(b.title) + '</div></div>';
  }).join('');
  return '<div class="shelf-group">' +
    '<div class="shelf-head"><h2>' + esc(name) + '</h2><span>' + arr.length + ' 本</span></div>' +
    '<div class="shelf-grid">' + cards + '</div></div>';
}

function renderStat() {
  var body = document.getElementById('statBody');
  if (!body) return;

  var tags = {};
  S.books.forEach(function (b) {
    (b.tags || []).forEach(function (t) {
      (tags[t] = tags[t] || []).push(b);
    });
  });
  var keys = Object.keys(tags).sort(function (a, b) { return a.localeCompare(b, 'zh'); });

  if (!keys.length) {
    body.innerHTML = '<div class="empty"><p>还没有标签</p>' +
      '<span style="font-size:13px">导入书籍时添加标签，这里就会显示</span></div>';
    return;
  }

  body.innerHTML = '<div class="tag-list">' + keys.map(function (t) {
    return '<div class="tag-row" onclick="openTagPanel(\'' + esc(t).replace(/'/g, "\\'") + '\')">' +
      '<span class="tag-bar"></span>' +
      '<span class="tag-name"># ' + esc(t) + '</span>' +
      '<span class="tag-count">' + tags[t].length + '</span></div>';
  }).join('') + '</div>';
}

function openTagPanel(name) {
  var arr = S.books.filter(function (b) { return (b.tags || []).indexOf(name) >= 0; });
  document.getElementById('seriesTitle').textContent = '#' + name + ' · ' + arr.length + ' 本';
  document.getElementById('seriesList').innerHTML = arr.map(function (b) {
    return '<div class="series-row" data-id="' + b.id + '" onclick="openReaderById(\'' + b.id + '\')">' +
      '<div class="c" ' + (b.cover ? 'style="background-image:url(' + b.cover + ')"' : '') + '></div>' +
      '<div class="t"><b>' + esc(b.title) + '</b><span>已读 ' + Math.round(b.progress || 0) + '%</span></div></div>';
  }).join('') || '<div class="toc-empty">这个标签下还没有书</div>';
  document.getElementById('sheetSeries').classList.add('on');
  showMask();
}

function renderSet() {
  var r = S.reader;
  var body = document.getElementById('setBody');
  if (!body) return;
  var bgName = r.bgImage ? '自定义图片' : r.bg;
  body.innerHTML =
    '<div class="set-group">' +
    '<div class="set-title">阅读默认设置（对所有书生效）</div>' +
    '<div id="setReaderPanel"></div>' +
    '</div>' +
    '<div class="set-group">' +
    '<div class="set-title">书籍</div>' +
    '<div class="set-item"><span>藏书总数</span><em>' + S.books.length + ' 本</em></div>' +
    '</div>' +
    '<div class="set-group">' +
    '<div class="set-title">关于</div>' +
    '<div class="set-item"><span>墨读</span><em>v1.0 · 正式版</em></div>' +
    '</div>';

  var panel = document.getElementById('setReaderPanel');
  if (panel) {
    buildReaderSettings(panel, {});
  }
}

/* ---------- 搜索 ---------- */
function openSearch() {
  document.getElementById('searchLayer').classList.add('on');
  setTimeout(() => document.getElementById('searchInput').focus(), 120);
}
function closeSearch() {
  document.getElementById('searchLayer').classList.remove('on');
  document.getElementById('searchInput').value = '';
  document.getElementById('searchResults').innerHTML = '';
}
function runSearch(q) {
  q = (q || '').trim().toLowerCase();
  const box = document.getElementById('searchResults');
  if (!q) { box.innerHTML = ''; return; }
  const hits = S.books.filter(b =>
    (b.title || '').toLowerCase().indexOf(q) >= 0 ||
    (b.author || '').toLowerCase().indexOf(q) >= 0);
  box.innerHTML = hits.length ? hits.map(b =>
    '<div class="sr-item" onclick="closeSearch();openReaderById(\'' + b.id + '\')">' +
    '<div class="c" ' + (b.cover ? 'style="background-image:url(' + b.cover + ')"' : '') + '></div>' +
    '<div><b>' + esc(b.title) + '</b><span>' + esc(b.author || '未知作者') + ' · ' +
    b.ext.toUpperCase() + '</span></div></div>').join('')
    : '<div class="empty"><p>没有找到「' + esc(q) + '」</p></div>';
}
function openReaderById(id) {
  closeAll();
  const b = S.books.find(x => x.id === id);
  if (b) openReader(b);
}

/* ---------- 返回键 ---------- */
window.handleBack = function () {
  if (S.selecting) { exitSelection(); return; }
  if (document.getElementById('searchLayer').classList.contains('on')) { closeSearch(); return; }
  if (document.querySelector('.dialog.on') || document.querySelector('.sheet.on')) { closeAll(); return; }
  if (document.querySelector('.popover.on')) { closePops(); return; }
  if (document.getElementById('reader').classList.contains('active')) { closeReader(); return; }
  if (document.getElementById('lib').classList.contains('active')) {
    if (S.edit) { openEditMode(); return; }
    return;
  }
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('lib').classList.add('active');
  document.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('active', i === 0));
};

/* ---------- 面板打开时收起底部导航 ---------- */
function syncChrome() {
  const open = !!document.querySelector('.sheet.on, .dialog.on');
  const bar = document.querySelector('.tabbar');
  if (bar) bar.classList.toggle('lift', open);
}
bindLongPress();
new MutationObserver(syncChrome).observe(document.body, {
  attributes: true, subtree: true, attributeFilter: ['class']
});

/* ---------- 启动 ---------- */
load();
applyReaderStyle();
S.edit = false;
document.body.classList.remove('edit-mode');
render();

document.getElementById('mask').addEventListener('click', closeAll);
document.addEventListener('visibilitychange', function () {
  if (document.hidden) flushSave();
});
window.addEventListener('pagehide', flushSave);
window.addEventListener('beforeunload', flushSave);
