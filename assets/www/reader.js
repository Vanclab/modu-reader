/* ============ 墨读 · 阅读器 ============ */
let R = {
  book: null, mode: null, pages: [], idx: 0, total: 0,
  chapters: [], ci: 0, timer: null, barsHidden: false
};

const UNSUPPORTED = ['mobi', 'azw', 'azw3', 'azw4', 'cbr', 'rar', '7z'];

function openReader(book) {
  R.book = book;
  R.flip = (typeof currentReader === 'function' ? currentReader().flip : 'scroll') || 'scroll';
  R.barsHidden = false;
  R.pages = []; R.idx = 0; R.total = 0; R.chapters = []; R.ci = 0;

  setImgChrome(false);
  document.getElementById('rTitle').textContent = book.title;
  document.getElementById('readerTop').classList.remove('hide');
  document.getElementById('readerBar').classList.remove('hide');
  const body = document.getElementById('readerBody');
  body.className = 'reader-body';
  body.innerHTML = '<div style="padding:60px 0;text-align:center;color:#8A93A1">正在打开…</div>';
  body.scrollTop = 0;

  S.activeBookId = book.id;
  if (typeof applyReaderStyle === 'function') applyReaderStyle();
  var cur = document.querySelector('.screen.active');
  R.fromScreen = (cur && cur.id) ? cur.id : 'lib';
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('reader').classList.add('active');
  document.body.classList.add('reading');

  book.lastRead = Date.now();
  save();
  startReadingTimer();
  startProgressTicker();
  hideChrome();
  startHudTicker();
  bindReaderTap();

  const ext = book.ext;
  if (UNSUPPORTED.indexOf(ext) >= 0) {
    showUnsupported(ext);
  } else if (ext === 'pdf') {
    openPdf();
  } else if (ext === 'epub') {
    openEpub();
  } else if (COMIC_EXT.indexOf(ext) >= 0) {
    openComicZip();
  } else {
    openText();
  }
}

function closeReader() {
  try { closeReaderSettings(); } catch (e) { }
  stopReadingTimer();
  stopProgressTicker();
  stopHudTicker();
  const p = currentProgress();
  if (R.book && p > 0) { R.book.progress = p; }
  if (R.book) R.book.lastRead = Date.now();
  save(); render();
  document.getElementById('reader').classList.remove('active');
  document.body.classList.remove('reading');
  S.activeBookId = null;
  if (typeof applyReaderStyle === 'function') applyReaderStyle();
  if (typeof activateScreen === 'function') activateScreen(R.fromScreen || 'lib');
  else document.getElementById('lib').classList.add('active');
  document.getElementById('readerBody').innerHTML = '';
  R.book = null;
}

function hideChrome() {
  R.barsHidden = true;
  document.getElementById('readerTop').classList.add('hide');
  document.getElementById('readerBar').classList.add('hide');
  document.getElementById('hud').classList.remove('off');
  updateHud();
}
function showChrome() {
  R.barsHidden = false;
  document.getElementById('readerTop').classList.remove('hide');
  document.getElementById('readerBar').classList.remove('hide');
  document.getElementById('hud').classList.add('off');
}
function toggleChrome() { if (R.barsHidden) showChrome(); else hideChrome(); }
function toggleReaderMenu() { hideChrome(); }

function updateHud() {
  var pctEl = document.getElementById('hudPct');
  if (pctEl) pctEl.textContent = bookProgress().toFixed(2) + '%';
  var chEl = document.getElementById('hudChap');
  if (chEl) {
    if (R.mode === 'paged') {
      chEl.textContent = R.total ? ('第' + (R.idx + 1) + '页/共' + R.total + '页') : '';
    } else if (R.chapters && R.chapters.length) {
      chEl.textContent = '第' + (R.ci + 1) + '章/共' + R.chapters.length + '章';
    } else { chEl.textContent = ''; }
  }
  var tEl = document.getElementById('hudTime');
  if (tEl) {
    var d = new Date();
    tEl.textContent = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }
}
function startHudTicker() { stopHudTicker(); R.hud = setInterval(updateHud, 1000); }
function stopHudTicker() { if (R.hud) { clearInterval(R.hud); R.hud = null; } }

function showMsg(html) {
  document.getElementById('readerBody').innerHTML =
    '<div style="padding:70px 10px;text-align:center;color:#7A8290;line-height:1.9">' + html + '</div>';
}

function showUnsupported(ext) {
  showMsg('<div style="font-size:44px;margin-bottom:16px">📦</div>' +
    '<b style="font-size:17px;color:#3B4250">' + ext.toUpperCase() + ' 格式暂未支持</b><br>' +
    '<span style="font-size:14px">文件已加入书架，但当前版本还解析不了这种格式。<br>' +
    '可先转为 EPUB / TXT / CBZ 再导入。</span>');
}

