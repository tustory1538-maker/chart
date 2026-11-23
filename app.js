(() => {
'use strict';
const { init, dispose, registerLocale, registerIndicator } = klinecharts;
const TK = window.TOOLKIT;
const $ = s => document.querySelector(s);
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
const clone = o => JSON.parse(JSON.stringify(o));
const MOCK = new URLSearchParams(location.search).has('mock');

// ───────── 기본값 ─────────
const MARKETS = {
  futures: { rest: 'https://fapi.binance.com/fapi/v1', ws: 'wss://fstream.binance.com', badge: '선물' },
  spot:    { rest: 'https://api.binance.com/api/v3',  ws: 'wss://stream.binance.com:9443', badge: '현물' }
};
const TFS = {
  '1m':[{type:'minute',span:1},6e4], '3m':[{type:'minute',span:3},18e4], '5m':[{type:'minute',span:5},3e5],
  '15m':[{type:'minute',span:15},9e5], '30m':[{type:'minute',span:30},18e5], '1h':[{type:'hour',span:1},36e5],
  '2h':[{type:'hour',span:2},72e5], '4h':[{type:'hour',span:4},144e5], '6h':[{type:'hour',span:6},216e5],
  '12h':[{type:'hour',span:12},432e5], '1d':[{type:'day',span:1},864e5], '1w':[{type:'week',span:1},6048e5],
  '1M':[{type:'month',span:1},2592e6]
};
const TF_SHOW = Object.keys(TFS);
const MAIN_INDS = ['MA','EMA','SMA','BOLL','SAR','BBI'];
const SUB_INDS = ['VOL','RSI','STOCH','MACD','KDJ','CCI','OBV','DMI','WR','ROC','MTM','TRIX','BIAS'];
const IND_NAMES = { MA:'이동평균', EMA:'지수이동평균', SMA:'평활이동평균', BOLL:'볼린저밴드', SAR:'파라볼릭 SAR', BBI:'BBI', VOL:'거래량', RSI:'RSI', STOCH:'스토캐스틱 (슬로우)', MACD:'MACD', KDJ:'KDJ', CCI:'CCI', OBV:'OBV', DMI:'DMI', WR:'윌리엄스 %R', ROC:'ROC', MTM:'모멘텀', TRIX:'TRIX', BIAS:'이격도' };
const VAR_PARAMS = ['MA','EMA','SMA','RSI','WR','BIAS'];
const PARAM_NAMES = { STOCH: ['%K 기간', '%K 스무딩', '%D 기간'], BOLL: ['기간', '표준편차'], MACD: ['단기', '장기', '시그널'], KDJ: ['기간', 'K', 'D'] };
// 오실레이터 기준선 기본값 (상단·중단·하단)
const LEVEL_DEF = { RSI: [70, 50, 30], STOCH: [80, 50, 20], KDJ: [80, 50, 20], CCI: [100, 0, -100], WR: [-20, -50, -80], MACD: [0], ROC: [0], MTM: [0], TRIX: [0], BIAS: [0] };
const FIXED_RANGE = { RSI: [0, 100], STOCH: [0, 100] };
const DRAW_GROUP = 'draw';
const LIMIT = 1000;
const MAGNET = { off: 'normal', weak: 'weak_magnet', strong: 'strong_magnet' };
const GRIDS = { '1': 1, '2h': 2, '2v': 2, '3': 3, '4': 4, '6': 6, '8': 8, '9': 9 };
const GRID_LABEL = { '1': '1', '2h': '2 ┃', '2v': '2 ━', '3': '3', '4': '4', '6': '6', '8': '8', '9': '9' };
const DEF_CELL = { market: 'futures', symbol: 'BTCUSDT', tf: '15m', main: ['EMA'], sub: ['VOL'], params: { EMA: [20, 60, 120] }, indStyles: {}, levels: {} };
const DEF_SETTINGS = {
  theme: 'dark', chartType: 'candle_solid',
  bodyUp: '#26a69a', bodyDown: '#ef5350', borderShow: true, borderUp: '#26a69a', borderDown: '#ef5350', wickShow: true, wickUp: '#26a69a', wickDown: '#ef5350',
  compareRule: 'current_open', lastLine: true, highLow: true,
  statusOHLC: 'auto', statusInd: 'auto',
  axisPos: 'right', scale: 'normal', invert: false, countdown: true,
  bg: '', gridV: true, gridH: true, gridColor: '', crossColor: '', textSize: 12, textColor: ''
};
function migrateSettings(s) {
  s = Object.assign({}, s || {});
  if (s.up && !s.bodyUp) { s.bodyUp = s.borderUp = s.wickUp = s.up; }
  if (s.down && !s.bodyDown) { s.bodyDown = s.borderDown = s.wickDown = s.down; }
  if (s.grid === false && s.gridV == null) { s.gridV = s.gridH = false; }
  delete s.up; delete s.down; delete s.grid;
  return Object.assign(clone(DEF_SETTINGS), s);
}
const DEF_LAYOUT = { v: 3, grid: '1', active: 0, cells: [], settings: DEF_SETTINGS, magnet: 'off', wlOpen: true, sync: { symbol: false, tf: false, crosshair: true } };
const SWATCHES = ['#2962ff', '#f23645', '#089981', '#ff9800', '#f7c948', '#9c27b0', '#00bcd4', '#ffffff', '#787b86'];

// ───────── 레이아웃 저장 구조 ─────────
const newId = () => 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
let layouts = LS.get('layouts', null);
let curLayout = LS.get('curLayout', null);
if (!Array.isArray(layouts) || !layouts.length) {
  // v1 데이터 옮기기
  const id = newId();
  layouts = [{ id, name: '기본 레이아웃' }];
  LS.set('layout:' + id, { state: LS.get('state', {}), settings: LS.get('settings', {}) });
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^draw:(futures|spot):/.test(k)) keys.push(k); }
  keys.forEach(k => { localStorage.setItem('draw:' + id + ':' + k.slice(5), localStorage.getItem(k)); localStorage.removeItem(k); });
  curLayout = id;
  LS.set('layouts', layouts); LS.set('curLayout', id);
}
if (!layouts.some(l => l.id === curLayout)) curLayout = layouts[0].id;

let L = null; // 현재 레이아웃 데이터
function normCell(c) {
  const o = Object.assign(clone(DEF_CELL), c || {});
  ['params', 'indStyles', 'levels'].forEach(k => { if (!o[k] || typeof o[k] !== 'object') o[k] = {}; });
  return o;
}
function readLayout(id) {
  const d = LS.get('layout:' + id, {});
  let lay;
  if (d.v === 3) lay = Object.assign(clone(DEF_LAYOUT), d);
  else { // v2 → v3
    const st = d.state || {};
    lay = clone(DEF_LAYOUT);
    lay.cells = [st];
    lay.settings = d.settings || {};
    lay.magnet = st.magnet; lay.wlOpen = st.wlOpen !== false;
  }
  lay.settings = migrateSettings(lay.settings);
  lay.lockAll = !!lay.lockAll;
  lay.sync = Object.assign({ symbol: false, tf: false, crosshair: true }, lay.sync || {});
  if (lay.magnet === true) lay.magnet = 'weak';
  if (!MAGNET[lay.magnet]) lay.magnet = 'off';
  if (!GRIDS[lay.grid]) lay.grid = '1';
  lay.cells = (lay.cells || []).map(normCell);
  if (!lay.cells.length) lay.cells = [normCell()];
  lay.active = Math.min(lay.active || 0, GRIDS[lay.grid] - 1);
  return lay;
}
const saveLayout = () => LS.set('layout:' + curLayout, L);
const layoutName = () => (layouts.find(l => l.id === curLayout) || {}).name || '';

let watchlist = LS.get('watchlist', [
  { market: 'futures', symbol: 'BTCUSDT' }, { market: 'futures', symbol: 'ETHUSDT' },
  { market: 'futures', symbol: 'SOLUSDT' }, { market: 'futures', symbol: 'XRPUSDT' }
]);

// ───────── 유틸 ─────────
let toastTimer;
function toast(msg, ms = 2500) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}
const fmtTime = ts => new Date(ts).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
const decimalsOf = s => { s = String(s); if (!s.includes('.')) return 0; return s.replace(/0+$/, '').split('.')[1]?.length || 0; };
const fmtPrice = (p, d) => Number(p).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const trimNum = s => { s = String(s); return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s; };
const fmtBig = v => v >= 1e9 ? (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(0) + 'K' : Math.round(v) + '';
const tfOfPeriod = p => Object.keys(TFS).find(k => TFS[k][0].type === p.type && TFS[k][0].span === p.span);
const hexA = (hex, a) => { const h = hex.replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ───────── 데이터 (Binance REST / WS) ─────────
const toBar = k => ({ timestamp: k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5], turnover: +k[7] });
async function fetchKlines(market, symbol, tf, { startTime, endTime, limit = LIMIT } = {}) {
  if (MOCK) return mockKlines(symbol, tf, { startTime, endTime, limit });
  const q = new URLSearchParams({ symbol, interval: tf, limit });
  if (startTime != null) q.set('startTime', startTime);
  if (endTime != null) q.set('endTime', endTime);
  const r = await fetch(`${MARKETS[market].rest}/klines?${q}`);
  if (!r.ok) throw new Error(r.status === 400 ? '종목 이름을 확인해 주세요' : `HTTP ${r.status}`);
  return (await r.json()).map(toBar);
}
const infoCache = {};
async function symbolInfo(market, symbol) {
  const key = market + ':' + symbol;
  if (infoCache[key]) return infoCache[key];
  if (!MOCK) {
    try {
      const url = market === 'spot' ? `${MARKETS.spot.rest}/exchangeInfo?symbol=${symbol}` : `${MARKETS.futures.rest}/exchangeInfo`;
      if (!infoCache['_p' + url]) infoCache['_p' + url] = fetch(url).then(r => r.json());
      const j = await infoCache['_p' + url];
      for (const s of j.symbols || []) {
        const pf = s.filters.find(f => f.filterType === 'PRICE_FILTER');
        const lf = s.filters.find(f => f.filterType === 'LOT_SIZE');
        infoCache[market + ':' + s.symbol] = { pp: decimalsOf(pf?.tickSize ?? '0.01'), vp: decimalsOf(lf?.stepSize ?? '0.001') };
      }
      if (infoCache[key]) return infoCache[key];
    } catch (e) { console.warn(e); }
  }
  return (infoCache[key] = { pp: 2, vp: 3 });
}
const tickerCache = {};
async function loadTickers(market) {
  const c = tickerCache[market];
  if (c && Date.now() - c.t < 30000) return c.list;
  let list = [];
  if (MOCK) {
    list = ['BTCUSDT','ETHUSDT','SOLUSDT','XRPUSDT','BNBUSDT','DOGEUSDT','ADAUSDT','AVAXUSDT','LINKUSDT','SUIUSDT','TRXUSDT','DOTUSDT','LTCUSDT','PEPEUSDT','WIFUSDT']
      .map((s, i) => ({ s, p: trimNum((60000 / (i + 1)).toFixed(3)), chg: Math.sin(i * 3) * 6, qv: 1e10 / (i + 1) }));
  } else {
    const arr = await (await fetch(`${MARKETS[market].rest}/ticker/24hr`)).json();
    list = arr.filter(x => !x.symbol.includes('_') && +x.quoteVolume > 0)
      .map(x => ({ s: x.symbol, p: trimNum(x.lastPrice), chg: +x.priceChangePercent, qv: +x.quoteVolume }));
  }
  list.sort((a, b) => b.qv - a.qv);
  tickerCache[market] = { t: Date.now(), list };
  return list;
}
function openWS(url, onMsg, onReopen) {
  const h = { ws: null, closed: false, timer: null, dropped: false };
  const connect = () => {
    if (h.closed) return;
    h.ws = new WebSocket(url);
    h.ws.onopen = () => { if (h.dropped && onReopen) onReopen(); h.dropped = false; };
    h.ws.onmessage = e => { try { onMsg(JSON.parse(e.data)); } catch {} };
    h.ws.onclose = () => { if (!h.closed) { h.dropped = true; h.timer = setTimeout(connect, 2000); } };
    h.ws.onerror = () => { try { h.ws.close(); } catch {} };
  };
  connect();
  h.close = () => { h.closed = true; clearTimeout(h.timer); try { h.ws && h.ws.close(); } catch {} };
  return h;
}

// ───────── 테스트용 가짜 데이터 (?mock) ─────────
function hash(n) { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); }
function mockPrice(t, k = 1) { return k * (60000 + 4000 * Math.sin(t / 9e8) + 900 * Math.sin(t / 5e7) + 200 * Math.sin(t / 3e6) + 120 * (hash(Math.floor(t / 6e4)) - .5)); }
const mockK = s => s.startsWith('BTC') ? 1 : s.startsWith('ETH') ? 0.05 : 0.003;
function mockBar(ts, ms, k = 1) {
  const o = mockPrice(ts, k), c = mockPrice(ts + ms, k);
  const r = Math.abs(o - c) * .5 + k * (20 + 60 * hash(ts / 1e3));
  return { timestamp: ts, open: o, close: c, high: Math.max(o, c) + r * hash(ts + 1), low: Math.min(o, c) - r * hash(ts + 2), volume: 50 + 400 * hash(ts + 3) };
}
function mockKlines(symbol, tf, { startTime, endTime, limit }) {
  const ms = TFS[tf][1], now = Math.floor(Date.now() / ms) * ms, out = [], k = mockK(symbol);
  if (startTime != null) { for (let t = Math.ceil(startTime / ms) * ms; t <= now && out.length < limit; t += ms) out.push(mockBar(t, ms, k)); }
  else { const last = Math.min(endTime != null ? Math.floor(endTime / ms) * ms : now, now); for (let t = last - (limit - 1) * ms; t <= last; t += ms) out.push(mockBar(t, ms, k)); }
  return new Promise(r => setTimeout(() => r(out), 50));
}

