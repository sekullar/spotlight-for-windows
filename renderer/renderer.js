const $ = (id) => document.getElementById(id);
const panel = $('panel'), input = $('q'), list = $('list'), footer = $('footer'), statusEl = $('status'), progress = $('progress');
document.body.dataset.platform = api.platform;
const MOD = api.platform === 'darwin' ? '⌘' : 'Ctrl';
const ALT = api.platform === 'darwin' ? '⌥' : 'Alt';

let S = null;          // UI strings, loaded from the main process
let lastScan = null;
const X = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28"';
const SVG = {
  calc: `<svg ${X}><rect x="3" y="2" width="22" height="24" rx="5" fill="#ff9f0a"/><rect x="6.5" y="5.5" width="15" height="6" rx="1.5" fill="#222"/><g fill="#fff"><circle cx="9" cy="16" r="1.6"/><circle cx="14" cy="16" r="1.6"/><circle cx="19" cy="16" r="1.6"/><circle cx="9" cy="21" r="1.6"/><circle cx="14" cy="21" r="1.6"/><circle cx="19" cy="21" r="1.6"/></g></svg>`,
  web: `<svg ${X}><circle cx="14" cy="14" r="12" fill="#0a7aff"/><g fill="none" stroke="#fff" stroke-width="1.6"><ellipse cx="14" cy="14" rx="5" ry="12"/><path d="M2 14h24M4 8h20M4 20h20"/></g></svg>`,
  cmd: `<svg ${X}><rect x="2" y="2" width="24" height="24" rx="6" fill="#636366"/><path d="M8 10l5 4-5 4M15 19h6" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  app: `<svg ${X}><rect x="2" y="2" width="24" height="24" rx="6" fill="#8e8e93"/><g fill="#fff"><rect x="7" y="7" width="6" height="6" rx="1.5"/><rect x="15" y="7" width="6" height="6" rx="1.5"/><rect x="7" y="15" width="6" height="6" rx="1.5"/><rect x="15" y="15" width="6" height="6" rx="1.5"/></g></svg>`,
  folder: `<svg ${X}><path d="M2 8a3 3 0 0 1 3-3h5l3 3h10a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3z" fill="#5ac8fa"/></svg>`,
  file: `<svg ${X}><path d="M6 2h11l6 6v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="#f2f2f7" stroke="#c7c7cc"/><path d="M17 2v6h6" fill="#d1d1d6"/></svg>`,
};
const svgUrl = (s) => 'data:image/svg+xml,' + encodeURIComponent(s);
const fallbackFor = (k) => svgUrl(SVG[k] || (k === 'folder' ? SVG.folder : SVG.file));

let results = [], sel = 0, token = 0, visible = false;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function fit() {
  api.resize($('bar').offsetHeight + list.offsetHeight + (footer.hidden ? 0 : footer.offsetHeight));
}

function buildFooter() {
  footer.textContent = '';
  if (!S) return;
  [['↵', S.footer.open], [MOD + '+↵', S.footer.reveal], [ALT + '+1-9', S.footer.quick], ['Esc', S.footer.close]].forEach(([k, t]) => {
    const s = el('span'); s.append(el('kbd', null, k), document.createTextNode(t)); footer.append(s);
  });
}

function updateStatus() {
  if (!S || !lastScan) return;
  const { phase, count, done } = lastScan;
  const n = count.toLocaleString(S.locale);
  progress.classList.toggle('on', !done);
  statusEl.classList.toggle('done', done);
  statusEl.textContent = done ? S.itemsReady.replace('{n}', n) : `${phase === 'apps' ? S.scanApps : S.scanFiles}… ${n}`;
  if (done) setTimeout(() => (statusEl.textContent = ''), 1800);
}

function applyStrings(s) {
  S = s;
  input.placeholder = S.placeholder;
  buildFooter();
  updateStatus();
  if (input.value) doSearch();
}

function render() {
  list.textContent = '';
  let last = null;
  results.forEach((r, i) => {
    if (r.group !== last) { list.append(el('div', 'group', r.group)); last = r.group; }
    const row = el('div', 'row' + (r.top ? ' top' : '') + (i === sel ? ' sel' : ''));
    row.dataset.i = i;
    const ic = el('img', 'ic');
    ic.src = fallbackFor(r.kind);
    if (!SVG[r.kind] || r.kind === 'app' || r.kind === 'folder') {
      if (r.path) api.icon(r.path).then((u) => { if (u) ic.src = u; });
    }
    const text = el('div', 'text');
    text.append(el('div', 'name', r.name));
    if (r.sub) text.append(el('div', 'sub', r.sub));
    row.append(ic, text, el('span', 'kind', (S && S.kinds[r.kind]) || ''), el('span', 'ret', '↵'));
    row.onmousemove = () => { if (sel !== i) { sel = i; mark(); } };
    row.onclick = () => activate(i);
    list.append(row);
  });
  footer.hidden = results.length === 0;
  fit();
}

function mark() {
  list.querySelectorAll('.row').forEach((r) => r.classList.toggle('sel', +r.dataset.i === sel));
  const cur = list.querySelector('.row.sel');
  if (cur) cur.scrollIntoView({ block: 'nearest' });
}

async function doSearch() {
  const t = ++token;
  const res = await api.search(input.value);
  if (t !== token) return;
  results = res; sel = 0;
  render();
}

function animateOut() {
  return new Promise((ok) => {
    panel.classList.remove('in'); panel.classList.add('out');
    setTimeout(ok, 100);
  });
}
async function dismiss() { if (!visible) return; visible = false; await animateOut(); api.hide(); }
async function activate(i, mode) {
  const r = results[i]; if (!r) return;
  visible = false; await animateOut(); api.open(r, mode);
}

input.addEventListener('input', doSearch);
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); if (input.value) { input.value = ''; doSearch(); } else dismiss(); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); if (results.length) { sel = (sel + 1) % results.length; mark(); } }
  else if (e.key === 'ArrowUp') { e.preventDefault(); if (results.length) { sel = (sel - 1 + results.length) % results.length; mark(); } }
  else if (e.key === 'Enter') { e.preventDefault(); activate(sel, (e.metaKey || e.ctrlKey) ? 'reveal' : 'open'); }
  else if ((e.metaKey || e.altKey) && /^[1-9]$/.test(e.key)) { e.preventDefault(); activate(+e.key - 1); }
});

api.onShown(() => {
  visible = true;
  input.value = ''; results = []; sel = 0; list.textContent = ''; footer.hidden = true;
  panel.classList.remove('out'); void panel.offsetWidth; panel.classList.add('in');
  input.focus();
});

api.onScan((d) => { lastScan = d; updateStatus(); });
api.onLang(() => api.strings().then(applyStrings));
api.strings().then((s) => {
  applyStrings(s);
  api.state().then((st) => {
    if (st.scanning && !lastScan) { progress.classList.add('on'); statusEl.textContent = S.scanning; }
  });
});