/* ---------------- 文本 ---------------- */
function decodeBytes(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (e) {
    try { return new TextDecoder('gbk').decode(bytes); }
    catch (e2) { return new TextDecoder('utf-8').decode(bytes); }
  }
}

function readBytes(uri) {
  const b64 = Native.readBase64(uri);
  if (!b64) throw new Error('读取失败');
  return b64ToBytes(b64);
}

function openText() {
  try {
    const bytes = readBytes(R.book.uri);
    const text = decodeBytes(bytes).replace(/\r\n/g, '\n');
    const isMd = (R.book.ext === 'md' || R.book.ext === 'markdown');
    let chs = isMd ? splitMarkdown(text) : (splitChapters(text) || autoSplit(text));
    if (!chs || !chs.length) chs = [{ title: (R.book.title || '正文'), body: text }];
    R.chapters = chs;
    R.markdown = isMd;
    bindEdgeGuard();
    renderChapter(Math.max(0, Math.min(chs.length - 1, R.book.ci || 0)), true);
    restoreProgress();
  } catch (e) {
    showMsg('读取失败：' + e.message);
  }
}

function splitChapters(text) {
  var re = /^[ \t]*(?:第[零一二三四五六七八九十百千万两0-9]{1,9}[章节回卷幕篇集][^\n]{0,50}|(?:序章|楔子|引子|前言|序言|尾声|后记|终章|番外)[^\n]{0,30}|Chapter\s+\d+[^\n]{0,50})[ \t]*$/gim;
  var marks = [], m;
  while ((m = re.exec(text)) !== null) {
    if (m.index === re.lastIndex) re.lastIndex++;
    marks.push({ i: m.index, t: m[0].trim() });
  }
  marks = marks.filter(function (k, idx) {
    return idx === 0 || marks[idx - 1].t !== k.t;
  });
  if (marks.length >= 2) {
    var chs = [];
    for (var k = 0; k < marks.length; k++) {
      var start = marks[k].i;
      var end = k + 1 < marks.length ? marks[k + 1].i : text.length;
      var body = text.slice(start, end).replace(/^[^\n]*(\n|$)/, '');
      if (body.trim()) chs.push({ title: marks[k].t, body: body });
    }
    return chs.length ? chs : null;
  }
  return null;
}

function autoSplit(text, size) {
  size = size || 4000;
  if (text.length < size * 1.2) return null;
  var paras = text.split('\n');
  var chs = [], buf = [], len = 0, n = 1;
  for (var i = 0; i < paras.length; i++) {
    buf.push(paras[i]);
    len += paras[i].length + 1;
    if (len >= size) {
      chs.push({ title: '第 ' + n + ' 部分', body: buf.join('\n') });
      n++; buf = []; len = 0;
    }
  }
  if (buf.join('').trim()) chs.push({ title: '第 ' + n + ' 部分', body: buf.join('\n') });
  return chs.length > 1 ? chs : null;
}

function chapterFromProgress(p) {
  const n = (R.chapters || []).length;
  if (!n) return 0;
  let i = Math.floor((p || 0) / 100 * n);
  return Math.max(0, Math.min(n - 1, i));
}