// ───────── 지표·작도 등록 ─────────
registerLocale('ko-KR', { time: '시간 ', open: '시 ', high: '고 ', low: '저 ', close: '종 ', volume: '거래량 ', change: '변동 ', turnover: '거래대금 ', second: '초', minute: '분', hour: '시간', day: '일', week: '주', month: '월', year: '년' });

// 슬로우 스토캐스틱: %K = SMA(Fast %K, 스무딩), %D = SMA(%K)
registerIndicator({
  name: 'STOCH', shortName: 'Stoch', calcParams: [14, 3, 3], precision: 2,
  figures: [{ key: 'k', title: '%K: ', type: 'line' }, { key: 'd', title: '%D: ', type: 'line' }],
  calc: (list, ind) => {
    const [n, sk, sd] = ind.calcParams.map(v => Math.max(1, Math.round(v)));
    const raw = list.map((b, i) => {
      if (i < n - 1) return null;
      let hh = -Infinity, ll = Infinity;
      for (let j = i - n + 1; j <= i; j++) { hh = Math.max(hh, list[j].high); ll = Math.min(ll, list[j].low); }
      return hh === ll ? 50 : (b.close - ll) / (hh - ll) * 100;
    });
    const sma = (arr, p) => arr.map((_, i) => {
      if (i < p - 1) return null;
      let s = 0; for (let j = i - p + 1; j <= i; j++) { if (arr[j] == null) return null; s += arr[j]; }
      return s / p;
    });
    const K = sma(raw, sk), D = sma(K, sd);
    return list.map((_, i) => { const o = {}; if (K[i] != null) o.k = K[i]; if (D[i] != null) o.d = D[i]; return o; });
  }
});

// ───────── 작도 스타일 (도구마다 따로 기억) ─────────
const DRAW_NAMES = Object.keys(TK.NAMES);
const NO_STYLE = TK.NO_STYLE;
function toolStyle(name) { return Object.assign({}, TK.DEFAULT_STYLE, TK.TOOL_DEFAULTS[name] || {}, LS.get('toolStyle:' + name, {})); }
function normSt(st) {
  if (!st) return st;
  st = { ...st };
  if (st.line == null) st.line = st.dashed ? 'dashed' : 'solid';
  delete st.dashed;
  if (st.fill == null) st.fill = 0.15;
  return st;
}
function styleFor(st) {
  const c = st.color, s = +st.size, ls = st.line === 'solid' ? 'solid' : 'dashed', dv = st.line === 'dotted' ? [2, 3] : [6, 4], f = st.fill ?? 0.15;
  return {
    line: { color: c, size: s, style: ls, dashedValue: dv },
    polygon: { color: hexA(c, f), borderColor: c, borderSize: s, borderStyle: ls, borderDashedValue: dv },
    rect: { color: hexA(c, f), borderColor: c, borderSize: s },
    circle: { color: hexA(c, f), borderColor: c, borderSize: s },
    arc: { color: c, size: s },
    point: { color: c, borderColor: hexA(c, 0.35), activeColor: c, activeBorderColor: hexA(c, 0.35) },
    text: { backgroundColor: c, borderColor: c, color: '#ffffff' }
  };
}
// 봉 마감까지 남은 시간
function closeTimeOf(ts, tf) {
  if (tf === '1M') { const d = new Date(ts); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1); }
  return ts + TFS[tf][1];
}
function fmtCountdown(ms) {
  let s = Math.ceil(ms / 1000);
  const d = Math.floor(s / 86400); s %= 86400;
  const h = Math.floor(s / 3600); s %= 3600;
  const m = Math.floor(s / 60); s %= 60;
  const p = n => String(n).padStart(2, '0');
  if (d) return `${d}일 ${p(h)}:${p(m)}`;
  if (h) return `${p(h)}:${p(m)}:${p(s)}`;
  return `${p(m)}:${p(s)}`;
}

// ───────── 리플레이 (모든 분할 화면이 같은 시점으로 움직임) ─────────
const R = { on: false, T: 0, id: 0, playing: false, timer: null };

// ───────── 차트 한 칸 ─────────
let cells = [];
let uidSeq = 0;
let sel = null;            // 선택된 작도 { cell, id }
let drawHidden = false;
let syncing = false;

class Cell {
  constructor(idx) {
    this.idx = idx; this.uid = ++uidSeq;
    this.el = document.createElement('div'); this.el.className = 'cell';
    this.cv = document.createElement('div'); this.cv.className = 'cv';
    this.el.appendChild(this.cv);
    this.lb = document.createElement('div'); this.lb.className = 'clabel';
    this.el.appendChild(this.lb);
    $('#grid').appendChild(this.el);
    this.chart = init(this.cv, { locale: 'ko-KR', timezone: 'Asia/Seoul' });
    this.ws = null; this.lastBar = null; this.pp = 2; this.crosshair = null; this.suppress = false; this.activeTool = null;
    this.rp = { buffer: [], fetchedTo: 0, done: false, fetching: false, cb: null };
    this.chart.subscribeAction('onCrosshairChange', c => { this.crosshair = c; this.syncCrosshair(c); });
    this.chart.setFormatter({ formatExtendText: ({ data }) => {
      if (R.on || !data || !L.settings.countdown) return '';
      const left = closeTimeOf(data.timestamp, this.st.tf) - Date.now();
      return left > 0 && left <= 32 * 864e5 ? fmtCountdown(left) : '';
    } });
    this.el.addEventListener('pointerdown', () => setActive(this.idx), true);
    this.el.addEventListener('mouseleave', () => { if (L.sync.crosshair) cells.forEach(o => o !== this && o.chart.executeAction('onCrosshairChange', null)); });
    this.cv.addEventListener('contextmenu', e => e.preventDefault());
    const self = this;
    this.liveLoader = {
      async getBars({ type, timestamp, symbol, period, callback }) {
        const tok = self.tokenOf(symbol, period), tf = tfOfPeriod(period);
        try {
          let data = [];
          if (type === 'init') data = await fetchKlines(symbol.market, symbol.ticker, tf);
          else if (type === 'forward') data = await fetchKlines(symbol.market, symbol.ticker, tf, { endTime: timestamp - 1 });
          if (tok !== self.token()) return;
          callback(data, { forward: data.length >= LIMIT, backward: false });
          if (type === 'init') self.afterInit(data);
        } catch (e) { if (tok === self.token()) { toast('데이터 로드 실패: ' + e.message, 4000); callback([], false); } }
      },
      subscribeBar({ symbol, period, callback }) {
        self.ws && self.ws.close();
        const tf = tfOfPeriod(period), ms = TFS[tf][1];
        const push = bar => { callback(bar); self.onBar(bar); };
        if (MOCK) {
          const k = mockK(symbol.ticker);
          const id = setInterval(() => { const ts = Math.floor(Date.now() / ms) * ms; const b = mockBar(ts, ms, k); b.close = mockPrice(Date.now(), k); b.high = Math.max(b.high, b.close); b.low = Math.min(b.low, b.close); push(b); }, 1000);
          self.ws = { close: () => clearInterval(id) };
          return;
        }
        self.ws = openWS(`${MARKETS[symbol.market].ws}/ws/${symbol.ticker.toLowerCase()}@kline_${tf}`,
          m => { const k = m.k; if (k) push({ timestamp: k.t, open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v, turnover: +k.q }); },
          async () => { try { (await fetchKlines(symbol.market, symbol.ticker, tf, { limit: 200 })).forEach(push); } catch {} });
      },
      unsubscribeBar() { self.ws && self.ws.close(); self.ws = null; }
    };
    this.replayLoader = {
      async getBars({ type, timestamp, symbol, period, callback }) {
        const tok = self.tokenOf(symbol, period), tf = tfOfPeriod(period), ms = TFS[tf][1];
        try {
          if (type === 'init') {
            const past = await fetchKlines(symbol.market, symbol.ticker, tf, { endTime: R.T - ms }); // 리플레이 시점 이전에 완성된 봉만
            if (tok !== self.token()) return;
            Object.assign(self.rp, { buffer: [], done: false, fetching: false, fetchedTo: past.length ? past[past.length - 1].timestamp : R.T - ms });
            callback(past, { forward: past.length >= LIMIT, backward: false });
            self.afterInit(past);
            self.refill();
          } else if (type === 'forward') {
            const data = await fetchKlines(symbol.market, symbol.ticker, tf, { endTime: timestamp - 1 });
            if (tok !== self.token()) return;
            callback(data, { forward: data.length >= LIMIT, backward: false });
          } else callback([], false);
        } catch (e) { if (tok === self.token()) { toast('데이터 로드 실패: ' + e.message, 4000); callback([], false); } }
      },
      subscribeBar({ callback }) { self.rp.cb = callback; },
      unsubscribeBar() { self.rp.cb = null; }
    };
  }
  get st() { return L.cells[this.idx]; }
  get ms() { return TFS[this.st.tf][1]; }
  token() { return [curLayout, this.uid, R.on ? 'r' + R.id : 'l', this.st.market, this.st.symbol, this.st.tf].join('|'); }
  tokenOf(symbol, period) { return [curLayout, this.uid, R.on ? 'r' + R.id : 'l', symbol.market, symbol.ticker, tfOfPeriod(period)].join('|'); }
  destroy() { this.ws && this.ws.close(); dispose(this.cv); this.el.remove(); }

