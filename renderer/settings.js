const $ = (id) => document.getElementById(id);
const on = $('on'), token = $('token'), state = $('state');
let S = null, probeT = 0;

async function probe() {
  if (!S || !on.checked) return;
  const found = await api.probe();
  state.classList.toggle('ok', found);
  state.querySelector('span').textContent = found ? S.dbFound : S.dbMissing;
}

function paint() {
  state.hidden = $('tokenRow').hidden = !on.checked;
  probe();
}

async function load() {
  const c = await api.get();
  S = c.strings;
  document.title = S.settingsTitle;
  $('heading').textContent = S.dbHeading;
  $('toggle').textContent = S.dbToggle;
  $('desc').textContent = S.dbDesc;
  $('tokenLabel').textContent = S.dbToken;
  $('tokenHint').textContent = S.dbTokenHint;
  on.checked = c.dynamicBar;
  token.value = c.dynamicBarToken || '';
  paint();
}

on.addEventListener('change', () => { api.set({ dynamicBar: on.checked }); paint(); });
token.addEventListener('input', () => {
  api.set({ dynamicBarToken: token.value });
  clearTimeout(probeT);
  probeT = setTimeout(probe, 500);
});
api.onLang(load);
load();