function splitMarkdown(md) {
  const re = /^(#{1,3})[ \t]+(.+)$/gm;
  const marks = [];
  let m;
  while ((m = re.exec(md)) !== null) marks.push({ i: m.index, t: m[2].trim() });
  if (marks.length < 2) return null;
  const chs = [];
  for (let k = 0; k < marks.length; k++) {
    const end = k + 1 < marks.length ? marks[k + 1].i : md.length;
    const body = md.slice(marks[k].i, end).replace(/^[^\n]*(\n|$)/, '');
    chs.push({ title: marks[k].t, body: body });
  }
  return chs;
}

function markdownToHtml(md) {
  return md
    .replace(/^###### (.*)$/gm, '<h3>$1</h3>')
    .replace(/^##### (.*)$/gm, '<h3>$1</h3>')
    .replace(/^#### (.*)$/gm, '<h3>$1</h3>')
    .replace(/^### (.*)$/gm, '<h3>$1</h3>')
    .replace(/^## (.*)$/gm, '<h3>$1</h3>')
    .replace(/^# (.*)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\*(.+?)\*/g, '<i>$1</i>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^&gt; (.*)$/gm, '<blockquote>$1</blockquote>')
    .split(/\n{2,}/).map(function (par) {
      if (/^\s*<(h[1-6]|blockquote|pre|ul|ol)/.test(par)) return par;
      return '<p>' + par.replace(/\n/g, '<br>') + '</p>';
    }).join('');
}

function chapterHtml(body, isMd) {
  if (isMd) return markdownToHtml(body);
  return body.split('\n').filter(function (l) { return l.trim(); })
    .map(function (l) { return '<p>' + esc(l) + '</p>'; }).join('');
}

/* ---------- 目录 ---------- */
function openToc() {
  if (!R.book) return;
  var list = document.getElementById('tocList');
  var count = document.getElementById('tocCount');
  var items = [];
  if (R.mode === 'paged') {
    var step = R.total > 120 ? Math.ceil(R.total / 120) : 1;
    for (var p = 0; p < R.total; p += step) {
      items.push({ label: '第 ' + (p + 1) + ' 页', data: p, cur: Math.abs(p - R.idx) < step });
    }
  } else {
    var cur = currentChapterIndex();
    (R.chapters || []).forEach(function (c, i) {
      items.push({ label: c.title, data: i, cur: i === cur });
    });
  }
  count.textContent = items.length + ' 节';
  list.innerHTML = items.length ? items.map(function (it) {
    return '<div class="toc-item' + (it.cur ? ' on' : '') + '" onclick="tocJump(' + it.data + ')">' +
      esc(it.label) + '</div>';
  }).join('') : '<div class="toc-empty">没有可用的目录</div>';
  document.getElementById('tocSheet').classList.add('on');
  document.getElementById('tocMask').classList.add('on');
  if (curIdxCache >= 0) {
    var el = list.children[curIdxCache];
    if (el) setTimeout(function () { el.scrollIntoView({ block: 'center' }); }, 60);
  }
}

var curIdxCache = -1;
function currentChapterIndex() {
  if (R.mode === 'paged') return 0;
  if (R.mode === 'chapters') { curIdxCache = R.ci; return R.ci; }
  var body = document.getElementById('readerBody');
  var els = body.querySelectorAll('h2.chapter');
  if (!els.length) { curIdxCache = -1; return 0; }
  var top = body.scrollTop + 90, idx = 0;
  for (var i = 0; i < els.length; i++) {
    if (els[i].offsetTop <= top) idx = i; else break;
  }
  curIdxCache = idx;
  return idx;
}

function tocJump(data) {
  closeToc();
  if (R.mode === 'paged') { gotoPage(data); return; }
  if (R.mode === 'chapters') { renderChapter(data); return; }
  var body = document.getElementById('readerBody');
  var el = document.getElementById('ch' + data);
  if (el) {
    body.scrollTop = Math.max(0, el.offsetTop - 8);
    refreshProgress();
  }
}
function closeToc() {
  document.getElementById('tocSheet').classList.remove('on');
  document.getElementById('tocMask').classList.remove('on');
}

function refreshProgress() {
  var p = currentProgress();
  var t = document.getElementById('rProgress');
  var sl = document.getElementById('rSlider');
  if (t) t.textContent = Math.round(p) + '%';
  if (sl) sl.value = Math.round(p);
  var hp = document.getElementById('hudPct');
  if (hp) hp.textContent = bookProgress().toFixed(2) + '%';
  if (R.book && R.mode) R.book.progress = p;
  return p;
}

function bindScrollProgress() {
  const body = document.getElementById('readerBody');
  body.onscroll = function () { refreshProgress(); };
  body.addEventListener('touchmove', refreshProgress, { passive: true });
  body.addEventListener('touchend', refreshProgress, { passive: true });
}

function currentProgress() {
  const body = document.getElementById('readerBody');
  if (!body) return 0;
  if (R.mode === 'paged') {
    return R.total ? ((R.idx + 1) / R.total) * 100 : 0;
  }
  return Math.min(100, chapterFrac() * 100);
}

/* 章节内阅读比例 */
function chapterFrac() {
  if (R.flip === 'page') {
    if (R.mode !== 'chapters') return 0;
    return R.pageCount > 1 ? R.pageIdx / (R.pageCount - 1) : 1;
  }
  const body = document.getElementById('readerBody');
  if (!body) return 0;
  const max = body.scrollHeight - body.clientHeight;
  return max > 0 ? Math.min(1, Math.max(0, body.scrollTop / max)) : 1;
}

/* ---------- 左右翻页 ---------- */
function raf(fn) {
  if (window.requestAnimationFrame) window.requestAnimationFrame(fn);
  else setTimeout(fn, 16);
}

function layoutPagedChapter(html) {
  const body = document.getElementById('readerBody');
  body.className = 'reader-body page-mode';
  body.onscroll = null;
  body.innerHTML = '<div class="page-inner" id="pgInner">' + html + '</div>';
  bindEpubImages();
  R.pageIdx = 0;
  raf(function () { paginate(); });
}

function paginate() {
  const body = document.getElementById('readerBody');
  const inner = document.getElementById('pgInner');
  if (!inner || !body) return;
  const W = body.clientWidth, H = body.clientHeight;
  const padX = S.reader.padX, padY = S.reader.padY;
  const cw = Math.max(140, W - padX * 2);
  inner.style.width = cw + 'px';
  inner.style.height = Math.max(200, H - padY - 28) + 'px';
  inner.style.columnWidth = cw + 'px';
  inner.style.columnGap = (W - cw) + 'px';
  inner.style.left = padX + 'px';
  inner.style.top = padY + 'px';
  const gap = W - cw;
  R.pageStep = W;
  R.pageCount = Math.max(1, Math.round((inner.scrollWidth + gap) / W));
  if (R._gotoLast) { R.pageIdx = R.pageCount - 1; R._gotoLast = false; }
  if (R._restoreFrac != null) {
    R.pageIdx = Math.max(0, Math.min(R.pageCount - 1, Math.round(R._restoreFrac * (R.pageCount - 1))));
    R._restoreFrac = null;
  }
  applyPageTransform();
  refreshProgress();
}

function applyPageTransform() {
  const inner = document.getElementById('pgInner');
  if (!inner) return;
  inner.style.transform = 'translateX(' + (-R.pageIdx * (R.pageStep || 0)) + 'px)';
}

function flipPage(dir) {
  if (R.mode !== 'chapters') return;
  const target = R.pageIdx + dir;
  if (target < 0) {
    if (R.ci > 0) { R._gotoLast = true; renderChapter(R.ci - 1); }
    else toast('已是第一页');
    return;
  }
  if (target >= R.pageCount) {
    if (R.ci < (R.chapters || []).length - 1) renderChapter(R.ci + 1);
    else toast('已到底');
    return;
  }
  R.pageIdx = target;
  applyPageTransform();
  refreshProgress();
}

function relayoutReader() {
  if (!R.book) return;
  if (R.mode !== 'chapters') return;
  const frac = chapterFrac();
  R._restoreFrac = isNaN(frac) ? 0 : frac;
  renderChapter(R.ci, true);
}

/* 整本书阅读进度（用于底部百分比） */
function bookProgress() {
  if (R.mode === 'paged') return R.total ? ((R.idx + 1) / R.total) * 100 : 0;
  const body = document.getElementById('readerBody');
  if (!body) return 0;
  const frac = chapterFrac();
  const n = (R.chapters && R.chapters.length) || 1;
  return Math.min(100, ((R.ci + frac) / n) * 100);
}

function seekReader(v) {
  v = Number(v);
  if (R.mode === 'paged') {
    gotoPage(Math.round(v / 100 * (R.total - 1)));
    return;
  }
  if (R.mode === 'chapters' && R.flip === 'page') {
    const n = Math.max(1, R.pageCount || 1);
    R.pageIdx = Math.max(0, Math.min(n - 1, Math.round(v / 100 * (n - 1))));
    applyPageTransform();
    refreshProgress();
    return;
  }
  const body = document.getElementById('readerBody');
  body.scrollTop = (body.scrollHeight - body.clientHeight) * v / 100;
  refreshProgress();
}

function restoreProgress() {
  const p = R.book ? (R.book.progress || 0) : 0;
  if (p <= 0) return;
  const frac = Math.min(1, p / 100);
  setTimeout(function () {
    const body = document.getElementById('readerBody');
    body.scrollTop = (body.scrollHeight - body.clientHeight) * frac;
    refreshProgress();
  }, 90);
}

/* ---------------- EPUB ---------------- */
function openEpub() {
  try {
    const bytes = readBytes(R.book.uri);
    const zip = new JSZip();
    zip.loadAsync(bytes).then(() => {
      return epubSpine(zip).then(res => {
        let list = res.chapters || [];
        if (res.cover) {
          list.unshift({
            title: '封面',
            html: '<div class="cover-page"><img src="' + res.cover + '" alt=""/></div>'
          });
        }
        if (!list.length) { showMsg('这本书里没找到正文'); return; }
        R.chapters = list;
        R.markdown = false;
        R.mode = 'chapters';
        bindEdgeGuard();
        renderChapter(Math.max(0, Math.min(list.length - 1, R.book.ci || 0)), true);
        restoreProgress();
      });
    }).catch(e => showMsg('EPUB 解析失败：' + e.message));
  } catch (e) {
    showMsg('读取失败：' + e.message);
  }
}

function epubSpine(zip) {
  const container = zip.file('META-INF/container.xml');
  const findOpf = container
    ? container.async('string').then(xml => {
      const m = /full-path="([^"]+)"/.exec(xml);
      return m ? m[1] : null;
    })
    : Promise.resolve(null);

  return findOpf.then(opfPath => {
    if (!opfPath) {
      const guess = zip.file(/\.opf$/i)[0];
      return guess ? guess.async('string').then(x => ({ path: guess.name, xml: x })) : null;
    }
    const f = zip.file(opfPath);
    return f ? f.async('string').then(x => ({ path: opfPath, xml: x })) : null;
  }).then(opf => {
    if (!opf) return [];
    const base = opf.path.indexOf('/') >= 0 ? opf.path.replace(/[^/]+$/, '') : '';
    const man = {};
    const items = opf.xml.match(/<item\s[^>]*>/g) || [];
    items.forEach(it => {
      const id = /id="([^"]+)"/.exec(it);
      const href = /href="([^"]+)"/.exec(it);
      if (id && href) man[id[1]] = decodeURIComponent(href[1]);
    });
    const spine = (opf.xml.match(/<itemref\s[^>]*>/g) || [])
      .map(r => { const m = /idref="([^"]+)"/.exec(r); return m ? man[m[1]] : null; })
      .filter(Boolean);

    // 找封面图
    let coverHref = null;
    const covItem = (opf.xml.match(/<item[^>]*properties="[^"]*cover-image[^"]*"[^>]*>/i) || [])[0];
    if (covItem) {
      const m = /href="([^"]+)"/.exec(covItem);
      if (m) coverHref = decodeURIComponent(m[1]);
    }
    if (!coverHref) {
      const meta = /<meta[^>]*name="cover"[^>]*content="([^"]+)"/i.exec(opf.xml);
      if (meta && man[meta[1]]) coverHref = man[meta[1]];
    }
    if (!coverHref) {
      const firstImg = zip.file(/\.(jpe?g|png|webp|gif)$/i)[0];
      if (firstImg) coverHref = firstImg.name.replace(base, '');
    }
    let coverPromise = Promise.resolve(null);
    if (coverHref) {
      const cf = zip.file(base + coverHref) || zip.file(coverHref);
      if (cf) {
        coverPromise = cf.async('base64').then(function (b64) {
          return 'data:' + mimeOf(cf.name) + ';base64,' + b64;
        }).catch(function () { return null; });
      }
    }

    const chapters = [];
    let chain = Promise.resolve();
    spine.forEach((href, i) => {
      chain = chain.then(() => {
        const f = zip.file(base + href) || zip.file(href);
        if (!f) return;
        return f.async('string').then(html => {
          const dir = (base + href).replace(/[^/]*$/, '');
          return inlineEpubContent(zip, html, dir).then(res => {
            if (!res.text && !res.hasImg) return;
            let title = res.title;
            if (!title) {
              const first = (res.text || '').split('\n')[0].trim();
              title = (first && first.length <= 40) ? first : ('第 ' + (i + 1) + ' 节');
            }
            chapters.push({ title: title, html: res.html, body: res.text });
          });
        });
      });
    });
    return chain.then(() => coverPromise).then(cov => ({ chapters: chapters, cover: cov }));
  });
}