  onBar(bar) {
    this.lastBar = bar;
    if (this === activeCell()) updatePrice();
  }
  afterInit(data) {
    this.restoreDrawings();
    if (data && data.length) this.onBar(data[data.length - 1]);
  }
  start() {
    this.label();
    this.chart.setDataLoader(R.on ? this.replayLoader : this.liveLoader);
    this.applyStyles();
    this.applyIndicators();
    this.chart.setPeriod(TFS[this.st.tf][0]);
    this.applySymbol();
  }
  async applySymbol() {
    const st = this.st, tok = st.market + st.symbol;
    this.lastBar = null; if (this === activeCell()) updatePrice();
    if (sel && sel.cell === this) hideDrawBar();
    const info = await symbolInfo(st.market, st.symbol);
    if (tok !== this.st.market + this.st.symbol) return;
    this.pp = info.pp;
    this.removeDrawings();
    this.chart.setSymbol({ ticker: st.symbol, market: st.market, pricePrecision: info.pp, volumePrecision: info.vp });
  }
  setSymbol(market, symbol) { this.st.market = market; this.st.symbol = symbol; this.applySymbol(); this.label(); }
  setTf(tf) { this.st.tf = tf; this.chart.setPeriod(TFS[tf][0]); this.label(); }
  label() { this.lb.textContent = `${this.st.symbol} · ${this.st.tf}${this.st.market === 'spot' ? ' · 현물' : ''}`; }

  // 리플레이
  async refill() {
    const rp = this.rp; if (rp.fetching || rp.done) return;
    rp.fetching = true;
    const tok = this.token(), st = this.st, ms = this.ms;
    try {
      const data = await fetchKlines(st.market, st.symbol, st.tf, { startTime: rp.fetchedTo + 1 });
      if (tok !== this.token()) return;
      const now = Date.now();
      const full = data.filter(b => b.timestamp + ms <= now);
      rp.buffer.push(...full);
      if (data.length) rp.fetchedTo = data[data.length - 1].timestamp;
      if (data.length < LIMIT || full.length < data.length) rp.done = true;
    } catch { toast('리플레이 데이터 로드 실패'); }
    finally { if (tok === this.token()) { rp.fetching = false; this.advanceTo(R.T); } }
  }
  advanceTo(T) {
    const rp = this.rp; if (!R.on || !rp.cb) return;
    let last = null;
    while (rp.buffer.length && rp.buffer[0].timestamp + this.ms <= T) { last = rp.buffer.shift(); rp.cb(last); }
    if (last) this.onBar(last);
    if (rp.buffer.length < 200) this.refill();
  }

  // 작도
  drawKey() { return `draw:${curLayout}:${this.st.market}:${this.st.symbol}`; }
  drawEvents() {
    return {
      groupId: DRAW_GROUP,
      onDrawEnd: e => { const id = e.overlay.id; setTimeout(() => { this.saveDrawings(); setActiveTool(null); const o = this.chart.getOverlays({ id })[0]; if (o) showDrawBar(this, o); }, 0); },
      onPressedMoveEnd: () => setTimeout(() => this.saveDrawings(), 0),
      onRemoved: e => { if (sel && sel.id === e.overlay.id) hideDrawBar(); if (!this.suppress) setTimeout(() => this.saveDrawings(), 0); },
      onRightClick: e => { this.chart.removeOverlay({ id: e.overlay.id }); },
      onSelected: e => { if (e.overlay.currentStep === -1) showDrawBar(this, e.overlay); else sel = { cell: this, id: e.overlay.id }; },
      onDeselected: e => { if (sel && (!e.overlay || e.overlay.id === sel.id)) hideDrawBar(); }
    };
  }
  createDrawing(name, extra = {}) {
    const st = extra.st ? normSt(extra.st) : (NO_STYLE.includes(name) ? null : toolStyle(name));
    return this.chart.createOverlay({
      name, mode: MAGNET[L.magnet], visible: !drawHidden, lock: !!L.lockAll, ...this.drawEvents(),
      ...(st ? { styles: styleFor(st) } : {}), extendData: { st }, ...extra.opts
    });
  }
  drawings() { return this.chart.getOverlays({ groupId: DRAW_GROUP }); }
  saveDrawings() {
    const list = this.drawings().filter(o => DRAW_NAMES.includes(o.name) && o.currentStep === -1)
      .map(o => ({ name: o.name, points: o.points.map(p => ({ timestamp: p.timestamp, value: p.value })), st: o.extendData?.st || null }));
    LS.set(this.drawKey(), list);
    // 같은 종목을 띄운 다른 칸에도 반영
    cells.forEach(c => { if (c !== this && c.drawKey() === this.drawKey()) c.restoreDrawings(); });
  }
  removeDrawings() { this.suppress = true; this.chart.removeOverlay({ groupId: DRAW_GROUP }); this.suppress = false; }
  restoreDrawings() {
    if (sel && sel.cell === this) hideDrawBar();
    this.removeDrawings();
    for (const d of LS.get(this.drawKey(), [])) this.createDrawing(d.name, { st: d.st, opts: { points: d.points, onDrawEnd: null } });
  }
  cancelDrawing() { this.drawings().filter(o => o.currentStep !== -1).forEach(o => this.chart.removeOverlay({ id: o.id })); }

  // 지표
  indOpts(n) {
    const st = this.st, o = { name: n };
    if (st.params[n]) o.calcParams = st.params[n];
    const ls = st.indStyles[n];
    if (ls && ls.length) {
      const base = this.chart.getStyles().indicator.lines;
      o.styles = { lines: ls.map((l, i) => ({ ...(base[i % base.length]), ...(l || {}) })) };
    }
    if (FIXED_RANGE[n]) { o.minValue = FIXED_RANGE[n][0]; o.maxValue = FIXED_RANGE[n][1]; }
    if (!MAIN_INDS.includes(n)) {
      const self = this;
      o.draw = ({ ctx, bounding, yAxis }) => { self.drawLevels(n, ctx, bounding, yAxis); return false; };
    }
    return o;
  }
  levelsOf(n) {
    const lv = this.st.levels[n];
    return Object.assign({ show: !!LEVEL_DEF[n], vals: LEVEL_DEF[n] || [], color: '#787b86', dashed: true, fill: true }, lv || {});
  }
  drawLevels(n, ctx, bounding, yAxis) {
    const lv = this.levelsOf(n);
    if (!lv.show || !lv.vals.length) return;
    const ys = lv.vals.map(v => Math.round(yAxis.convertToPixel(v)) + 0.5);
    if (lv.fill && ys.length >= 2) {
      const top = Math.max(0, Math.min(...ys)), bot = Math.min(bounding.height, Math.max(...ys));
      if (bot > top) { ctx.fillStyle = hexA(lv.color, 0.07); ctx.fillRect(0, top, bounding.width, bot - top); }
    }
    ctx.strokeStyle = lv.color; ctx.lineWidth = 1; ctx.setLineDash(lv.dashed ? [4, 4] : []);
    ys.forEach(y => { if (y < 0 || y > bounding.height) return; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(bounding.width, y); ctx.stroke(); });
  }
  applyIndicators() {
    const ch = this.chart, st = this.st;
    [...MAIN_INDS, ...SUB_INDS].forEach(n => ch.removeIndicator({ name: n }));
    st.main.forEach(n => ch.createIndicator({ ...this.indOpts(n), paneId: 'candle_pane' }, true));
    const ids = st.sub.map(n => ch.createIndicator(this.indOpts(n)));
    this.fitPanes(ids);
    this.applyAxis();
  }
  // 보조지표 칸 높이: 캔들 영역이 최소 절반은 되게
  fitPanes(ids) {
    const ch = this.chart;
    ids = ids || this.st.sub.map(n => ch.getIndicators({ name: n })[0]?.id);
    const panes = ids.map(id => id && ch.getIndicators({ id })[0]?.paneId).filter(Boolean);
    if (!panes.length) return;
    const h = this.el.clientHeight || 600;
    const each = Math.round(Math.max(36, Math.min(110, (h * 0.45) / panes.length)));
    panes.forEach(id => ch.setPaneOptions({ id, height: each }));
  }
  refreshIndicator(n) {
    const ind = this.chart.getIndicators({ name: n })[0]; if (!ind) return;
    const o = this.indOpts(n);
    if (!o.calcParams) o.calcParams = ind.calcParams;
    if (!o.styles) o.styles = { lines: this.chart.getStyles().indicator.lines };
    this.chart.overrideIndicator(o);
  }
  applyStyles() {
    const s = L.settings, ch = this.chart;
    ch.setStyles(s.theme);
    const many = GRIDS[L.grid] >= 4;
    const rule = v => v === 'auto' ? (many ? 'follow_cross' : 'always') : v;
    const T = 'rgba(0,0,0,0)';
    const lastText = ch.getStyles().candle.priceMark.last.text;
    const gc = s.gridColor ? { color: s.gridColor } : {};
    const tc = s.textColor ? { color: s.textColor } : {};
    ch.setStyles({
      candle: {
        type: s.chartType,
        bar: {
          compareRule: s.compareRule,
          upColor: s.bodyUp, downColor: s.bodyDown, noChangeColor: s.bodyUp,
          upBorderColor: s.borderShow ? s.borderUp : s.bodyUp, downBorderColor: s.borderShow ? s.borderDown : s.bodyDown, noChangeBorderColor: s.borderShow ? s.borderUp : s.bodyUp,
          upWickColor: s.wickShow ? s.wickUp : T, downWickColor: s.wickShow ? s.wickDown : T, noChangeWickColor: s.wickShow ? s.wickUp : T
        },
        area: { lineColor: s.bodyUp, backgroundColor: [{ offset: 0, color: hexA(s.bodyUp, 0.01) }, { offset: 1, color: hexA(s.bodyUp, 0.25) }] },
        priceMark: {
          high: { show: s.highLow }, low: { show: s.highLow },
          last: {
            show: s.lastLine, upColor: s.bodyUp, downColor: s.bodyDown, noChangeColor: s.bodyUp, line: { show: s.lastLine },
            extendTexts: [{ ...lastText, show: !!s.countdown, position: 'below_price', updateInterval: 1000, backgroundColor: null }]
          }
        },
        tooltip: { showRule: rule(s.statusOHLC) }
      },
      indicator: { tooltip: { showRule: rule(s.statusInd) }, bars: [{ upColor: hexA(s.bodyUp, 0.6), downColor: hexA(s.bodyDown, 0.6), noChangeColor: hexA(s.bodyUp, 0.6) }] },
      grid: { show: true, horizontal: { show: s.gridH, ...gc }, vertical: { show: s.gridV, ...gc } },
      ...(s.crossColor ? { crosshair: { horizontal: { line: { color: s.crossColor } }, vertical: { line: { color: s.crossColor } } } } : {}),
      xAxis: { tickText: { size: +s.textSize, ...tc } },
      yAxis: { tickText: { size: +s.textSize, ...tc } }
    });
    this.applyAxis();
    this.el.style.background = s.bg || 'var(--bg)';
  }
  applyAxis() {
    const s = L.settings, ch = this.chart;
    const panes = ['candle_pane', ...ch.getIndicators().map(i => i.paneId)].filter((v, i, a) => v && a.indexOf(v) === i);
    panes.forEach(p => ch.overrideYAxis({ paneId: p, position: s.axisPos, ...(p === 'candle_pane' ? { name: s.scale, reverse: !!s.invert } : {}) }));
  }