/* 把 EPUB 章节里的图片内联成 dataURL，并去掉会干扰排版的样式 */
function epubJoin(dir, rel) {
  rel = (rel || '').trim();
  if (!rel || /^(data:|https?:)/i.test(rel)) return null;
  if (rel.charAt(0) === '/') return rel.replace(/^\/+/, '');
  const parts = (dir + rel).split('/');
  const out = [];
  parts.forEach(function (p) {
    if (!p || p === '.') return;
    if (p === '..') out.pop(); else out.push(p);
  });
  return out.join('/');
}

function findZipFile(zip, path) {
  if (!path) return null;
  let f = zip.file(path);
  if (f) return f;
  try {
    const dec = decodeURIComponent(path);
    f = zip.file(dec);
    if (f) return f;
    const enc = encodeURI(path).replace(/#/g, '%23');
    f = zip.file(enc);
    if (f) return f;
  } catch (e) { }
  const lower = path.toLowerCase();
  const all = zip.file(/.*/);
  for (let i = 0; i < all.length; i++) {
    if (all[i].name.toLowerCase() === lower) return all[i];
  }
  return null;
}

function mimeOf(name) {
  const ext = (name.match(/\.([a-z0-9]+)$/i) || [, ''])[1].toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'svg') return 'image/svg+xml';
  return 'image/jpeg';
}

function inlineEpubContent(zip, html, dir) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const docTitle = (doc.title || '').trim();
  const titleEl = doc.querySelector('title');

  doc.querySelectorAll('script,style,link,meta,base').forEach(function (e) { e.remove(); });

  const imgs = Array.prototype.slice.call(doc.querySelectorAll('img'));
  const tasks = imgs.map(function (img) {
    let src = img.getAttribute('src') || img.getAttribute('data-src') || '';
    if (!src || /^data:/i.test(src)) return Promise.resolve();
    const path = epubJoin(dir, src);
    const f = findZipFile(zip, path);
    if (!f) { img.remove(); return Promise.resolve(); }
    return f.async('base64').then(function (b64) {
      img.setAttribute('src', 'data:' + mimeOf(f.name) + ';base64,' + b64);
      img.removeAttribute('srcset');
    }).catch(function () { img.remove(); });
  });

  // SVG 里的 <image xlink:href>
  const sImgs = Array.prototype.slice.call(doc.querySelectorAll('image'));
  sImgs.forEach(function (el) {
    const href = el.getAttribute('xlink:href') || el.getAttribute('href') || '';
    if (!href || /^data:/i.test(href)) return;
    const f = findZipFile(zip, epubJoin(dir, href));
    if (!f) return;
    tasks.push(f.async('base64').then(function (b64) {
      el.setAttribute('href', 'data:' + mimeOf(f.name) + ';base64,' + b64);
      el.removeAttribute('xlink:href');
    }).catch(function () { }));
  });

  return Promise.all(tasks).then(function () {
    doc.querySelectorAll('*').forEach(function (el) {
      el.removeAttribute('style');
      el.removeAttribute('class');
      el.removeAttribute('id');
      el.removeAttribute('width');
      el.removeAttribute('height');
    });
    // 独占一段的图片铺满整行；和文字混排的小图保持原样
    doc.querySelectorAll('img').forEach(function (img) {
      var p = img.parentElement;
      var txt = p ? (p.textContent || '').replace(/\s+/g, '') : '';
      if (!txt) {
        img.setAttribute('class', 'blk');
        // 包一层，翻页模式下独占一页
        if (p && p.childNodes.length === 1) {
          var wrap = doc.createElement('div');
          wrap.className = 'img-page';
          p.insertBefore(wrap, img);
          p.removeChild(img);
          wrap.appendChild(img);
        }
      }
    });
    doc.querySelectorAll('svg').forEach(function (sv) {
      sv.setAttribute('class', 'svgw');
    });
    const body = doc.body || doc.documentElement;
    const text = (body.textContent || '').replace(/\s+\n/g, '\n').trim();
    let title = docTitle;
    if (!title) {
      const h = body.querySelector('h1,h2,h3');
      if (h) title = (h.textContent || '').trim().slice(0, 40);
    }
    if (titleEl) titleEl.remove();
    return {
      html: (body.innerHTML || '').trim(),
      text: text,
      title: title,
      hasImg: imgs.length > 0
    };
  });
}