  // 십자선 동기화 (같은 시간 위치)
  syncCrosshair(c) {
    if (syncing || !L.sync.crosshair || cells.length < 2 || c.x == null) return;
    const pt = this.chart.convertFromPixel([{ x: c.x }], { paneId: 'candle_pane' })[0];
    const ts = pt && pt.timestamp; if (ts == null) return;
    syncing = true;
    for (const o of cells) {
      if (o === this) continue;
      const p = o.chart.convertToPixel({ timestamp: ts }, { paneId: 'candle_pane' });
      if (p && p.x != null) o.chart.executeAction('onCrosshairChange', { x: p.x, paneId: 'candle_pane' });
    }
    syncing = false;
  }
}

const activeCell = () => cells[L.active] || cells[0];
function setActive(i) {
  if (L.active === i || !cells[i]) return;
  L.active = i; saveLayout();
  cells.forEach((c, j) => c.el.classList.toggle('act', j === i));
  updateTopBar();
  if ($('#indModal').classList.contains('show')) { renderIndList(); renderIndEdit(); }
}
function updatePrice() {
  const c = activeCell(), b = c && c.lastBar;
  $('#price').textContent = b ? fmtPrice(b.close, c.pp) : '-';
  $('#price').className = b ? (b.close >= b.open ? 'upc' : 'downc') : '';
  if (b && !R.on) document.title = `${c.st.symbol} ${fmtPrice(b.close, c.pp)}`;
}
function updateTopBar() {
  const st = activeCell().st;
  $('#symBtn').innerHTML = `${esc(st.symbol)}<small>${MARKETS[st.market].badge} ▾</small>`;
  document.querySelectorAll('#tfs button').forEach(b => b.classList.toggle('on', b.dataset.tf === st.tf));
  updatePrice();
  renderWatchlist();
}

function buildGrid() {
  hideDrawBar();
  cells.forEach(c => c.destroy()); cells = [];
  const n = GRIDS[L.grid];
  while (L.cells.length < n) L.cells.push(clone(L.cells[L.active] || L.cells[0]));
  L.active = Math.min(L.active, n - 1);
  $('#grid').dataset.g = L.grid;
  $('#grid').classList.toggle('multi', n > 1);
  $('#grid').classList.toggle('many', n >= 4);
  for (let i = 0; i < n; i++) cells.push(new Cell(i));
  cells.forEach((c, j) => c.el.classList.toggle('act', j === L.active));
  cells.forEach(c => c.start());
  updateTopBar();
}

// ───────── 종목·타임프레임 변경 ─────────
function changeSymbol(market, symbol) {
  symbol = symbol.trim().toUpperCase(); if (!symbol) return;
  const targets = L.sync.symbol ? cells : [activeCell()];
  targets.forEach(c => c.setSymbol(market, symbol));
  saveLayout(); updateTopBar();
}
function changeTf(tf) {
  const targets = L.sync.tf ? cells : [activeCell()];
  targets.forEach(c => c.setTf(tf));
  saveLayout(); updateTopBar();
}
$('#tfs').innerHTML = TF_SHOW.map(t => `<button data-tf="${t}">${t}</button>`).join('');
$('#tfs').onclick = e => { const tf = e.target.dataset.tf; if (tf) changeTf(tf); };

// ───────── 리플레이 ─────────
function startReplay(T) {
  replayPause();
  R.on = true; R.T = T; R.id++;
  $('#replayBar').classList.add('show'); $('#rpBadge').style.display = 'inline-block';
  $('#btnReplay').classList.add('on');
  document.title = `[리플레이] ${activeCell().st.symbol}`;
  cells.forEach(c => c.chart.setDataLoader(c.replayLoader));
  updateReplayUI();
}
function exitReplay() {
  replayPause();
  R.on = false; R.id++;
  $('#replayBar').classList.remove('show'); $('#rpBadge').style.display = 'none';
  $('#btnReplay').classList.remove('on');
  cells.forEach(c => c.chart.setDataLoader(c.liveLoader));
}
function replayStep() {
  if (!R.on) return;
  const a = activeCell(), rp = a.rp;
  if (!rp.buffer.length) {
    if (rp.done) { replayPause(); toast('현재 시점까지 모두 재생했어요'); }
    else a.refill();
    return;
  }
  R.T = rp.buffer[0].timestamp + a.ms;  // 활성 차트 기준으로 한 봉
  cells.forEach(c => c.advanceTo(R.T));
  updateReplayUI();
}
function replayPlay() {
  R.playing = true; $('#rpPlay').textContent = '⏸';
  clearInterval(R.timer);
  R.timer = setInterval(replayStep, 1000 / +$('#rpSpeed').value);
}
function replayPause() { R.playing = false; $('#rpPlay').textContent = '▶'; clearInterval(R.timer); }
function updateReplayUI() { $('#rpTime').textContent = fmtTime(R.T - 1); }

let picking = false;
function beginPick() {
  picking = true; replayPause();
  $('#hintText').textContent = '리플레이 시작할 봉을 클릭하거나 날짜 입력 →';
  const d = new Date(Date.now() - 7 * 864e5 + 9 * 36e5).toISOString().slice(0, 16);
  $('#hintExtra').innerHTML = `<input type="datetime-local" id="rpDate" value="${d}"><button id="rpGo">시작</button>`;
  $('#rpGo').onclick = () => { const v = $('#rpDate').value; if (!v) return; endPick(); startReplay(new Date(v + ':00+09:00').getTime()); };
  $('#hint').classList.add('show');
}
function endPick() { picking = false; $('#hint').classList.remove('show'); }
let downPos = null;
$('#grid').addEventListener('pointerdown', e => { downPos = [e.clientX, e.clientY]; }, true);
$('#grid').addEventListener('pointerup', e => {
  if (!picking || !downPos) return;
  if (Math.hypot(e.clientX - downPos[0], e.clientY - downPos[1]) > 5) return;
  const cell = cells.find(c => c.el.contains(e.target)); if (!cell) return;
  const ch = cell.crosshair; if (!ch || ch.x == null) return;
  const pt = cell.chart.convertFromPixel([{ x: ch.x, y: ch.y ?? 0 }], { paneId: ch.paneId || 'candle_pane' })[0] || {};
  const list = cell.chart.getDataList();
  const k = list[Math.min(Math.max(pt.dataIndex ?? -1, 0), list.length - 1)];
  if (!k) return;
  endPick();
  startReplay(k.timestamp + cell.ms);
}, true);
$('#hintCancel').onclick = endPick;
$('#btnReplay').onclick = () => { if (R.on) exitReplay(); else beginPick(); };
$('#rpPlay').onclick = () => R.playing ? replayPause() : replayPlay();
$('#rpStep').onclick = () => { replayPause(); replayStep(); };
$('#rpSpeed').onchange = () => { if (R.playing) replayPlay(); };
$('#rpPick').onclick = beginPick;
$('#rpExit').onclick = () => exitReplay();

// ───────── 종목 검색 패널 ─────────
let symMarket = 'futures', symRows = [], symHl = 0;
function openSymPanel(prefill = '') {
  closeMenus();
  symMarket = activeCell().st.market;
  const p = $('#symPanel'), r = $('#symBtn').getBoundingClientRect();
  p.style.top = (r.bottom + 4) + 'px';
  p.style.left = Math.max(4, Math.min(r.left, innerWidth - 470)) + 'px';
  p.classList.add('show');
  $('#symSearch').value = prefill;
  $('#symSearch').focus();
  renderSymList();
}
async function renderSymList() {
  document.querySelectorAll('#symPanel .tabs button').forEach(b => b.classList.toggle('on', b.dataset.mk === symMarket));
  const box = $('#symList');
  let list;
  try { list = await loadTickers(symMarket); }
  catch { box.innerHTML = `<div style="padding:14px;color:var(--muted)">목록을 못 불러왔어요. 이름을 정확히 입력하고 Enter를 눌러도 돼요.</div>`; symRows = []; return; }
  const q = $('#symSearch').value.trim().toUpperCase();
  let rows = q ? list.filter(x => x.s.includes(q)) : list;
  if (q) rows = rows.slice().sort((a, b) => (b.s.startsWith(q) - a.s.startsWith(q)) || (b.qv - a.qv));
  symRows = rows.slice(0, 300); symHl = 0;
  const inWl = s => watchlist.some(w => w.market === symMarket && w.symbol === s);
  box.innerHTML = symRows.map((x, i) => `<div class="sym-row ${i === 0 ? 'hl' : ''}" data-s="${x.s}">
    <span class="st ${inWl(x.s) ? 'on' : ''}" data-star="${x.s}" title="관심종목">${inWl(x.s) ? '★' : '☆'}</span>
    <span class="n">${x.s}</span><span class="r">${x.p}</span>
    <span class="r ${x.chg >= 0 ? 'upc' : 'downc'}">${x.chg >= 0 ? '+' : ''}${x.chg.toFixed(2)}%</span>
    <span class="r" style="color:var(--muted)">${fmtBig(x.qv)}</span></div>`).join('') ||
    `<div style="padding:14px;color:var(--muted)">검색 결과 없음 — Enter로 "${esc(q)}" 열기</div>`;
}
function hlSym(i) {
  const rows = $('#symList').querySelectorAll('.sym-row'); if (!rows.length) return;
  symHl = (i + rows.length) % rows.length;
  rows.forEach((r, j) => r.classList.toggle('hl', j === symHl));
  rows[symHl].scrollIntoView({ block: 'nearest' });
}
function pickSym(s) { $('#symPanel').classList.remove('show'); changeSymbol(symMarket, s); }
$('#symBtn').onclick = e => { e.stopPropagation(); $('#symPanel').classList.contains('show') ? $('#symPanel').classList.remove('show') : openSymPanel(); };
$('#symSearch').addEventListener('input', renderSymList);
$('#symSearch').addEventListener('keydown', e => {
  if (e.key === 'ArrowDown') { e.preventDefault(); hlSym(symHl + 1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); hlSym(symHl - 1); }
  else if (e.key === 'Enter') { const r = symRows[symHl]; pickSym(r ? r.s : e.target.value); }
  else if (e.key === 'Escape') $('#symPanel').classList.remove('show');
});
$('#symPanel').addEventListener('click', e => {
  const mk = e.target.closest('[data-mk]');
  if (mk) { symMarket = mk.dataset.mk; renderSymList(); $('#symSearch').focus(); return; }
  const st = e.target.closest('[data-star]');
  if (st) { toggleWatch(symMarket, st.dataset.star); renderSymList(); return; }
  const r = e.target.closest('[data-s]'); if (r) pickSym(r.dataset.s);
});


// ───────── 작도 도구바 (그룹 + 펼침 메뉴) ─────────
const left = $('#left');
const groupCur = LS.get('groupCur', {});
const ICO = d => `<svg viewBox="0 0 24 24">${d}</svg>`;
function groupTool(g) { return groupCur[g.id] && g.tools.includes(groupCur[g.id]) ? groupCur[g.id] : g.tools[0]; }
function renderLeft() {
  left.innerHTML = `<button id="btnCursor" class="tb" title="커서 (Esc)">${ICO('<path d="M6 3l12 9-5.5 1L16 20l-2.5 1-3-7L6 17z"/>')}</button><div class="sep"></div>` +
    TK.GROUPS.map(g => {
      const t = groupTool(g);
      return `<div class="tg" data-g="${g.id}"><button class="tb" data-tool="${t}" title="${TK.NAMES[t]}${TK.SHORTCUTS[t] ? ' (' + TK.SHORTCUTS[t] + ')' : ''}">${TK.ICONS[t]}</button>${g.tools.length > 1 ? `<button class="more" data-more="${g.id}" title="${g.title} 도구 모두 보기">›</button>` : ''}</div>`;
    }).join('') +
    `<div class="sep"></div>
     <button id="btnMagnet" class="tb" title="자석: 끔 → 약자석 → 강자석">${ICO('<path d="M6 4v8a6 6 0 0012 0V4h-4v8a2 2 0 01-4 0V4z"/>')}<span class="lv"></span></button>
     <button id="btnLock" class="tb" title="모든 작도 잠금">${ICO('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>')}</button>
     <button id="btnHideDraw" class="tb" title="작도 숨기기/보이기">${ICO('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>')}</button>
     <button id="btnClearDraw" class="tb" title="이 종목 작도 전체 삭제">${ICO('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>')}</button>`;
  setActiveTool(activeTool);
  if (L) { applyMagnetUI(); applyLockUI(); }
  $('#btnHideDraw').classList.toggle('on', drawHidden);
}
let activeTool = null;
function setActiveTool(name) {
  activeTool = name;
  left.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === name));
  const cur = left.querySelector('#btnCursor'); if (cur) cur.classList.toggle('on', !name);
}
function cancelDrawing() { cells.forEach(c => c.cancelDrawing()); setActiveTool(null); }
function startTool(name) {
  if (activeTool === name) { cancelDrawing(); return; }
  cancelDrawing();
  if (drawHidden) toggleHide();
  if (L.lockAll) { L.lockAll = false; saveLayout(); applyLock(); toast('작도 잠금을 풀었어요'); }
  hideDrawBar();
  const g = TK.GROUPS.find(g => g.tools.includes(name));
  if (g && groupCur[g.id] !== name) { groupCur[g.id] = name; LS.set('groupCur', groupCur); renderLeft(); }
  activeCell().createDrawing(name);
  setActiveTool(name);
  if (TK.HINTS[name]) toast(TK.HINTS[name], 3000);
}
function openFly(gid, anchor) {
  const g = TK.GROUPS.find(x => x.id === gid); if (!g) return;
  const m = $('#toolFly');
  m.innerHTML = `<div class="t">${g.title}</div>` + g.tools.map(t => `<div class="row fly ${t === activeTool ? 'cur' : ''}" data-fly="${t}"><span class="fi">${TK.ICONS[t]}</span><span style="flex:1">${TK.NAMES[t]}</span><span class="m">${TK.SHORTCUTS[t] || ''}</span></div>`).join('');
  closeMenus();
  const r = anchor.getBoundingClientRect();
  m.classList.add('show');
  m.style.left = (r.right + 4) + 'px';
  m.style.top = Math.max(4, Math.min(r.top, innerHeight - m.offsetHeight - 8)) + 'px';
}
$('#toolFly').addEventListener('click', e => { const r = e.target.closest('[data-fly]'); if (!r) return; closeMenus(); startTool(r.dataset.fly); });
let lpTimer = null, lpFired = false;
left.addEventListener('pointerdown', e => {
  const tg = e.target.closest('.tg'); lpFired = false;
  if (!tg || !tg.querySelector('.more')) return;
  lpTimer = setTimeout(() => { lpFired = true; openFly(tg.dataset.g, tg); }, 450); // 길게 누르면 펼침
});
['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => left.addEventListener(ev, () => clearTimeout(lpTimer)));
left.addEventListener('contextmenu', e => { const tg = e.target.closest('.tg'); if (tg && tg.querySelector('.more')) { e.preventDefault(); openFly(tg.dataset.g, tg); } });
left.addEventListener('click', e => {
  if (lpFired) { lpFired = false; return; }
  const b = e.target.closest('button'); if (!b) return;
  e.stopPropagation();
  if (b.dataset.more) { const tg = b.closest('.tg'); $('#toolFly').classList.contains('show') ? closeMenus() : openFly(b.dataset.more, tg); return; }
  if (b.dataset.tool) { closeMenus(); startTool(b.dataset.tool); return; }
  if (b.id === 'btnCursor') { cancelDrawing(); hideDrawBar(); return; }
  if (b.id === 'btnMagnet') {
    L.magnet = { off: 'weak', weak: 'strong', strong: 'off' }[L.magnet]; saveLayout(); applyMagnet();
    toast({ off: '자석 끔', weak: '약자석: 캔들 근처에서만 고가/저가/시가/종가에 붙어요', strong: '강자석: 항상 가장 가까운 고가/저가/시가/종가에 붙어요' }[L.magnet], 3000);
  } else if (b.id === 'btnLock') {
    L.lockAll = !L.lockAll; saveLayout(); applyLock(); toast(L.lockAll ? '모든 작도 잠금 (선택·이동 안 됨)' : '작도 잠금 해제');
  } else if (b.id === 'btnHideDraw') toggleHide();
  else if (b.id === 'btnClearDraw') {
    const c = activeCell();
    if (confirm(`${c.st.symbol} 작도를 모두 지울까요?`)) { c.chart.removeOverlay({ groupId: DRAW_GROUP }); }
  }
});
function applyMagnetUI() {
  const b = $('#btnMagnet'); if (!b) return;
  b.classList.toggle('on', L.magnet !== 'off');
  b.querySelector('.lv').textContent = { off: '', weak: '약', strong: '강' }[L.magnet];
}
function applyMagnet() {
  applyMagnetUI();
  cells.forEach(c => c.drawings().forEach(o => c.chart.overrideOverlay({ id: o.id, mode: MAGNET[L.magnet] })));
}
function applyLockUI() { const b = $('#btnLock'); if (b) b.classList.toggle('on', !!L.lockAll); }
function applyLock() {
  applyLockUI(); if (L.lockAll) hideDrawBar();
  cells.forEach(c => c.drawings().forEach(o => c.chart.overrideOverlay({ id: o.id, lock: !!L.lockAll })));
}
function toggleHide() {
  drawHidden = !drawHidden;
  cells.forEach(c => c.drawings().forEach(o => c.chart.overrideOverlay({ id: o.id, visible: !drawHidden })));
  $('#btnHideDraw').classList.toggle('on', drawHidden);
  if (drawHidden) hideDrawBar();
}

// ───────── 선택한 작도 편집 바 (도구마다 따로 저장) ─────────
$('#dbSw').innerHTML = SWATCHES.map(c => `<span class="sw" data-c="${c}" style="background:${c}"></span>`).join('');
function showDrawBar(cell, o) {
  sel = { cell, id: o.id };
  const st = o.extendData?.st ? normSt(o.extendData.st) : null, styled = !!st;
  $('#dbName').textContent = TK.NAMES[o.name] || o.name;
  $('#drawBar').classList.toggle('nostyle', !styled);
  $('#dbFillW').style.display = styled && TK.FILLABLE.includes(o.name) ? '' : 'none';
  if (styled) {
    $('#dbColor').value = st.color.slice(0, 7); $('#dbSize').value = st.size; $('#dbLine').value = st.line;
    $('#dbFill').value = st.fill;
    document.querySelectorAll('#dbSw .sw').forEach(s => s.classList.toggle('on', s.dataset.c.toLowerCase() === st.color.toLowerCase()));
  }
  $('#drawBar').classList.add('show');
}
function hideDrawBar() { sel = null; $('#drawBar').classList.remove('show'); }
function selOverlay() { return sel ? sel.cell.chart.getOverlays({ id: sel.id })[0] : null; }
function editSelected(patch) {
  const o = selOverlay(); if (!o || !o.extendData?.st) return;
  const st = { ...normSt(o.extendData.st), ...patch }, cell = sel.cell, id = o.id;
  cell.chart.overrideOverlay({ id, styles: styleFor(st), extendData: { st } });
  LS.set('toolStyle:' + o.name, st);   // 이 도구의 다음 작도에도 같은 스타일
  cell.saveDrawings();
  const o2 = cell.chart.getOverlays({ id })[0]; if (o2) showDrawBar(cell, o2);
}
$('#dbSw').addEventListener('click', e => { const s = e.target.closest('[data-c]'); if (s) editSelected({ color: s.dataset.c }); });
$('#dbColor').addEventListener('input', e => editSelected({ color: e.target.value }));
$('#dbSize').addEventListener('change', e => editSelected({ size: +e.target.value }));
$('#dbLine').addEventListener('change', e => editSelected({ line: e.target.value }));
$('#dbFill').addEventListener('input', e => editSelected({ fill: +e.target.value }));
$('#dbClone').addEventListener('click', () => {
  const o = selOverlay(); if (!o) return;
  const cell = sel.cell, shift = 5 * cell.ms;
  cell.createDrawing(o.name, { st: o.extendData?.st, opts: { points: o.points.map(p => ({ timestamp: p.timestamp + shift, value: p.value })), onDrawEnd: null } });
  cell.saveDrawings(); toast('복제했어요 (오른쪽으로 5봉)');
});
function deleteSelected() { if (sel) sel.cell.chart.removeOverlay({ id: sel.id }); hideDrawBar(); }
$('#dbDel').addEventListener('click', deleteSelected);

const ALT_KEYS = { KeyT: 'segment', KeyH: 'horizontalStraightLine', KeyJ: 'horizontalRayLine', KeyV: 'verticalStraightLine', KeyC: 'crossLine', KeyF: 'fibonacciLine', KeyR: 'rectBox' };
document.addEventListener('keydown', e => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
  if (e.altKey && ALT_KEYS[e.code]) { e.preventDefault(); startTool(ALT_KEYS[e.code]); return; }
  if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); deleteSelected(); return; }
  if (e.key === 'Escape') { cancelDrawing(); endPick(); closeMenus(); hideDrawBar(); document.querySelectorAll('.modal').forEach(m => m.classList.remove('show')); return; }
  if (R.on && e.shiftKey && e.key === 'ArrowRight') { e.preventDefault(); replayStep(); return; }
  if (/^[a-zA-Z0-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey && !document.querySelector('.modal.show')) { e.preventDefault(); openSymPanel(e.key.toUpperCase()); }
});