function htmlToText(html) {
  return html
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/<!(DOCTYPE|doctype)[^>]*>/g, '')
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n').trim();
}

function renderChapter(i, keepScroll) {
  const c = R.chapters[i];
  R.flip = (typeof currentReader === 'function' ? currentReader().flip : 'scroll') || 'scroll';
  if (!c) return;
  R.ci = i;
  R.mode = 'chapters';
  setImgChrome(false);
  const body = document.getElementById('readerBody');
  body.className = 'reader-body';

  let html = '';
  if (c.html) {
    const hasHead = /^\s*<(h1|h2|h3|h4)/i.test(c.html);
    if (!hasHead) html += '<h2 class="chapter" id="ch' + i + '">' + esc(c.title) + '</h2>';
    html += '<div class="epub-body">' + c.html + '</div>';
  } else {
    html += '<h2 class="chapter" id="ch' + i + '">' + esc(c.title) + '</h2>';
    html += chapterHtml(c.body, R.markdown);
  }
  html += '<div class="ch-nav">';
  if (i > 0) {
    html += '<button class="ch-btn" onclick="renderChapter(' + (i - 1) + ')">上一章</button>';
  }
  if (i < R.chapters.length - 1) {
    html += '<button class="ch-btn primary" onclick="renderChapter(' + (i + 1) + ')">下一章</button>';
  } else {
    html += '<div class="ch-end">已是最后一章</div>';
  }
  html += '</div>';

  if (R.flip === 'page') {
    layoutPagedChapter(html);
  } else {
    body.className = 'reader-body';
    body.innerHTML = html;
    if (!keepScroll) body.scrollTop = 0;
    body.onscroll = function () {
      refreshProgress();
      if (!R.barsHidden) hideChrome();
    };
    if (R._restoreFrac != null) {
      const f = R._restoreFrac; R._restoreFrac = null;
      const max = body.scrollHeight - body.clientHeight;
      body.scrollTop = max * f;
    }
  }
  if (R.book) { R.book.ci = i; }
  refreshProgress();
  if (R.book) { R.book.progress = currentProgress(); save(); }
}

/* 章节末尾继续下拉时提示，并阻止跨章 */
let edgeLast = 0;
function edgeToast() {
  const now = Date.now();
  if (now - edgeLast < 1500) return;
  edgeLast = now;
  toast('已到底');
}

function bindEdgeGuard() {
  const body = document.getElementById('readerBody');
  if (body._edgeBound) return;
  body._edgeBound = true;
  let lastY = 0;
  body.addEventListener('touchstart', function (e) {
    lastY = e.touches[0].clientY;
  }, { passive: true });
  body.addEventListener('touchmove', function (e) {
    const y = e.touches[0].clientY;
    const dy = lastY - y;
    lastY = y;
    const max = body.scrollHeight - body.clientHeight;
    if (dy > 0 && max > 0 && body.scrollTop >= max - 2) edgeToast();
  }, { passive: true });
  body.addEventListener('wheel', function (e) {
    const max = body.scrollHeight - body.clientHeight;
    if (e.deltaY > 0 && max > 0 && body.scrollTop >= max - 2) edgeToast();
  }, { passive: true });
}

function bindReaderTap() {
  var body = document.getElementById('readerBody');
  if (body._tapBound) return;
  body._tapBound = true;

  var sx = 0, sy = 0, moved = false;
  var dragging = false, decided = false, dx = 0;

  function isPageMode() { return R.mode === 'chapters' && R.flip === 'page'; }

  body.addEventListener('touchstart', function (e) {
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    moved = false; dragging = false; decided = false; dx = 0;
    if (isPageMode()) {
      var inner = document.getElementById('pgInner');
      if (inner) { inner.style.transition = 'none'; dragging = true; }
    }
  }, { passive: true });

  body.addEventListener('touchmove', function (e) {
    var cx = e.touches[0].clientX, cy = e.touches[0].clientY;
    if (!moved && (Math.abs(cx - sx) > 8 || Math.abs(cy - sy) > 8)) moved = true;
    if (!dragging) return;
    var mx = cx - sx, my = cy - sy;
    if (!decided) {
      if (Math.abs(mx) < 6 && Math.abs(my) < 6) return;
      decided = true;
      if (Math.abs(my) > Math.abs(mx) * 0.9) { dragging = false; return; }
    }
    dx = mx;
    var inner = document.getElementById('pgInner');
    if (inner) {
      var base = -R.pageIdx * (R.pageStep || window.innerWidth);
      inner.style.transform = 'translateX(' + (base + dx) + 'px)';
    }
  }, { passive: true });

  body.addEventListener('touchend', function (e) {
    var t = e.changedTouches && e.changedTouches[0];
    if (!t) return;
    var ddx = t.clientX - sx, ddy = t.clientY - sy;

    if (dragging) {
      dragging = false;
      settlePageDrag(dx);
      if (Math.abs(dx) > 10) R._lastSwipe = Date.now();
      return;
    }

    if (Math.abs(ddx) < 52 || Math.abs(ddx) < Math.abs(ddy) * 1.4) return;
    R._lastSwipe = Date.now();
    if (R.mode === 'paged') gotoPage(R.idx + (ddx < 0 ? 1 : -1));
  }, { passive: true });

  body.addEventListener('click', function (e) {
    if (Date.now() - (R._lastSwipe || 0) < 350) return;
    if (R.mode === 'paged') return;
    var t = e.target;
    if (t && (t.tagName === 'BUTTON' || t.tagName === 'INPUT' || t.tagName === 'A')) return;
    if (moved) { moved = false; return; }
    var w = window.innerWidth;
    if (isPageMode()) {
      if (e.clientX < w * 0.3) { flipPage(-1); return; }
      if (e.clientX > w * 0.7) { flipPage(1); return; }
      toggleChrome();
      return;
    }
    if (e.clientX > w * 0.22 && e.clientX < w * 0.78) toggleChrome();
  });
}

/* 正文图片：小图放大到整行，点击可全屏查看 */
function bindEpubImages() {
  var imgs = document.querySelectorAll('#readerBody .epub-body img');
  Array.prototype.forEach.call(imgs, function (img) {
    img.classList.add('tapable');
    img.addEventListener('click', function (e) {
      e.stopPropagation();
      openImageViewer(img.src);
    });
    var fit = function () {
      var w = img.naturalWidth || 0;
      if (w >= 200) img.classList.add('fill');
      var host = document.getElementById('readerBody');
      var avail = host ? host.clientWidth - 2 * ((S.reader && S.reader.padX) || 22) : 0;
      if (avail > 0 && img.getBoundingClientRect().width < avail * 0.5 && w > avail * 0.5) {
        img.classList.add('fill');
      }
    };
    if (img.complete) fit();
    else img.addEventListener('load', fit);
    setTimeout(fit, 260);
  });
}

function openImageViewer(src) {
  var box = document.getElementById('imgViewer');
  if (!box) return;
  document.getElementById('imgViewerImg').src = src;
  box.classList.add('on');
  R._viewer = true;
}
function closeImageViewer() {
  var box = document.getElementById('imgViewer');
  if (!box) return;
  box.classList.remove('on');
  R._viewer = false;
}

/* 松手后决定翻页还是回弹 */
function settlePageDrag(dx) {
  var inner = document.getElementById('pgInner');
  if (!inner) return;
  var W = R.pageStep || window.innerWidth;
  inner.style.transition = 'transform .24s cubic-bezier(.22,.9,.3,1)';

  var want = 0;
  if (dx < -W * 0.16) want = 1;
  else if (dx > W * 0.16) want = -1;

  var target = R.pageIdx + want;
  if (want === 1 && target >= R.pageCount) {
    if (R.ci < (R.chapters || []).length - 1) { renderChapter(R.ci + 1); return; }
    target = R.pageCount - 1;
  }
  if (want === -1 && target < 0) {
    if (R.ci > 0) { R._gotoLast = true; renderChapter(R.ci - 1); return; }
    target = 0;
  }
  R.pageIdx = target;
  applyPageTransform();
  refreshProgress();
  if (Math.abs(dx) > 10) R._lastSwipe = Date.now();
}