// ───────── 지표 설정 창 ─────────
let indSel = null;
function openIndModal() {
  closeMenus();
  const st = activeCell().st;
  if (!indSel || (!st.main.includes(indSel) && !st.sub.includes(indSel))) indSel = st.sub.find(n => LEVEL_DEF[n]) || st.main[0] || st.sub[0] || null;
  renderIndList(); renderIndEdit();
  $('#indModal').classList.add('show');
}
function renderIndList() {
  const st = activeCell().st;
  const item = (n, on) => `<div class="it ${indSel === n ? 'sel' : ''}" data-n="${n}"><input type="checkbox" data-tg="${n}" ${on ? 'checked' : ''}><span>${n}</span><span class="m">${IND_NAMES[n] && IND_NAMES[n] !== n ? IND_NAMES[n] : ''}</span></div>`;
  $('#indList').innerHTML = (cells.length > 1 ? `<div class="t" style="color:var(--accent)">선택한 차트 (${activeCell().idx + 1}번)에 적용</div>` : '') +
    `<div class="t">메인 차트</div>${MAIN_INDS.map(n => item(n, st.main.includes(n))).join('')}
    <div class="t">보조 지표</div>${SUB_INDS.map(n => item(n, st.sub.includes(n))).join('')}`;
}
function renderIndEdit() {
  const cell = activeCell(), box = $('#indEdit'), n = indSel;
  const ind = n && cell.chart.getIndicators({ name: n })[0];
  if (!ind) { box.innerHTML = `<div class="empty">왼쪽에서 지표를 체크해서 켜고,<br>이름을 눌러 설정을 바꿔요.</div>`; return; }
  const params = ind.calcParams || [];
  const lineFigs = (ind.figures || []).filter(f => f.type === 'line');
  const base = cell.chart.getStyles().indicator.lines;
  const cur = cell.st.indStyles[n] || [];
  const pn = PARAM_NAMES[n] || [];
  const isSub = !MAIN_INDS.includes(n);
  const lv = cell.levelsOf(n);
  box.innerHTML = `<h4>${n} <span class="m">${IND_NAMES[n] || ''}</span></h4>
    ${params.length ? `<div class="sec">파라미터${pn.length ? ' (' + pn.join(' / ') + ')' : ''}</div><div class="prm">${params.map((p, i) => `<input type="number" min="0.1" step="any" data-pi="${i}" value="${p}" title="${pn[i] || ''}">`).join('')}
      ${VAR_PARAMS.includes(n) ? `<button id="pAdd" title="기간 추가">＋</button><button id="pDel" title="마지막 기간 삭제">－</button>` : ''}</div>` : ''}
    ${lineFigs.length ? `<div class="sec">선 스타일</div>${lineFigs.map((f, i) => {
      const s = { ...base[i % base.length], ...(cur[i] || {}) };
      return `<div class="ln"><span>${esc((f.title || f.key).replace(/[:：]\s*$/, ''))}</span>
        <input type="color" data-lc="${i}" value="${s.color.startsWith('#') ? s.color.slice(0, 7) : '#2962ff'}">
        <select data-lw="${i}">${[1, 2, 3, 4].map(w => `<option value="${w}" ${+s.size === w ? 'selected' : ''}>${w}px</option>`).join('')}</select></div>`;
    }).join('')}` : ''}
    ${isSub ? `<div class="sec">기준선 (상단·중단·하단)</div>
      <div class="lvrow"><label style="display:flex;gap:4px;align-items:center"><input type="checkbox" id="lvShow" ${lv.show ? 'checked' : ''}> 표시</label>
        ${lv.vals.map((v, i) => `<input type="number" step="any" data-lv="${i}" value="${v}">`).join('')}
        <button id="lvAdd" title="선 추가">＋</button>${lv.vals.length ? '<button id="lvDel" title="마지막 선 삭제">－</button>' : ''}</div>
      <div class="lvrow" style="margin-top:8px"><input type="color" id="lvColor" value="${lv.color}">
        <label style="display:flex;gap:4px;align-items:center"><input type="checkbox" id="lvDash" ${lv.dashed ? 'checked' : ''}> 점선</label>
        <label style="display:flex;gap:4px;align-items:center"><input type="checkbox" id="lvFill" ${lv.fill ? 'checked' : ''}> 사이 배경 채우기</label></div>` : ''}
    <div class="sec"></div><button id="indReset">기본값으로</button>`;
}
function editLevels(fn) {
  const cell = activeCell(), n = indSel, lv = cell.levelsOf(n);
  fn(lv); cell.st.levels[n] = lv; saveLayout(); cell.refreshIndicator(n);
}
$('#indList').addEventListener('click', e => {
  const cell = activeCell(), st = cell.st;
  const tg = e.target.closest('[data-tg]');
  if (tg) {
    const n = tg.dataset.tg, list = MAIN_INDS.includes(n) ? st.main : st.sub;
    const i = list.indexOf(n); i >= 0 ? list.splice(i, 1) : list.push(n);
    if (i < 0) indSel = n;
    saveLayout(); cell.applyIndicators(); renderIndList(); renderIndEdit();
    return;
  }
  const it = e.target.closest('[data-n]');
  if (it) {
    const n = it.dataset.n, list = MAIN_INDS.includes(n) ? st.main : st.sub;
    if (!list.includes(n)) { list.push(n); saveLayout(); cell.applyIndicators(); }
    indSel = n; renderIndList(); renderIndEdit();
  }
});
$('#indEdit').addEventListener('change', e => {
  const cell = activeCell(), n = indSel, t = e.target;
  if (t.dataset.pi != null) {
    const arr = [...$('#indEdit').querySelectorAll('[data-pi]')].map(x => +x.value).filter(v => v > 0);
    if (arr.length) cell.st.params[n] = arr;
    saveLayout(); cell.refreshIndicator(n); renderIndEdit();
  } else if (t.dataset.lw != null) {
    const i = +t.dataset.lw; cell.st.indStyles[n] = cell.st.indStyles[n] || [];
    cell.st.indStyles[n][i] = { ...(cell.st.indStyles[n][i] || {}), size: +t.value };
    saveLayout(); cell.refreshIndicator(n);
  } else if (t.dataset.lv != null) {
    editLevels(lv => { lv.vals = [...$('#indEdit').querySelectorAll('[data-lv]')].map(x => +x.value).filter(v => !isNaN(v)); });
  } else if (t.id === 'lvShow') editLevels(lv => { lv.show = t.checked; });
  else if (t.id === 'lvDash') editLevels(lv => { lv.dashed = t.checked; });
  else if (t.id === 'lvFill') editLevels(lv => { lv.fill = t.checked; });
});
$('#indEdit').addEventListener('input', e => {
  const t = e.target, cell = activeCell(), n = indSel;
  if (t.id === 'lvColor') { editLevels(lv => { lv.color = t.value; }); return; }
  if (t.dataset.lc == null) return;
  const i = +t.dataset.lc; cell.st.indStyles[n] = cell.st.indStyles[n] || [];
  cell.st.indStyles[n][i] = { ...(cell.st.indStyles[n][i] || {}), color: t.value };
  saveLayout(); cell.refreshIndicator(n);
});
$('#indEdit').addEventListener('click', e => {
  const cell = activeCell(), n = indSel; if (!n) return;
  const ind = cell.chart.getIndicators({ name: n })[0];
  const id = e.target.id;
  if (id === 'pAdd') { const p = [...ind.calcParams]; p.push(Math.round((p[p.length - 1] || 10) * 2)); cell.st.params[n] = p; }
  else if (id === 'pDel') { const p = [...ind.calcParams]; if (p.length > 1) p.pop(); cell.st.params[n] = p; }
  else if (id === 'lvAdd') { editLevels(lv => { lv.show = true; lv.vals.push(lv.vals.length ? lv.vals[lv.vals.length - 1] : 0); }); renderIndEdit(); return; }
  else if (id === 'lvDel') { editLevels(lv => { lv.vals.pop(); }); renderIndEdit(); return; }
  else if (id === 'indReset') { delete cell.st.params[n]; delete cell.st.indStyles[n]; delete cell.st.levels[n]; saveLayout(); cell.applyIndicators(); renderIndEdit(); return; }
  else return;
  saveLayout(); cell.refreshIndicator(n); renderIndEdit();
});
$('#indClose').onclick = () => $('#indModal').classList.remove('show');
$('#indModal').addEventListener('click', e => { if (e.target.id === 'indModal') $('#indModal').classList.remove('show'); });
$('#btnInd').onclick = e => { e.stopPropagation(); openIndModal(); };