/* ---------------- 漫画 / ZIP ---------------- */
function openComicZip() {
  try {
    const bytes = readBytes(R.book.uri);
    const zip = new JSZip();
    zip.loadAsync(bytes).then(() => {
      const files = zip.file(/\.(jpe?g|png|webp|gif|bmp)$/i)
        .filter(f => !/^__MACOSX/.test(f.name))
        .sort((a, b) => a.name.localeCompare(b.name, 'zh', { numeric: true }));
      if (!files.length) { showMsg('这个压缩包里没有图片'); return; }
      R.mode = 'paged';
      R.total = files.length;
      R.idx = Math.min(R.total - 1, Math.round((R.book.progress || 0) / 100 * (R.total - 1)));
      R.pages = files.map(() => null);
      document.getElementById('readerBody').className = 'reader-body img-mode';
      gotoPage(R.idx);
    }).catch(e => showMsg('压缩包解析失败：' + e.message));
    R._zip = zip;
  } catch (e) {
    showMsg('读取失败：' + e.message);
  }
}

/* ---------------- PDF ---------------- */
function openPdf() {
  try {
    const n = Native.pdfPages(R.book.uri);
    if (!n) { showMsg('PDF 打开失败（文件可能已失效或加密）'); return; }
    R.mode = 'paged';
    R.total = n;
    R.idx = Math.min(n - 1, Math.round((R.book.progress || 0) / 100 * (n - 1)));
    R.pages = new Array(n).fill(null);
    document.getElementById('readerBody').className = 'reader-body img-mode';
    gotoPage(R.idx);
  } catch (e) {
    showMsg('PDF 读取失败：' + e.message);
  }
}

/* ---------------- 分页渲染 ---------------- */
function setImgChrome(on) {
  const rd = document.getElementById('reader');
  if (rd) rd.classList.toggle('img', !!on);
}

function gotoPage(i) {
  if (i < 0) i = 0;
  if (i > R.total - 1) i = R.total - 1;
  R.idx = i;
  setImgChrome(true);
  const body = document.getElementById('readerBody');
  body.className = 'reader-body img-mode';
  body.onclick = null;

  const paint = (src) => {
    body.innerHTML = '<img src="' + src + '" id="pgImg">';
    const img = document.getElementById('pgImg');
    img.onclick = (ev) => {
      if (Date.now() - (R._lastSwipe || 0) < 350) return;
      const w = window.innerWidth;
      if (ev.clientX < w * 0.32) gotoPage(R.idx - 1);
      else if (ev.clientX > w * 0.68) gotoPage(R.idx + 1);
      else toggleChrome();
    };
    const p = ((i + 1) / R.total) * 100;
    document.getElementById('rProgress').textContent = Math.round(p) + '%';
    document.getElementById('rSlider').value = Math.round(p);
    if (R.book) { R.book.progress = p; save(); }
  };

  if (R.book.ext === 'pdf') {
    const cached = R.pages[i];
    if (cached) { paint(cached); return; }
    body.innerHTML = '<div style="color:#888">渲染中…</div>';
    setTimeout(() => {
      const w = Math.min(1400, Math.round(window.innerWidth * (window.devicePixelRatio || 2)));
      const src = Native.pdfPage(R.book.uri, i, w);
      if (!src) { showMsg('第 ' + (i + 1) + ' 页渲染失败'); return; }
      R.pages[i] = src;
      paint(src);
    }, 30);
  } else {
    const zip = R._zip;
    if (!zip) return;
    const files = zip.file(/\.(jpe?g|png|webp|gif|bmp)$/i)
      .filter(f => !/^__MACOSX/.test(f.name))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh', { numeric: true }));
    const f = files[i];
    if (!f) return;
    if (R.pages[i]) { paint(R.pages[i]); return; }
    body.innerHTML = '<div style="color:#888">加载中…</div>';
    f.async('base64').then(b64 => {
      const mime = /png$/i.test(f.name) ? 'png' : /webp$/i.test(f.name) ? 'webp' : 'jpeg';
      const src = 'data:image/' + mime + ';base64,' + b64;
      R.pages[i] = src;
      paint(src);
    });
  }
}

/* ---------------- 阅读计时 ---------------- */
function startProgressTicker() {
  stopProgressTicker();
  R.tick = setInterval(function () {
    if (!R.book) return;
    refreshProgress();
  }, 500);
}
function stopProgressTicker() {
  if (R.tick) { clearInterval(R.tick); R.tick = null; }
}

function startReadingTimer() {
  stopReadingTimer();
  R.timer = setInterval(() => {
    if (!R.book) return;
    const g = S.goal;
    g.minutes = (g.minutes || 0) + 1 / 60;
    if (Math.floor(g.minutes * 10) % 10 === 0) save();
    if (document.getElementById('lib').classList.contains('active')) renderGoal();
  }, 60000);
}
function stopReadingTimer() {
  if (R.timer) { clearInterval(R.timer); R.timer = null; }
  if (R.book) save();
}