// ───────── 차트 설정 창 ─────────
const STATUS_OPTS = [['auto', '자동 (4분할 이상은 마우스 올릴 때)'], ['always', '항상'], ['follow_cross', '마우스 올릴 때만'], ['none', '숨김']];
const SET_TABS = [
  { id: 'symbol', t: '종목', items: [
    { type: 'select', k: 'chartType', label: '차트 종류', opts: [['candle_solid', '캔들'], ['candle_stroke', '속 빈 캔들'], ['candle_up_stroke', '양봉만 속 빈 캔들'], ['ohlc', '바 (OHLC)'], ['area', '영역']] },
    { type: 'sec', label: '캔들 색 (양봉 / 음봉)' },
    { type: 'pair', label: '몸통', k1: 'bodyUp', k2: 'bodyDown' },
    { type: 'pair', label: '테두리', k1: 'borderUp', k2: 'borderDown', chk: 'borderShow' },
    { type: 'pair', label: '꼬리', k1: 'wickUp', k2: 'wickDown', chk: 'wickShow' },
    { type: 'select', k: 'compareRule', label: '양봉·음봉 기준', opts: [['current_open', '시가 대비'], ['previous_close', '전봉 종가 대비']] },
    { type: 'buttons', items: [['preset:default', '기본 색'], ['preset:kr', '한국식 (빨강/파랑)'], ['preset:mono', '흑백']] },
    { type: 'sec', label: '표시' },
    { type: 'check', k: 'lastLine', label: '현재가 선·라벨' },
    { type: 'check', k: 'countdown', label: '봉 마감 카운트다운 (현재가 라벨 아래)' },
    { type: 'check', k: 'highLow', label: '화면 안 최고가·최저가 표시' }
  ] },
  { id: 'status', t: '상태 표시줄', items: [
    { type: 'select', k: 'statusOHLC', label: '종목·시고저종 정보', opts: STATUS_OPTS },
    { type: 'select', k: 'statusInd', label: '지표 값', opts: STATUS_OPTS }
  ] },
  { id: 'scale', t: '스케일', items: [
    { type: 'select', k: 'axisPos', label: '가격 축 위치', opts: [['right', '오른쪽'], ['left', '왼쪽']] },
    { type: 'select', k: 'scale', label: '가격 스케일', opts: [['normal', '일반'], ['logarithm', '로그'], ['percentage', '퍼센트 (%)']] },
    { type: 'check', k: 'invert', label: '가격 축 뒤집기' },
    { type: 'check', k: 'countdown', label: '봉 마감 카운트다운' }
  ] },
  { id: 'look', t: '모양', items: [
    { type: 'select', k: 'theme', label: '테마', opts: [['dark', '다크'], ['light', '라이트']] },
    { type: 'color', k: 'bg', label: '배경색', reset: true },
    { type: 'check', k: 'gridV', label: '세로 그리드' },
    { type: 'check', k: 'gridH', label: '가로 그리드' },
    { type: 'color', k: 'gridColor', label: '그리드 색', reset: true },
    { type: 'color', k: 'crossColor', label: '십자선 색', reset: true },
    { type: 'select', k: 'textSize', label: '축 글자 크기', opts: [[10, '10'], [11, '11'], [12, '12'], [13, '13'], [14, '14']] },
    { type: 'color', k: 'textColor', label: '축 글자 색', reset: true }
  ] },
  { id: 'data', t: '앱·백업', items: [{ type: 'custom', render: () => dataTabHTML() }] }
];
let setTab = 'symbol';
function openSetModal() { closeMenus(); renderSetModal(); $('#setModal').classList.add('show'); }
function defColor(k) {
  const dark = L.settings.theme !== 'light';
  return { bg: dark ? '#131722' : '#ffffff', gridColor: dark ? '#292c38' : '#ececec', crossColor: dark ? '#758696' : '#9598a1', textColor: dark ? '#d1d4dc' : '#131722' }[k] || '#888888';
}
function renderSetModal() {
  const s = L.settings, tab = SET_TABS.find(t => t.id === setTab);
  $('#setTabs').innerHTML = SET_TABS.map(t => `<div class="it ${t.id === setTab ? 'sel' : ''}" data-tab="${t.id}">${t.t}</div>`).join('');
  $('#setBody').innerHTML = tab.items.map(it => {
    switch (it.type) {
      case 'sec': return `<div class="sec">${it.label}</div>`;
      case 'select': return `<label class="srow"><span>${it.label}</span><select data-k="${it.k}">${it.opts.map(([v, l]) => `<option value="${v}" ${String(s[it.k]) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
      case 'check': return `<label class="srow"><span>${it.label}</span><input type="checkbox" data-k="${it.k}" ${s[it.k] ? 'checked' : ''}></label>`;
      case 'color': return `<label class="srow"><span>${it.label}</span><span><input type="color" data-k="${it.k}" value="${(s[it.k] || defColor(it.k)).slice(0, 7)}">${it.reset ? ` <button data-reset="${it.k}" title="기본값">↺</button>` : ''}</span></label>`;
      case 'pair': return `<div class="srow"><span>${it.chk ? `<input type="checkbox" data-k="${it.chk}" ${s[it.chk] ? 'checked' : ''}> ` : ''}${it.label}</span><span><input type="color" data-k="${it.k1}" value="${s[it.k1]}"> <input type="color" data-k="${it.k2}" value="${s[it.k2]}"></span></div>`;
      case 'buttons': return `<div class="srow btns">${it.items.map(([a, l]) => `<button data-act="${a}">${l}</button>`).join('')}</div>`;
      case 'custom': return it.render();
    }
    return '';
  }).join('');
  if (setTab === 'data') bindDataTab();
}
function setVal(k, v) { L.settings[k] = v; applySettings(); }
$('#setTabs').addEventListener('click', e => { const t = e.target.closest('[data-tab]'); if (t) { setTab = t.dataset.tab; renderSetModal(); } });
$('#setBody').addEventListener('change', e => {
  const t = e.target, k = t.dataset.k; if (!k) return;
  if (t.type === 'checkbox') setVal(k, t.checked);
  else if (t.tagName === 'SELECT') setVal(k, k === 'textSize' ? +t.value : t.value);
  if (k === 'theme') { L.settings.bg = ''; L.settings.gridColor = ''; L.settings.crossColor = ''; L.settings.textColor = ''; applySettings(); cells.forEach(c => c.applyIndicators()); renderSetModal(); }
});
$('#setBody').addEventListener('input', e => { const t = e.target, k = t.dataset.k; if (k && t.type === 'color') setVal(k, t.value); });
$('#setBody').addEventListener('click', e => {
  const r = e.target.closest('[data-reset]');
  if (r) { setVal(r.dataset.reset, ''); renderSetModal(); return; }
  const a = e.target.closest('[data-act]'); if (!a) return;
  const P = { default: ['#26a69a', '#ef5350'], kr: ['#f23645', '#2962ff'], mono: [L.settings.theme === 'light' ? '#ffffff' : '#d1d4dc', L.settings.theme === 'light' ? '#131722' : '#5d606b'] };
  const pr = a.dataset.act.split(':')[1];
  if (P[pr]) {
    const [u, d] = P[pr];
    Object.assign(L.settings, { bodyUp: u, bodyDown: d, borderUp: pr === 'mono' ? '#787b86' : u, borderDown: pr === 'mono' ? '#787b86' : d, wickUp: pr === 'mono' ? '#787b86' : u, wickDown: pr === 'mono' ? '#787b86' : d });
    applySettings(); renderSetModal();
  }
});
$('#setReset').onclick = () => {
  if (!confirm('차트 설정을 기본값으로 되돌릴까요? (작도·지표는 그대로)')) return;
  L.settings = clone(DEF_SETTINGS); applySettings(); cells.forEach(c => c.applyIndicators()); renderSetModal();
};
$('#setClose').onclick = () => $('#setModal').classList.remove('show');
$('#setModal').addEventListener('click', e => { if (e.target.id === 'setModal') $('#setModal').classList.remove('show'); });

function applySettings() {
  const s = L.settings;
  document.body.classList.toggle('light', s.theme === 'light');
  document.documentElement.style.setProperty('--up', s.bodyUp);
  document.documentElement.style.setProperty('--down', s.bodyDown);
  cells.forEach(c => c.applyStyles());
  updateTypeBtn();
  saveLayout();
}

// 차트 종류 빠른 선택 (상단)
const TYPE_ICON = {
  candle_solid: '<svg viewBox="0 0 24 24"><path d="M7 3v4M7 15v5M17 6v3M17 17v3"/><rect x="5" y="7" width="4" height="8" fill="currentColor"/><rect x="15" y="9" width="4" height="8"/></svg>',
  candle_stroke: '<svg viewBox="0 0 24 24"><path d="M7 3v4M7 15v5M17 6v3M17 17v3"/><rect x="5" y="7" width="4" height="8"/><rect x="15" y="9" width="4" height="8"/></svg>',
  candle_up_stroke: '<svg viewBox="0 0 24 24"><path d="M7 3v4M7 15v5M17 6v3M17 17v3"/><rect x="5" y="7" width="4" height="8"/><rect x="15" y="9" width="4" height="8" fill="currentColor"/></svg>',
  ohlc: '<svg viewBox="0 0 24 24"><path d="M8 4v16M5 8h3M8 16h3M16 6v14M13 9h3M16 17h3"/></svg>',
  area: '<svg viewBox="0 0 24 24"><path d="M3 17l5-6 4 3 6-8 3 3v11H3z" fill="currentColor" opacity=".35"/><path d="M3 17l5-6 4 3 6-8 3 3"/></svg>'
};
function renderTypeMenu() {
  const opts = SET_TABS[0].items[0].opts;
  $('#typeMenu').innerHTML = `<div class="t">차트 종류</div>` + opts.map(([v, l]) => `<div class="row ${L.settings.chartType === v ? 'cur' : ''}" data-type="${v}"><span class="fi">${TYPE_ICON[v]}</span><span style="flex:1">${l}</span></div>`).join('');
}
$('#typeMenu').addEventListener('click', e => { const r = e.target.closest('[data-type]'); if (!r) return; setVal('chartType', r.dataset.type); updateTypeBtn(); closeMenus(); });
function updateTypeBtn() { $('#btnType').innerHTML = TYPE_ICON[L.settings.chartType] || TYPE_ICON.candle_solid; }

// ───────── 앱 설치 · 백업 ─────────
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
function installGuide() {
  const ua = navigator.userAgent;
  if (isStandalone()) return '지금 앱으로 실행 중이에요.';
  if (location.protocol === 'file:') return '파일로 열었을 때는 설치할 수 없어요. 웹 주소(깃허브 페이지)로 열면 설치할 수 있어요.';
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return '사파리 아래쪽 <b>공유 버튼(□↑)</b> → <b>홈 화면에 추가</b>를 누르세요.';
  if (/Android/.test(ua)) return '크롬 오른쪽 위 <b>⋮ 메뉴</b> → <b>앱 설치</b> (또는 홈 화면에 추가)를 누르세요.';
  return '크롬/엣지 주소창 오른쪽의 <b>설치 아이콘(⊕)</b>을 누르거나, 아래 버튼을 누르세요.';
}
function dataTabHTML() {
  return `<div class="sec">앱으로 설치</div>
    <p class="note">${installGuide()}</p>
    <div class="srow btns"><button id="btnInstall" ${installEvt ? '' : 'disabled'}>📲 앱 설치</button></div>
    <div class="sec">백업 (기기끼리 옮기기)</div>
    <p class="note">레이아웃·작도·지표·관심종목은 기기마다 따로 저장돼요. 내보낸 파일을 다른 기기에서 가져오면 똑같이 옮겨져요.</p>
    <div class="srow btns"><button id="btnExport">⬇ 내보내기</button><button id="btnImport">⬆ 가져오기</button><input type="file" id="importFile" accept=".json,application/json" hidden></div>`;
}
const BACKUP_KEY = /^(layouts|curLayout|layout:|draw:|watchlist|toolStyle:|groupCur)/;
function bindDataTab() {
  $('#btnInstall').onclick = async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; renderSetModal(); };
  $('#btnExport').onclick = () => {
    saveLayout();
    const data = {};
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (BACKUP_KEY.test(k)) data[k] = localStorage.getItem(k); }
    const blob = new Blob([JSON.stringify({ app: 'my-chart', v: 4, at: new Date().toISOString(), data }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `chart-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
  $('#btnImport').onclick = () => $('#importFile').click();
  $('#importFile').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      if (!j || j.app !== 'my-chart' || !j.data) throw new Error();
      if (!confirm('이 기기의 레이아웃·작도를 백업 파일 내용으로 바꿀까요?')) return;
      const del = [];
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (BACKUP_KEY.test(k)) del.push(k); }
      del.forEach(k => localStorage.removeItem(k));
      Object.entries(j.data).forEach(([k, v]) => { if (BACKUP_KEY.test(k)) localStorage.setItem(k, v); });
      location.reload();
    } catch { toast('백업 파일이 아니에요'); }
  };
}

// ───────── 화면 분할 메뉴 ─────────
function renderGridMenu() {
  $('#gridMenu').innerHTML = `<div class="t">화면 분할</div>
    <div class="gridpick">${Object.keys(GRIDS).map(g => `<button data-g="${g}" class="${L.grid === g ? 'on' : ''}">${GRID_LABEL[g]}</button>`).join('')}</div>
    <div class="t">동기화 (분할 화면끼리)</div>
    <label>종목 같이 바꾸기 <input type="checkbox" data-sync="symbol" ${L.sync.symbol ? 'checked' : ''}></label>
    <label>타임프레임 같이 바꾸기 <input type="checkbox" data-sync="tf" ${L.sync.tf ? 'checked' : ''}></label>
    <label>십자선 같이 움직이기 <input type="checkbox" data-sync="crosshair" ${L.sync.crosshair ? 'checked' : ''}></label>
    <div class="t">차트를 클릭하면 그 칸이 선택돼요 (파란 테두리)</div>`;
}
$('#gridMenu').addEventListener('click', e => {
  const g = e.target.closest('[data-g]');
  if (g) { L.grid = g.dataset.g; saveLayout(); buildGrid(); renderGridMenu(); }
});
$('#gridMenu').addEventListener('change', e => {
  const k = e.target.dataset.sync; if (!k) return;
  L.sync[k] = e.target.checked; saveLayout();
});

// ───────── 레이아웃 메뉴 ─────────
function renderLayMenu() {
  $('#layMenu').innerHTML = `<div class="t">저장된 레이아웃</div>` +
    layouts.map(l => `<div class="row ${l.id === curLayout ? 'cur' : ''}" data-lid="${l.id}"><span>${l.id === curLayout ? '● ' : ''}${esc(l.name)}</span></div>`).join('') +
    `<div class="hr"></div>
     <div class="row" data-act="new">＋ 새 레이아웃</div>
     <div class="row" data-act="dup">⧉ 현재 레이아웃 복제 (작도 포함)</div>
     <div class="row" data-act="ren">✎ 이름 바꾸기</div>
     <div class="row" data-act="del" style="color:var(--down)">🗑 이 레이아웃 삭제</div>
     <div class="t">분할·종목·타임프레임·지표·색상·작도가 레이아웃마다 따로 자동 저장돼요</div>`;
}
function updateLayBtn() { $('#btnLayout').textContent = '▦ ' + layoutName(); }
function saveLayouts() { LS.set('layouts', layouts); LS.set('curLayout', curLayout); }
function loadLayout(id) {
  if (R.on) { replayPause(); R.on = false; R.id++; $('#replayBar').classList.remove('show'); $('#rpBadge').style.display = 'none'; $('#btnReplay').classList.remove('on'); }
  curLayout = id; saveLayouts();
  L = readLayout(id);
  updateLayBtn();
  document.body.classList.toggle('light', L.settings.theme === 'light');
  document.documentElement.style.setProperty('--up', L.settings.bodyUp);
  document.documentElement.style.setProperty('--down', L.settings.bodyDown);
  applyWl();
  buildGrid();
  applyMagnet();
  applyLockUI();
  updateTypeBtn();
}
function switchLayout(id) {
  if (id === curLayout) return;
  saveLayout();
  loadLayout(id);
  toast(`"${layoutName()}" 레이아웃`);
}
function copyDrawings(fromId, toId) {
  const pre = 'draw:' + fromId + ':', keys = [];
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith(pre)) keys.push(k); }
  keys.forEach(k => localStorage.setItem('draw:' + toId + ':' + k.slice(pre.length), localStorage.getItem(k)));
}
$('#layMenu').addEventListener('click', e => {
  const r = e.target.closest('[data-lid]');
  if (r) { closeMenus(); switchLayout(r.dataset.lid); return; }
  const a = e.target.closest('[data-act]'); if (!a) return;
  const act = a.dataset.act;
  closeMenus();
  if (act === 'new') {
    const name = prompt('새 레이아웃 이름', `레이아웃 ${layouts.length + 1}`); if (!name) return;
    const id = newId(), st = activeCell().st;
    LS.set('layout:' + id, { ...clone(DEF_LAYOUT), cells: [{ ...clone(DEF_CELL), market: st.market, symbol: st.symbol }], settings: clone(L.settings) });
    layouts.push({ id, name }); saveLayouts(); switchLayout(id);
  } else if (act === 'dup') {
    const name = prompt('복제할 레이아웃 이름', layoutName() + ' 복사본'); if (!name) return;
    saveLayout();
    const id = newId();
    LS.set('layout:' + id, clone(L));
    copyDrawings(curLayout, id);
    layouts.push({ id, name }); saveLayouts(); switchLayout(id);
  } else if (act === 'ren') {
    const name = prompt('레이아웃 이름', layoutName()); if (!name) return;
    layouts.find(l => l.id === curLayout).name = name; saveLayouts(); updateLayBtn();
  } else if (act === 'del') {
    if (layouts.length === 1) return toast('레이아웃이 하나뿐이라 삭제할 수 없어요');
    if (!confirm(`"${layoutName()}" 레이아웃을 삭제할까요? (작도도 함께 지워져요)`)) return;
    const old = curLayout;
    layouts = layouts.filter(l => l.id !== old);
    switchLayout(layouts[0].id);
    localStorage.removeItem('layout:' + old);
    const pre = 'draw:' + old + ':', keys = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith(pre)) keys.push(k); }
    keys.forEach(k => localStorage.removeItem(k));
    saveLayouts();
  }
});

// 메뉴 열고 닫기
function closeMenus() { document.querySelectorAll('.menu').forEach(m => m.classList.remove('show')); }
function toggleMenu(menu, btn, render) {
  const show = !menu.classList.contains('show');
  closeMenus();
  if (!show) return;
  render();
  const r = btn.getBoundingClientRect();
  menu.style.top = (r.bottom + 4) + 'px';
  menu.style.left = Math.max(4, Math.min(r.left, innerWidth - 250)) + 'px';
  menu.classList.add('show');
}
$('#btnSettings').onclick = e => { e.stopPropagation(); openSetModal(); };
$('#btnType').onclick = e => { e.stopPropagation(); toggleMenu($('#typeMenu'), e.currentTarget, renderTypeMenu); };
$('#btnLayout').onclick = e => { e.stopPropagation(); toggleMenu($('#layMenu'), e.currentTarget, renderLayMenu); };
$('#btnGrid').onclick = e => { e.stopPropagation(); toggleMenu($('#gridMenu'), e.currentTarget, renderGridMenu); };
document.querySelectorAll('.menu').forEach(m => m.addEventListener('click', e => e.stopPropagation()));
document.addEventListener('click', e => { if (!e.target.closest('.menu')) closeMenus(); });

// ───────── 관심종목 ─────────
const wlPrices = {};
let wlSockets = [];
function renderWatchlist() {
  const st = L && activeCell() ? activeCell().st : {};
  $('#wl').innerHTML = watchlist.map((w, i) => {
    const p = wlPrices[w.market + ':' + w.symbol];
    const cur = w.market === st.market && w.symbol === st.symbol;
    return `<div class="wl-row ${cur ? 'cur' : ''}" data-i="${i}">
      <span><span class="s">${w.symbol}</span><span class="m">${MARKETS[w.market].badge}</span></span>
      <span class="p">${p ? p.c : '-'}</span>
      <span class="c ${p ? (p.chg >= 0 ? 'upc' : 'downc') : ''}">${p ? (p.chg >= 0 ? '+' : '') + p.chg.toFixed(2) + '%' : ''}</span>
      <button class="x" data-del="${i}" title="삭제">×</button></div>`;
  }).join('') || `<div style="padding:14px;color:var(--muted)">종목 검색창에서 ☆를 눌러 추가해요</div>`;
}
function connectWatchlist() {
  wlSockets.forEach(s => s.close()); wlSockets = [];
  if (MOCK) return;
  for (const market of ['futures', 'spot']) {
    const syms = watchlist.filter(w => w.market === market).map(w => w.symbol.toLowerCase() + '@miniTicker');
    if (!syms.length) continue;
    wlSockets.push(openWS(`${MARKETS[market].ws}/stream?streams=${syms.join('/')}`, m => {
      const d = m.data; if (!d) return;
      wlPrices[market + ':' + d.s] = { c: trimNum(d.c), chg: (d.c - d.o) / d.o * 100 };
      scheduleWlRender();
    }));
  }
}
function toggleWatch(market, symbol) {
  const i = watchlist.findIndex(w => w.market === market && w.symbol === symbol);
  if (i >= 0) watchlist.splice(i, 1); else watchlist.push({ market, symbol });
  LS.set('watchlist', watchlist); renderWatchlist(); connectWatchlist();
}
let wlRaf = 0;
function scheduleWlRender() { if (!wlRaf) wlRaf = requestAnimationFrame(() => { wlRaf = 0; renderWatchlist(); }); }
$('#wl').addEventListener('click', e => {
  const del = e.target.closest('[data-del]');
  if (del) { e.stopPropagation(); watchlist.splice(+del.dataset.del, 1); LS.set('watchlist', watchlist); renderWatchlist(); connectWatchlist(); return; }
  const r = e.target.closest('[data-i]'); if (!r) return;
  const w = watchlist[+r.dataset.i];
  changeSymbol(w.market, w.symbol);
});
$('#wlAdd').onclick = () => {
  const st = activeCell().st;
  if (watchlist.some(w => w.market === st.market && w.symbol === st.symbol)) return toast('이미 있어요');
  toggleWatch(st.market, st.symbol);
};
$('#btnWl').onclick = () => { L.wlOpen = !L.wlOpen; saveLayout(); applyWl(); };
function applyWl() { $('#right').classList.toggle('hide', !L.wlOpen); $('#btnWl').classList.toggle('on', L.wlOpen); setTimeout(() => cells.forEach(c => c.chart.resize()), 0); }

// ───────── 시작 ─────────
let rsTimer;
window.addEventListener('resize', () => { clearTimeout(rsTimer); rsTimer = setTimeout(() => cells.forEach(c => c.chart.resize()), 50); });
let fitTimer;
new ResizeObserver(() => { cells.forEach(c => c.chart.resize()); clearTimeout(fitTimer); fitTimer = setTimeout(() => cells.forEach(c => c.fitPanes()), 150); }).observe($('#grid'));
connectWatchlist();
renderLeft();
loadLayout(curLayout);
if (innerWidth < 700 && !LS.get('seen', false)) { L.wlOpen = false; applyWl(); }
LS.set('seen', true);
if (MOCK) toast('테스트 모드 (가짜 데이터)');
window.__cells = () => cells; window.__L = () => L;
Object.defineProperty(window, '__chart', { get: () => activeCell().chart });
})();
