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
  spot:    { rest: 'https://api.binance.com/api/v3',  ws: 'wss://stream.binance.com:9443', badge: '현물' },
  upbit:   { rest: 'https://api.upbit.com/v1',        ws: 'wss://api.upbit.com/websocket/v1', badge: '업비트' }
};
const TFS = {
  '1m':[{type:'minute',span:1},6e4], '3m':[{type:'minute',span:3},18e4], '5m':[{type:'minute',span:5},3e5],
  '15m':[{type:'minute',span:15},9e5], '30m':[{type:'minute',span:30},18e5], '1h':[{type:'hour',span:1},36e5],
  '2h':[{type:'hour',span:2},72e5], '4h':[{type:'hour',span:4},144e5], '6h':[{type:'hour',span:6},216e5],
  '12h':[{type:'hour',span:12},432e5], '1d':[{type:'day',span:1},864e5], '1w':[{type:'week',span:1},6048e5],
  '1M':[{type:'month',span:1},2592e6]
};
const TF_SHOW = Object.keys(TFS);
const MAIN_INDS = ['MA','EMA','SMA','BOLL','SAR','BBI','NWE','WICK','CM'];
const SUB_INDS = ['VOL','RSI','STOCH','MACD','KDJ','CCI','OBV','DMI','WR','ROC','MTM','TRIX','BIAS'];
const IND_NAMES = { MA:'이동평균', EMA:'지수이동평균', SMA:'평활이동평균', BOLL:'볼린저밴드', SAR:'파라볼릭 SAR', BBI:'BBI', NWE:'나다라야-왓슨 엔벨로프', WICK:'꼬리받기 백테스트 (RSI·CCI 지정가)', CM:'캔들매매법 (기준선·깊이·구간·캔들군 신호)', VOL:'거래량', RSI:'RSI', STOCH:'스토캐스틱 (슬로우)', MACD:'MACD', KDJ:'KDJ', CCI:'CCI', OBV:'OBV', DMI:'DMI', WR:'윌리엄스 %R', ROC:'ROC', MTM:'모멘텀', TRIX:'TRIX', BIAS:'이격도' };
const VAR_PARAMS = ['MA','EMA','SMA','RSI','WR','BIAS'];
const PARAM_NAMES = { CM: ['적깊 비율 (파동 높이 대비)', '손익비', '최대 보유 봉 수', '최대 손절 %', '방향 (1=양쪽, 2=매수, 3=매도)', '위치 필터 (1=켬, 0=끔)', '무효 신호 표시 (1=켬, 0=끔)'], WICK: ['RSI 기준(롱≤, 숏≥100-값)', 'CCI 기준(±)', '지정가 간격 %', '대기 봉 수', '손절 ATR 배수', '손익비', '최대 보유 봉 수', '24h 거래대금 하한(백만)', '방향 (1=양쪽, 2=롱, 3=숏)'], NWE: ['대역폭', '배수', '리페인트 (1=켬, 0=끔)'], STOCH: ['%K 기간', '%K 스무딩', '%D 기간'], BOLL: ['기간', '표준편차'], MACD: ['단기', '장기', '시그널'], KDJ: ['기간', 'K', 'D'] };
// 오실레이터 기준선 기본값 (상단·중단·하단)
// 지표별 기본 선 색 (트뷰 원본과 같게)
const IND_LINE_DEF = { NWE: [{ color: '#089981', size: 1 }, { color: '#F23645', size: 1 }] };
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
  statusOHLC: 'tv', statusInd: 'auto',
  axisPos: 'right', scale: 'normal', invert: false, countdown: true,
  bg: '', gridV: true, gridH: true, gridColor: '', crossColor: '', textSize: 12, textColor: ''
};
function migrateSettings(s) {
  s = Object.assign({}, s || {});
  if (s.up && !s.bodyUp) { s.bodyUp = s.borderUp = s.wickUp = s.up; }
  if (s.down && !s.bodyDown) { s.bodyDown = s.borderDown = s.wickDown = s.down; }
  if (s.grid === false && s.gridV == null) { s.gridV = s.gridH = false; }
  if (!s.statusOHLC || ['auto', 'float', 'follow_cross'].includes(s.statusOHLC)) s.statusOHLC = 'tv';
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
const fmtKrw = v => v >= 1e12 ? (v / 1e12).toFixed(1) + '조' : v >= 1e8 ? Math.round(v / 1e8).toLocaleString() + '억' : Math.round(v / 1e4).toLocaleString() + '만';
const fmtBig = v => v >= 1e9 ? (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(0) + 'K' : Math.round(v) + '';
const tfOfPeriod = p => Object.keys(TFS).find(k => TFS[k][0].type === p.type && TFS[k][0].span === p.span);
const hexA = (hex, a) => { const h = hex.replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ───────── 데이터 (Binance REST / WS) ─────────
const toBar = k => ({ timestamp: k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5], turnover: +k[7] });
async function fetchKlines(market, symbol, tf, { startTime, endTime, limit = LIMIT } = {}) {
  if (MOCK) return mockKlines(symbol, tf, { startTime, endTime, limit: market === 'upbit' ? Math.min(limit, batchSize(market, tf)) : limit });
  if (market === 'upbit') return upbitKlines(symbol, tf, { startTime, endTime });
  const q = new URLSearchParams({ symbol, interval: tf, limit });
  if (startTime != null) q.set('startTime', startTime);
  if (endTime != null) q.set('endTime', endTime);
  const r = await fetch(`${MARKETS[market].rest}/klines?${q}`);
  if (!r.ok) throw new Error(r.status === 400 ? '종목 이름을 확인해 주세요' : `HTTP ${r.status}`);
  return (await r.json()).map(toBar);
}
// 한 번에 받는 봉 개수 (이보다 적게 오면 더 이전/이후 데이터가 없다는 뜻)
function batchSize(market, tf) { return market === 'upbit' ? Math.floor(200 / (UPBIT_TF[tf] ? UPBIT_TF[tf][1] : 1)) - 1 : LIMIT; }

// ───────── 업비트 ─────────
// 브라우저에서 부르는 업비트 REST는 약 10초에 1번으로 제한돼서, 과거 캔들만 REST로 아껴 받고
// 실시간 가격·캔들·목록은 전부 웹소켓으로 받음
const UPBIT_TF = { // 우리 타임프레임 → [업비트 캔들 종류, 몇 개를 합칠지]
  '1m': ['minutes/1', 1], '3m': ['minutes/3', 1], '5m': ['minutes/5', 1], '15m': ['minutes/15', 1], '30m': ['minutes/30', 1],
  '1h': ['minutes/60', 1], '2h': ['minutes/60', 2], '4h': ['minutes/240', 1], '6h': ['minutes/60', 6], '12h': ['minutes/240', 3],
  '1d': ['days', 1], '1w': ['weeks', 1], '1M': ['months', 1]
};
const UPBIT_WS_CANDLE = { '1m': 'candle.1m', '3m': 'candle.3m', '5m': 'candle.5m', '15m': 'candle.15m', '30m': 'candle.30m', '1h': 'candle.60m', '4h': 'candle.240m' };
const upbitQ = { chain: Promise.resolve(), last: 0, waitedToast: 0 };
function upbitGet(path) {
  const run = async () => {
    for (let i = 0; i < 14; i++) {
      const wait = upbitQ.last + 300 - Date.now(); if (wait > 0) await new Promise(r => setTimeout(r, wait));
      upbitQ.last = Date.now();
      const r = await fetch(`${MARKETS.upbit.rest}${path}`);
      if (r.status === 429) {
        if (Date.now() - upbitQ.waitedToast > 8000) { upbitQ.waitedToast = Date.now(); toast('업비트 요청 제한으로 잠깐 기다리는 중…', 3000); }
        await new Promise(r => setTimeout(r, 2000)); continue;
      }
      if (!r.ok) throw new Error(r.status === 404 ? '업비트 종목 이름을 확인해 주세요 (예: KRW-BTC)' : `HTTP ${r.status}`);
      return r.json();
    }
    throw new Error('업비트 요청이 너무 많아요. 잠시 후 다시 시도해 주세요');
  };
  const p = upbitQ.chain.then(run, run);
  upbitQ.chain = p.catch(() => {});
  return p;
}
const isoSec = ts => new Date(ts).toISOString().slice(0, 19) + 'Z';
const upbitBar = x => ({ timestamp: Date.parse(x.candle_date_time_utc + 'Z'), open: +x.opening_price, high: +x.high_price, low: +x.low_price, close: +x.trade_price, volume: +x.candle_acc_trade_volume, turnover: +x.candle_acc_trade_price });
function barStart(ts, tf) {
  if (tf === '1M') { const d = new Date(ts); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); }
  if (tf === '1w') return Math.floor((ts - 4 * 864e5) / 6048e5) * 6048e5 + 4 * 864e5; // 월요일 00:00 UTC
  const ms = TFS[tf][1]; return Math.floor(ts / ms) * ms;
}
function aggregate(bars, tf) {
  const out = [];
  for (const b of bars) {
    const t = barStart(b.timestamp, tf), last = out[out.length - 1];
    if (last && last.timestamp === t) { last.high = Math.max(last.high, b.high); last.low = Math.min(last.low, b.low); last.close = b.close; last.volume += b.volume; last.turnover += b.turnover; }
    else out.push({ ...b, timestamp: t });
  }
  return out;
}
async function upbitKlines(code, tf, { startTime, endTime }) {
  const [path, n] = UPBIT_TF[tf], baseMs = n > 1 ? TFS[tf][1] / n : TFS[tf][1];
  let to;
  if (startTime != null) to = Math.min(Date.now(), startTime + 200 * baseMs);      // 리플레이: 시작점 이후 200개
  else if (endTime != null) to = endTime + 1000;                                     // 과거로 스크롤
  const q = `/candles/${path}?market=${encodeURIComponent(code)}&count=200${to ? '&to=' + isoSec(to) : ''}`;
  let bars = (await upbitGet(q)).map(upbitBar).reverse();
  if (n > 1) bars = aggregate(bars, tf);
  if (startTime != null) bars = bars.filter(b => b.timestamp >= startTime);
  if (endTime != null) bars = bars.filter(b => b.timestamp <= endTime);
  return bars;
}
// 웹소켓으로 현재가 한 번 받기 (REST 제한 피하기)
function upbitSnapshot(codes) {
  return new Promise(resolve => {
    const out = {}; let ws;
    const done = () => { try { ws.close(); } catch {} resolve(out); };
    const timer = setTimeout(done, 2500);
    try { ws = new WebSocket(MARKETS.upbit.ws); } catch { clearTimeout(timer); return resolve(out); }
    ws.onopen = () => ws.send(JSON.stringify([{ ticket: 'snap' + Date.now() }, { type: 'ticker', codes, isOnlySnapshot: true }]));
    ws.onmessage = async e => {
      try { const d = JSON.parse(typeof e.data === 'string' ? e.data : await e.data.text()); out[d.code] = d; if (Object.keys(out).length >= codes.length) { clearTimeout(timer); done(); } } catch {}
    };
    ws.onerror = () => { clearTimeout(timer); done(); };
  });
}
function upbitPrecision(code, price) {
  if (code.startsWith('BTC-')) return 8;
  if (code.startsWith('USDT-')) return price >= 100 ? 2 : price >= 1 ? 3 : 6;
  return price >= 1000 ? 0 : price >= 100 ? 1 : price >= 10 ? 2 : price >= 1 ? 3 : price >= 0.1 ? 4 : 5;
}
async function upbitMarkets() {
  const c = LS.get('upbit:markets', null);
  if (c && Date.now() - c.t < 864e5) return c.list;
  const list = (await upbitGet('/market/all?isDetails=false')).map(m => ({ s: m.market, n: m.korean_name }));
  LS.set('upbit:markets', { t: Date.now(), list });
  return list;
}
const infoCache = {};
async function symbolInfo(market, symbol) {
  const key = market + ':' + symbol;
  if (infoCache[key]) return infoCache[key];
  if (market === 'upbit') {
    let pp = 0;
    if (!MOCK) { const s = (await upbitSnapshot([symbol]))[symbol]; if (s) pp = upbitPrecision(symbol, +s.trade_price); }
    else pp = 2;
    return (infoCache[key] = { pp, vp: 4 });
  }
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
    list = (market === 'upbit' ? ['KRW-BTC','KRW-ETH','KRW-XRP','KRW-SOL','KRW-DOGE'] : ['BTCUSDT','ETHUSDT','SOLUSDT','XRPUSDT','BNBUSDT','DOGEUSDT','ADAUSDT','AVAXUSDT','LINKUSDT','SUIUSDT','TRXUSDT','DOTUSDT','LTCUSDT','PEPEUSDT','WIFUSDT'])
      .map((s, i) => ({ s, n: market === 'upbit' ? ['비트코인','이더리움','리플','솔라나','도지코인'][i] : '', p: trimNum((60000 / (i + 1)).toFixed(3)), chg: Math.sin(i * 3) * 6, qv: 1e10 / (i + 1) }));
  } else if (market === 'upbit') {
    const mk = (await upbitMarkets()).filter(m => m.s.startsWith('KRW-'));
    const snap = await upbitSnapshot(mk.map(m => m.s));
    list = mk.filter(m => snap[m.s]).map(m => { const x = snap[m.s]; return { s: m.s, n: m.n, p: trimNum(x.trade_price), chg: x.signed_change_rate * 100, qv: +x.acc_trade_price_24h }; });
  } else {
    const arr = await (await fetch(`${MARKETS[market].rest}/ticker/24hr`)).json();
    list = arr.filter(x => !x.symbol.includes('_') && +x.quoteVolume > 0)
      .map(x => ({ s: x.symbol, p: trimNum(x.lastPrice), chg: +x.priceChangePercent, qv: +x.quoteVolume }));
  }
  list.sort((a, b) => b.qv - a.qv);
  tickerCache[market] = { t: Date.now(), list };
  return list;
}
function openWS(url, onMsg, onReopen, sub) {
  const h = { ws: null, closed: false, timer: null, dropped: false };
  const connect = () => {
    if (h.closed) return;
    h.ws = new WebSocket(url);
    h.ws.onopen = () => { if (sub) h.ws.send(JSON.stringify(sub)); if (h.dropped && onReopen) onReopen(); h.dropped = false; };
    h.ws.onmessage = async e => { try { const d = typeof e.data === 'string' ? e.data : await e.data.text(); onMsg(JSON.parse(d)); } catch {} };
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
// 나다라야-왓슨 엔벨로프 (LuxAlgo 방식: 가우시안 커널 회귀 ± 평균절대오차 × 배수)
registerIndicator({
  name: 'NWE', shortName: 'Nadaraya-Watson Envelope', calcParams: [8, 3, 1], series: 'price', precision: 2,
  figures: [{ key: 'upper', title: 'Upper: ', type: 'line' }, { key: 'lower', title: 'Lower: ', type: 'line' }],
  calc: (list, ind) => {
    const h = Math.max(0.01, +ind.calcParams[0] || 8), mult = +ind.calcParams[1] || 3, repaint = (ind.calcParams[2] ?? 1) >= 1;
    const n = list.length, W = 500, out = list.map(() => ({}));
    const g = x => Math.exp(-(x * x) / (h * h * 2));
    const src = list.map(k => k.close);
    if (repaint) {
      // 최근 500봉 전체를 앞뒤 봉까지 써서 매끄럽게 (새 봉이 오면 과거 값도 바뀜 = 트뷰 기본값과 동일)
      const start = Math.max(0, n - W), m = n - start; if (m < 2) return out;
      const y = new Array(m); let sae = 0;
      for (let i = 0; i < m; i++) {
        let sum = 0, sw = 0;
        for (let j = 0; j < m; j++) { const w = g(i - j); sum += src[start + j] * w; sw += w; }
        y[i] = sum / sw; sae += Math.abs(src[start + i] - y[i]);
      }
      sae = sae / Math.min(W - 1, m - 1) * mult;
      for (let i = 0; i < m; i++) {
        const k = start + i, up = y[i] + sae, dn = y[i] - sae;
        out[k] = { upper: up, lower: dn };
        if (i > 0) {
          if (src[k] > up && src[k - 1] < up) out[k].sig = -1;       // 위 밴드 돌파 → ▼
          else if (src[k] < dn && src[k - 1] > dn) out[k].sig = 1;   // 아래 밴드 이탈 → ▲
          out[k].at = src[k];
        }
      }
    } else {
      // 리페인트 없음: 각 봉에서 과거 500봉만으로 계산한 끝점 값
      const coef = []; let den = 0;
      for (let i = 0; i < W; i++) { coef.push(g(i)); den += g(i); }
      const est = new Array(n).fill(null), err = new Array(n).fill(null);
      for (let k = 0; k < n; k++) {
        let sum = 0, sw = 0;
        for (let i = 0; i < W && k - i >= 0; i++) { sum += src[k - i] * coef[i]; sw += coef[i]; }
        est[k] = sum / sw; err[k] = Math.abs(src[k] - est[k]);
      }
      let acc = 0; const P = W - 1;
      for (let k = 0; k < n; k++) {
        acc += err[k]; if (k >= P) acc -= err[k - P];
        if (k < 10) continue; // 데이터가 500봉보다 적으면 있는 만큼으로 계산
        const mae = acc / Math.min(P, k + 1) * mult, up = est[k] + mae, dn = est[k] - mae;
        out[k] = { upper: up, lower: dn };
        const pk = out[k - 1];
        if (pk && pk.upper != null) {
          if (src[k] > up && src[k - 1] <= pk.upper) { out[k].sig = -1; out[k].at = list[k].high; }
          else if (src[k] < dn && src[k - 1] >= pk.lower) { out[k].sig = 1; out[k].at = list[k].low; }
        }
      }
    }
    return out;
  }
});

// 꼬리받기 백테스트: RSI·CCI 과매도(과매수) 신호 → 신호 봉 저가(고가) ± n% 지정가 → ATR 손절, 손익비 익절, 시간 청산
// 체결은 지정가보다 0.2% 더 뚫고 지나가야 인정, 체결 봉에서 손절가까지 닿았으면 손실로 처리 (보수적)
const WICK_THRU = 0.002, WICK_COST = 0.0008;
function wickCalc(list, p) {
  const [rsiTh, cciTh, offPct, nwin, atrK, rr, H, liqM, dir] = p;
  const n = list.length, o = list.map(k => k.open), h = list.map(k => k.high), l = list.map(k => k.low), c = list.map(k => k.close);
  // RSI(14) 와일더
  const rsi = new Array(n).fill(null); { let up = 0, dn = 0; const a = 1 / 14;
    for (let i = 0; i < n; i++) { const d = i ? c[i] - c[i - 1] : 0; up = a * Math.max(d, 0) + (1 - a) * up; dn = a * Math.max(-d, 0) + (1 - a) * dn; if (i >= 50) rsi[i] = dn === 0 ? 100 : 100 - 100 / (1 + up / dn); } }
  // CCI(20)
  const cci = new Array(n).fill(null), tp = list.map(k => (k.high + k.low + k.close) / 3);
  for (let i = 19; i < n; i++) { let m = 0; for (let j = i - 19; j <= i; j++) m += tp[j]; m /= 20; let md = 0; for (let j = i - 19; j <= i; j++) md += Math.abs(tp[j] - m); md /= 20; cci[i] = md ? (tp[i] - m) / (0.015 * md) : 0; }
  // ATR(14) 단순평균
  const atr = new Array(n).fill(null); { let s = 0; const tr = i => { const pc = i ? c[i - 1] : c[0]; return Math.max(h[i] - l[i], Math.abs(h[i] - pc), Math.abs(l[i] - pc)); };
    for (let i = 0; i < n; i++) { s += tr(i); if (i >= 14) s -= tr(i - 14); if (i >= 13) atr[i] = s / 14; } }
  // 최근 24시간 거래대금
  const liq = new Array(n).fill(0); { let s = 0, a = 0;
    for (let i = 0; i < n; i++) { s += list[i].turnover || 0; while (list[a].timestamp <= list[i].timestamp - 864e5) { s -= list[a].turnover || 0; a++; } liq[i] = s; } }
  const liqOk = i => !(liqM > 0) || (list[i].timestamp - list[0].timestamp >= 864e5 - 1 && liq[i] >= liqM * 1e6);
  const trades = [];
  const run = side => {
    const sig = i => rsi[i] != null && cci[i] != null && atr[i] != null && liqOk(i) &&
      (side > 0 ? rsi[i] <= rsiTh && cci[i] <= -cciTh : rsi[i] >= 100 - rsiTh && cci[i] >= cciTh);
    // 매 봉: ① 봉이 진행되는 동안 대기 중인 지정가 체결 확인 → ② 봉 마감 후 새 신호면 지정가를 (다시) 건다
    let i = 0, pend = -1;
    while (i < n) {
      if (pend >= 0 && i > pend) {
        const T = trades[trades.length - 1], s = pend;
        if (i - pend > nwin) pend = -1;
        else if (side > 0 ? l[i] * (1 + WICK_THRU) < T.lim : h[i] * (1 - WICK_THRU) > T.lim) {
          pend = -1;
          const e = side > 0 ? Math.min(T.lim, o[i]) : Math.max(T.lim, o[i]);
          const sd = atrK * atr[s];
          if (!(sd > 0) || sd / e > 0.1) { T.skip = true; T.exp = i; }
          else {
            const stop = e - side * sd, tgt = e + side * rr * sd;
            Object.assign(T, { ent: i, e, sl: stop, tp: tgt, exp: i });
            let j = i, R = null, res = null, xp = null;
            if (side > 0 ? l[i] <= stop : h[i] >= stop) { R = -1; res = 'sl'; xp = stop; }
            else {
              for (j = i + 1; j <= Math.min(n - 1, i + H); j++) {
                if (side > 0 ? l[j] <= stop : h[j] >= stop) { R = -1; res = 'sl'; xp = stop; break; }
                if (side > 0 ? h[j] >= tgt : l[j] <= tgt) { R = rr; res = 'tp'; xp = tgt; break; }
              }
              if (res == null) {
                if (i + H <= n - 1) { j = i + H; xp = c[j]; R = side * (xp - e) / sd; res = 'time'; }
                else { j = n - 1; xp = c[j]; R = side * (xp - e) / sd; res = 'open'; }
              }
            }
            Object.assign(T, { x: j, xp, res, R: R - WICK_COST * e / sd });
            i = j + 1; continue;
          }
        }
      }
      if (sig(i)) {
        if (pend >= 0) trades[trades.length - 1].exp = i; // 아직 미체결인 이전 주문은 여기서 새 주문으로 교체
        pend = i;
        trades.push({ side, s: i, lim: side > 0 ? l[i] * (1 - offPct / 100) : h[i] * (1 + offPct / 100), exp: Math.min(n - 1, i + nwin), ent: -1 });
      }
      i++;
    }
  };
  if (dir !== 3) run(1);
  if (dir !== 2) run(-1);
  return trades;
}
registerIndicator({
  name: 'WICK', shortName: '꼬리받기', calcParams: [25, 150, 0.8, 3, 1.5, 1.5, 24, 5, 1], series: 'price', precision: 2, figures: [],
  calc: (list, ind) => {
    const p = ind.calcParams.map(Number);
    const trades = wickCalc(list, [p[0], p[1], p[2], Math.max(1, Math.round(p[3])), p[4], p[5], Math.max(1, Math.round(p[6])), p[7], Math.round(p[8] || 1)]);
    const out = list.map(() => ({}));
    trades.forEach(t => { (out[t.s].tr = out[t.s].tr || []).push(t); });
    if (out.length) out[out.length - 1].all = trades;
    return out;
  }
});

// 캔들매매법: 계산은 candlemaster.js (window.CM). 『캔들(군) 신호』·『파동연상』 규칙을 코드로 옮긴 것
registerIndicator({
  name: 'CM', shortName: '캔들매매법', calcParams: [0.10, 2, 48, 3, 1, 1, 1], series: 'price', precision: 2, figures: [],
  calc: (list, ind) => {
    const out = list.map(() => ({}));
    if (!window.CM || list.length < 60) return out;
    const p = ind.calcParams.map(Number);
    const r = CM.analyze(list, { jk: p[0] > 0 ? p[0] : 0.1, rr: p[1] > 0 ? p[1] : 2, maxHold: Math.max(1, Math.round(p[2] || 48)), maxStopPct: p[3] > 0 ? p[3] : 3, dir: Math.round(p[4] || 1), noFilter: Math.round(p[5]) === 0 });
    r.levels = CM.levelsForDisplay(r, list);
    r.showBad = Math.round(p[6]) !== 0;
    out[out.length - 1].cm = r;
    return out;
  }
});

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
    this.crossOn = false; this.open24 = null;
    // 트뷰처럼: 평소엔 현재가·24시간 등락, 십자선을 움직일 땐 그 봉의 시고저종
    const crossOff = () => { if (!this.crossOn) return; cells.forEach(c => { c.crossOn = false; c.chart.executeAction('onCrosshairChange', null); }); };
    this.el.addEventListener('mouseleave', crossOff);
    this.el.addEventListener('touchend', crossOff, { passive: true });
    this.el.addEventListener('touchcancel', crossOff, { passive: true });
    this.chart.subscribeAction('onCrosshairChange', c => { this.crosshair = c; if (c && c.x != null) this.crossOn = true; this.syncCrosshair(c); });
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
          callback(data, { forward: data.length >= batchSize(symbol.market, tf), backward: false });
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
        if (symbol.market === 'upbit') {
          const code = symbol.ticker, ctype = UPBIT_WS_CANDLE[tf];
          let cur = self.lastBar ? { ...self.lastBar } : null;
          self.ws = openWS(MARKETS.upbit.ws, m => {
            if (m.code !== code) return;
            if (ctype && m.type === ctype) { const b = upbitBar(m); cur = b; push({ ...b }); return; }
            if (m.type !== 'trade') return;
            const p = +m.trade_price, t = barStart(m.trade_timestamp, tf);
            if (!cur || t > cur.timestamp) cur = { timestamp: t, open: p, high: p, low: p, close: p, volume: 0, turnover: 0 };
            else if (t < cur.timestamp) return;
            cur.high = Math.max(cur.high, p); cur.low = Math.min(cur.low, p); cur.close = p; cur.volume += +m.trade_volume; cur.turnover += p * m.trade_volume;
            push({ ...cur });
          }, null, [{ ticket: 'chart' + Date.now() }, ctype ? { type: ctype, codes: [code] } : { type: 'trade', codes: [code], isOnlyRealtime: true }]);
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
            callback(past, { forward: past.length >= batchSize(symbol.market, tf), backward: false });
            self.afterInit(past);
            self.refill();
          } else if (type === 'forward') {
            const data = await fetchKlines(symbol.market, symbol.ticker, tf, { endTime: timestamp - 1 });
            if (tok !== self.token()) return;
            callback(data, { forward: data.length >= batchSize(symbol.market, tf), backward: false });
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
    this.open24 = null;
    if (st.main.includes('NWE')) this.refreshIndicator('NWE'); // 가격 소수점 자릿수 맞추기
    this.chart.setStyles({ candle: { tooltip: { title: { template: this.titleTpl() } } } });
    this.chart.setSymbol({ ticker: st.symbol, market: st.market, pricePrecision: info.pp, volumePrecision: info.vp });
    this.fetch24();
  }
  setSymbol(market, symbol) { this.st.market = market; this.st.symbol = symbol; this.applySymbol(); this.label(); }
  setTf(tf) { this.st.tf = tf; this.chart.setPeriod(TFS[tf][0]); this.label(); }
  label() { this.lb.textContent = `${this.st.symbol} · ${this.st.tf}${this.st.market === 'spot' ? ' · 현물' : this.st.market === 'upbit' ? ' · 업비트' : ''}`; }

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
      if (data.length < batchSize(st.market, st.tf) || full.length < data.length) rp.done = true;
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
    const ls = st.indStyles[n] || [], def = IND_LINE_DEF[n] || [];
    if (ls.length || def.length) {
      const base = this.chart.getStyles().indicator.lines;
      const len = Math.max(ls.length, def.length);
      o.styles = { lines: Array.from({ length: Math.max(len, def.length) }, (_, i) => ({ ...(base[i % base.length]), ...(def[i] || {}), ...(ls[i] || {}) })) };
    }
    if (n === 'NWE') {
      o.precision = this.pp;
      const self = this;
      // 밴드 돌파 지점에 ▼(위, 빨강) / ▲(아래, 초록) 표시
      o.draw = ({ ctx, indicator, xAxis, yAxis }) => {
        const res = indicator.result || [], vr = self.chart.getVisibleRange();
        const lines = (indicator.styles && indicator.styles.lines) || [];
        const upC = (lines[0] && lines[0].color) || '#089981', dnC = (lines[1] && lines[1].color) || '#F23645';
        ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
        for (let i = Math.max(0, vr.from - 1); i < Math.min(res.length, vr.to + 1); i++) {
          const r = res[i]; if (!r || !r.sig) continue;
          const x = xAxis.convertToPixel(i), y = yAxis.convertToPixel(r.at);
          if (r.sig < 0) { ctx.fillStyle = dnC; ctx.textBaseline = 'bottom'; ctx.fillText('▼', x, y - 4); }
          else { ctx.fillStyle = upC; ctx.textBaseline = 'top'; ctx.fillText('▲', x, y + 4); }
        }
        return false;
      };
    }
    if (n === 'WICK') {
      o.precision = this.pp;
      const self = this;
      o.draw = ({ ctx, indicator, xAxis, yAxis, bounding }) => {
        const res = indicator.result || [], vr = self.chart.getVisibleRange();
        const all = (res.length && res[res.length - 1].all) || [], data = self.chart.getDataList();
        const X = i => xAxis.convertToPixel(i), Y = v => yAxis.convertToPixel(v);
        const G = '#089981', Rd = '#F23645', B = '#2962FF', Gy = '#787b86';
        const fmtR = r => (r >= 0 ? '+' : '') + r.toFixed(2) + 'R';
        ctx.save();
        ctx.font = '11px sans-serif';
        for (const t of all) {
          const last = t.ent >= 0 ? t.x : t.exp;
          if (last < vr.from - 1 || t.s > vr.to + 1) continue;
          const xs = X(t.s), ys = t.side > 0 ? Y(data[t.s].low) + 10 : Y(data[t.s].high) - 10;
          // 신호 표시
          ctx.fillStyle = t.side > 0 ? G : Rd; ctx.textAlign = 'center'; ctx.textBaseline = t.side > 0 ? 'top' : 'bottom';
          ctx.fillText(t.side > 0 ? '△' : '▽', xs, t.side > 0 ? ys - 6 : ys + 6);
          // 지정가 대기선 (점선)
          const xEnd = X(t.ent >= 0 ? t.ent : t.exp), yl = Y(t.lim);
          ctx.strokeStyle = B; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
          ctx.beginPath(); ctx.moveTo(xs, yl); ctx.lineTo(xEnd, yl); ctx.stroke(); ctx.setLineDash([]);
          if (t.ent < 0) { ctx.fillStyle = Gy; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(t.skip ? '건너뜀' : '미체결', xEnd + 4, yl); continue; }
          // 포지션 박스 (익절 구간 초록, 손절 구간 빨강)
          const x0 = X(t.ent), x1 = Math.max(X(t.x), x0 + 4), ye = Y(t.e), yt = Y(t.tp), yS = Y(t.sl);
          ctx.fillStyle = 'rgba(8,153,129,0.13)'; ctx.fillRect(x0, Math.min(ye, yt), x1 - x0, Math.abs(yt - ye));
          ctx.fillStyle = 'rgba(242,54,69,0.13)'; ctx.fillRect(x0, Math.min(ye, yS), x1 - x0, Math.abs(yS - ye));
          ctx.lineWidth = 1;
          [[yt, G], [yS, Rd], [ye, Gy]].forEach(([yy, col]) => { ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x1, yy); ctx.stroke(); });
          // 진입점
          ctx.fillStyle = B; ctx.beginPath(); ctx.arc(x0, ye, 3.5, 0, Math.PI * 2); ctx.fill();
          // 청산점 + 결과
          const col = t.res === 'tp' ? G : t.res === 'sl' ? Rd : Gy, yx = Y(t.xp);
          ctx.strokeStyle = col; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(x1 - 4, yx - 4); ctx.lineTo(x1 + 4, yx + 4); ctx.moveTo(x1 + 4, yx - 4); ctx.lineTo(x1 - 4, yx + 4); ctx.stroke();
          const lab = { tp: '익절 ', sl: '손절 ', time: '시간청산 ', open: '진행 중 ' }[t.res] + fmtR(t.R);
          ctx.fillStyle = col; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = 'bold 11px sans-serif';
          ctx.fillText(lab, x1 + 7, yx); ctx.font = '11px sans-serif';
        }
        // 요약 (불러온 데이터 전체 기준)
        const done = all.filter(t => t.ent >= 0 && t.res !== 'open');
        if (done.length || all.length) {
          const win = done.filter(t => t.R > 0).length, sum = done.reduce((a, t) => a + t.R, 0);
          const nl = done.filter(t => t.side > 0).length;
          const txt = done.length
            ? `꼬리받기 · 신호 ${all.length} · 체결 ${done.length} (롱 ${nl} / 숏 ${done.length - nl}) · 승률 ${(win / done.length * 100).toFixed(0)}% · 평균 ${fmtR(sum / done.length)} · 합계 ${fmtR(sum)}`
            : `꼬리받기 · 신호 ${all.length} · 체결 0`;
          ctx.font = '12px sans-serif'; const w = ctx.measureText(txt).width;
          const bx = 8, by = bounding.height - 30;
          ctx.fillStyle = 'rgba(19,23,34,0.75)'; ctx.fillRect(bx, by, w + 16, 22);
          ctx.fillStyle = '#d1d4dc'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(txt, bx + 8, by + 11);
        }
        ctx.restore();
        return false;
      };
    }
    if (n === 'CM') {
      o.precision = this.pp;
      const self = this;
      o.draw = ({ ctx, indicator, xAxis, yAxis, bounding }) => {
        const res = indicator.result || [], r = res.length && res[res.length - 1].cm;
        if (!r) return false;
        const vr = self.chart.getVisibleRange(), data = self.chart.getDataList(), last = data.length - 1;
        const X = i => xAxis.convertToPixel(i), Y = v => yAxis.convertToPixel(v), W = bounding.width;
        const G = '#089981', Rd = '#F23645', B = '#2962FF', Gy = '#787b86', Or = '#FF9800';
        const fmtR = v => (v >= 0 ? '+' : '') + v.toFixed(2) + 'R', pp = self.pp;
        ctx.save(); ctx.font = '11px sans-serif';
        const tag = (txt, x, y, col, align) => { ctx.font = '11px sans-serif'; const w = ctx.measureText(txt).width; const x0 = align === 'right' ? x - w - 8 : x; ctx.fillStyle = 'rgba(19,23,34,0.7)'; ctx.fillRect(x0, y - 8, w + 8, 16); ctx.fillStyle = col; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(txt, x0 + 4, y); };
        // ① 하이로우 기준선 + 전고·전저의 적깊/비깊/어깊 띠
        const jk = r.P.jk;
        for (const lv of r.levels) {
          const col = lv.t > 0 ? Rd : G, x0 = Math.max(0, X(lv.i)), y = Y(lv.p), big = lv.s >= 2;
          if (big) {
            const step = jk * lv.h, dirn = lv.t > 0 ? 1 : -1;
            [[0, 1, 0.10], [1, 2, 0.07], [2, 3, 0.04]].forEach(([a, b2, al]) => {
              const ya = Y(lv.p + dirn * a * step), yb = Y(lv.p + dirn * b2 * step);
              ctx.fillStyle = lv.t > 0 ? `rgba(242,54,69,${al})` : `rgba(8,153,129,${al})`;
              ctx.fillRect(x0, Math.min(ya, yb), W - x0, Math.abs(yb - ya));
            });
            ctx.fillStyle = col; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.font = '10px sans-serif';
            ['적깊', '비깊', '어깊'].forEach((t, k) => ctx.fillText(t, W - 70, Y(lv.p + dirn * (k + 0.5) * step)));
          }
          ctx.strokeStyle = col; ctx.lineWidth = big ? 1.5 : 1; ctx.setLineDash(big ? [] : lv.s === 1 ? [6, 3] : [2, 3]);
          ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(W, y); ctx.stroke(); ctx.setLineDash([]);
          tag(`${lv.name} ${lv.p.toFixed(pp)}`, W - 6, y, col, 'right');
        }
        // ② 구간 + 구간 변경선
        const z = r.zones[last];
        if (z && z.lines) {
          for (const ln of z.lines) { const y = Y(ln.p); ctx.strokeStyle = Or; ctx.lineWidth = 1; ctx.setLineDash([8, 4]); ctx.beginPath(); ctx.moveTo(Math.max(0, X(z.B.i)), y); ctx.lineTo(W, y); ctx.stroke(); ctx.setLineDash([]); tag(ln.t, Math.max(4, X(z.B.i)), y, Or); }
          [z.A, z.B].forEach(pv => { ctx.fillStyle = Or; ctx.beginPath(); ctx.arc(X(pv.i), Y(pv.p), 4, 0, Math.PI * 2); ctx.fill(); });
        }
        if (z) { const zc = { up: G, upBig: G, upBias: G, dn: Rd, dnBig: Rd, range: Or }[z.code] || Gy; const zt = '구간: ' + z.name; ctx.font = '11px sans-serif'; tag(zt, W / 2 - ctx.measureText(zt).width / 2, 14, zc); }
        // ③ 캔들(군) 신호
        for (const sg of r.signals) {
          if (sg.i < vr.from - 1 || sg.i > vr.to + 1) continue;
          if (!sg.ok && !r.showBad) continue;
          const k = data[sg.i], col = !sg.ok ? Gy : sg.side > 0 ? G : Rd, x = X(sg.i);
          const y = sg.side > 0 ? Y(k.low) + 8 : Y(k.high) - 8;
          ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.font = (sg.ok ? 'bold ' : '') + '11px sans-serif';
          ctx.textBaseline = sg.side > 0 ? 'top' : 'bottom';
          const lab = (sg.side > 0 ? '▲매수' : '▼매도') + (sg.ok ? '' : '✕');
          const sub = sg.name + (sg.lv ? ' · ' + sg.lv.name + ' ' + sg.lv.dn : '') + (sg.ok && sg.grade !== '-' ? ' [' + sg.grade + ']' : '');
          if (sg.side > 0) { ctx.fillText(lab, x, y); ctx.font = '10px sans-serif'; ctx.fillText(sub, x, y + 14); }
          else { ctx.fillText(lab, x, y); ctx.font = '10px sans-serif'; ctx.fillText(sub, x, y - 14); }
        }
        // ④ 포지션 (진입·손절·익절·청산)
        for (const t of r.trades) {
          if (t.x < vr.from - 1 || t.ent > vr.to + 1) continue;
          const x0 = X(t.ent), x1 = Math.max(X(t.x), x0 + 4), ye = Y(t.e), yt = Y(t.tp), yS = Y(t.sl);
          ctx.fillStyle = 'rgba(8,153,129,0.13)'; ctx.fillRect(x0, Math.min(ye, yt), x1 - x0, Math.abs(yt - ye));
          ctx.fillStyle = 'rgba(242,54,69,0.13)'; ctx.fillRect(x0, Math.min(ye, yS), x1 - x0, Math.abs(yS - ye));
          ctx.lineWidth = 1;
          [[yt, G], [yS, Rd], [ye, Gy]].forEach(([yy, c]) => { ctx.strokeStyle = c; ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x1, yy); ctx.stroke(); });
          ctx.fillStyle = B; ctx.beginPath(); ctx.arc(x0, ye, 3.5, 0, Math.PI * 2); ctx.fill();
          const col = t.res === 'tp' ? G : t.res === 'sl' ? Rd : Gy, yx = Y(t.xp);
          ctx.strokeStyle = col; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(x1 - 4, yx - 4); ctx.lineTo(x1 + 4, yx + 4); ctx.moveTo(x1 + 4, yx - 4); ctx.lineTo(x1 - 4, yx + 4); ctx.stroke();
          const lab = { tp: '익절 ', sl: '손절 ', time: '시간청산 ', rev: '반대신호 청산 ', open: '진행 중 ' }[t.res] + fmtR(t.R);
          ctx.fillStyle = col; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = 'bold 11px sans-serif'; ctx.fillText(lab, x1 + 7, yx);
          if (t.res === 'open') { ctx.font = '11px sans-serif'; tag(`손절 ${t.sl.toFixed(pp)}`, W - 6, yS, Rd, 'right'); tag(`익절 ${t.tp.toFixed(pp)}`, W - 6, yt, G, 'right'); }
        }
        // ⑤ 요약 (불러온 데이터 전체)
        const sm = CM.summary(r.trades), b = CM.summary(r.trades.filter(t => t.side > 0)), s2 = CM.summary(r.trades.filter(t => t.side < 0));
        const nOk = r.signals.filter(x => x.ok).length;
        const txt = `캔들매매법 · 신호 ${r.signals.length} (유효 ${nOk}) · 거래 ${sm.n} · 승률 ${(sm.wr * 100).toFixed(0)}% · 평균 ${fmtR(sm.avg)} · 합계 ${fmtR(sm.sum)}  |  매수 ${b.n}건 ${fmtR(b.avg)} · 매도 ${s2.n}건 ${fmtR(s2.avg)}`;
        ctx.font = '12px sans-serif'; const w = ctx.measureText(txt).width, bx = 8, by = bounding.height - 30;
        ctx.fillStyle = 'rgba(19,23,34,0.75)'; ctx.fillRect(bx, by, w + 16, 22);
        ctx.fillStyle = '#d1d4dc'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(txt, bx + 8, by + 11);
        ctx.restore();
        return false;
      };
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
        tooltip: { showRule: s.statusOHLC === 'none' ? 'none' : 'always', title: { template: this.titleTpl() }, legend: { template: d => this.statusLegend(d) } }
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
  titleTpl() { const m = this.st.market; return m === 'upbit' ? '{ticker} · {period} · 업비트' : `{ticker}${m === 'futures' ? ' 무기한' : ''} · {period} · 바이낸스${m === 'spot' ? ' 현물' : ''}`; }
  // 상태 표시줄 (차트 왼쪽 위)
  statusLegend(data) {
    const k = data && data.current; if (!k) return [];
    const s = L.settings, f = v => fmtPrice(v, this.pp), up = s.bodyUp, dn = s.bodyDown;
    const lab = s.theme === 'light' ? '#131722' : '#d1d4dc';
    const chgText = (d, base) => `${d > 0 ? '+' : ''}${f(d)} (${d > 0 ? '+' : ''}${(d / base * 100).toFixed(2)}%)`;
    if (s.statusOHLC === 'tv' && !this.crossOn) {
      const list = this.chart.getDataList(), last = list[list.length - 1] || k;
      let base = this.open24;
      if (!base) { const t = last.timestamp - 864e5; base = (list.find(b => b.timestamp >= t) || list[0] || last).open; }
      const d = last.close - base, col = d >= 0 ? up : dn;
      return [{ title: '', value: { text: f(last.close), color: col } }, { title: '', value: { text: chgText(d, base), color: col } }];
    }
    const ref = data.prev ? data.prev.close : k.open, d = k.close - ref;
    const col = k.close >= k.open ? up : dn;
    const L2 = (t, v) => ({ title: { text: t, color: lab }, value: { text: f(v), color: col } });
    return [L2('시', k.open), L2('고', k.high), L2('저', k.low), L2('종', k.close), { title: '', value: { text: chgText(d, ref), color: d >= 0 ? up : dn } }];
  }
  async fetch24() {
    const st = this.st, key = st.market + st.symbol;
    if (MOCK) { this.open24 = null; return; }
    if (st.market === 'upbit') { const x = (await upbitSnapshot([st.symbol]))[st.symbol]; if (x && key === this.st.market + this.st.symbol) this.open24 = +x.prev_closing_price; return; }
    try {
      const x = await (await fetch(`${MARKETS[st.market].rest}/ticker/24hr?symbol=${st.symbol}`)).json();
      if (key === this.st.market + this.st.symbol && x && x.openPrice) this.open24 = +x.openPrice;
    } catch {}
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
      if (p && p.x != null) { o.crossOn = true; o.chart.executeAction('onCrosshairChange', { x: p.x, paneId: 'candle_pane' }); }
    }
    syncing = false;
  }
}

const activeCell = () => cells[L.active] || cells[0];
function setActive(i) {
  if (L.active === i || !cells[i]) return;
  L.active = i; saveLayout();
  cells.forEach((c, j) => c.el.classList.toggle('act', j === i));
  if (isMobile()) setTimeout(() => { cells[i].chart.resize(); cells[i].fitPanes(); }, 30);
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
  updateMobileBar();
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
  const qr = $('#symSearch').value.trim();
  let rows = q ? list.filter(x => x.s.includes(q) || (x.n && x.n.includes(qr))) : list;
  if (q) rows = rows.slice().sort((a, b) => (b.s.startsWith(q) - a.s.startsWith(q)) || (b.qv - a.qv));
  symRows = rows.slice(0, 300); symHl = 0;
  const inWl = s => watchlist.some(w => w.market === symMarket && w.symbol === s);
  box.innerHTML = symRows.map((x, i) => `<div class="sym-row ${i === 0 ? 'hl' : ''}" data-s="${x.s}">
    <span class="st ${inWl(x.s) ? 'on' : ''}" data-star="${x.s}" title="관심종목">${inWl(x.s) ? '★' : '☆'}</span>
    <span class="n">${x.s}${x.n ? ` <small style="color:var(--muted);font-weight:400">${esc(x.n)}</small>` : ''}</span><span class="r">${x.p}</span>
    <span class="r ${x.chg >= 0 ? 'upc' : 'downc'}">${x.chg >= 0 ? '+' : ''}${x.chg.toFixed(2)}%</span>
    <span class="r" style="color:var(--muted)">${symMarket === 'upbit' ? fmtKrw(x.qv) : fmtBig(x.qv)}</span></div>`).join('') ||
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
  if (typeof drawHint === 'function') drawHint(name);
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
      const s = { ...base[i % base.length], ...((IND_LINE_DEF[n] || [])[i] || {}), ...(cur[i] || {}) };
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
    { type: 'select', k: 'statusOHLC', label: '시고저종 정보', opts: [['tv', '트뷰처럼 (평소 현재가, 십자선 땐 시고저종)'], ['always', '시고저종 항상'], ['none', '숨김']] },
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
  const m = Sync.meta(), on = !!Sync.token();
  return `<div class="sec">기기 동기화 (깃허브)</div>
    <p class="note">${on ? `연결됨 · 마지막 동기화 <b>${m.lastSyncAt ? new Date(m.lastSyncAt).toLocaleString('ko-KR', { hour12: false }) : '-'}</b><br>설정·지표·작도·레이아웃·관심종목이 바뀌면 몇 초 안에 자동으로 올라가고, 다른 기기에서 앱을 열면 자동으로 받아와요.` :
      `깃허브 토큰(gist 권한)을 넣으면 태블릿·폰·PC가 같은 설정과 작도를 써요. 기기마다 한 번씩만 넣으면 돼요.`}</p>
    ${on ? `<div class="srow btns"><button id="syncNow">🔄 지금 동기화</button><button id="syncOff">연결 해제</button></div>` :
      `<div class="srow"><input type="password" id="syncToken" placeholder="ghp_로 시작하는 토큰 붙여넣기" style="flex:1" autocomplete="off"><button id="syncOn">연결</button></div>`}
    <p class="note" id="syncMsg">${Sync.lastError ? '⚠ ' + esc(Sync.lastError) : ''}</p>
    <div class="sec">앱으로 설치</div>
    <p class="note">${installGuide()}</p>
    <div class="srow btns"><button id="btnInstall" ${installEvt ? '' : 'disabled'}>📲 앱 설치</button></div>
    <div class="sec">백업 (기기끼리 옮기기)</div>
    <p class="note">레이아웃·작도·지표·관심종목은 기기마다 따로 저장돼요. 내보낸 파일을 다른 기기에서 가져오면 똑같이 옮겨져요.</p>
    <div class="srow btns"><button id="btnExport">⬇ 내보내기</button><button id="btnImport">⬆ 가져오기</button><input type="file" id="importFile" accept=".json,application/json" hidden></div>`;
}
const BACKUP_KEY = /^(layouts|curLayout|layout:|draw:|watchlist|toolStyle:|groupCur)/;
function bindDataTab() {
  if ($('#syncOn')) $('#syncOn').onclick = async () => {
    const t = $('#syncToken').value.trim(); if (!t) return;
    $('#syncMsg').textContent = '연결 중…';
    try { await Sync.connect(t); renderSetModal(); toast('동기화 연결됨'); }
    catch (e) { $('#syncMsg').textContent = '⚠ ' + e.message; }
  };
  if ($('#syncNow')) $('#syncNow').onclick = async () => { $('#syncMsg').textContent = '동기화 중…'; await Sync.sync(true); renderSetModal(); };
  if ($('#syncOff')) $('#syncOff').onclick = () => { if (confirm('이 기기의 동기화를 끌까요? (저장된 데이터는 그대로)')) { Sync.disconnect(); renderSetModal(); } };
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
function wlCells(p) {
  if (!p) return { p: '-', a: '', r: '', cls: '' };
  const cls = p.chg > 0 ? 'upc' : p.chg < 0 ? 'downc' : '';
  const sg = p.chg > 0 ? '+' : '';
  return { p: p.c, a: sg + trimNum(p.amt), r: sg + p.chg.toFixed(2) + '%', cls };
}
function renderWatchlist() {
  const st = L && activeCell() ? activeCell().st : {};
  $('#wl').innerHTML = (watchlist.length ? `<div class="wl-head"><span>종목</span><span>현재가</span><span>등락</span><span>등락률</span><span></span></div>` : '') + watchlist.map((w, i) => {
    const k = w.market + ':' + w.symbol, c = wlCells(wlPrices[k]);
    const cur = w.market === st.market && w.symbol === st.symbol;
    return `<div class="wl-row ${cur ? 'cur' : ''}" data-i="${i}" data-k="${k}">
      <span class="sn">${w.market === 'upbit' ? `<span class="s">${esc(w.symbol.split('-')[1] || w.symbol)}</span><span class="m">${w.symbol.startsWith('KRW-') ? '원화' : esc(w.symbol.split('-')[0])}·업비트</span>` : `<span class="s">${w.symbol.replace(/USDT$/, '')}</span>${w.symbol.endsWith('USDT') ? '' : `<span class="m">${esc(w.symbol.replace(/^.*?(USDC|FDUSD|BTC|ETH|BNB)$/, '$1'))}</span>`}${w.market === 'spot' ? '<span class="m">현물</span>' : ''}`}</span>
      <span class="p">${c.p}</span><span class="a">${c.a}</span><span class="c">${c.r}</span>
      <button class="x" data-del="${i}" title="삭제">×</button></div>`;
  }).join('') || `<div style="padding:14px;color:var(--muted)">종목 검색창에서 ☆를 눌러 추가해요</div>`;
}
// 가격이 바뀐 줄만 고치고, 오르면 초록·내리면 빨강으로 깜빡임
function updateWl(k, prev) {
  const row = $('#wl').querySelector(`[data-k="${k}"]`); if (!row) return;
  const p = wlPrices[k], c = wlCells(p);
  const els = [['.p', c.p], ['.a', c.a], ['.c', c.r]].map(([sel, txt]) => { const e = row.querySelector(sel); e.textContent = txt; return e; });
  if (prev != null && +p.c !== +prev) {
    const cls = +p.c > +prev ? 'fl-up' : 'fl-dn';
    els.forEach(e => { e.classList.remove('fl-up', 'fl-dn'); void e.offsetWidth; e.classList.add(cls); });
  }
}
function setWlPrice(k, c, open, chg, amt) {
  const prev = wlPrices[k] ? wlPrices[k].c : null;
  wlPrices[k] = { c: trimNum(c), chg, amt: amt != null ? amt : c - open, t: Date.now() };
  if (!$('#wl').querySelector(`[data-k="${k}"]`)) return;
  updateWl(k, prev);
}
function connectWatchlist() {
  wlSockets.forEach(s => s.close()); wlSockets = [];
  if (MOCK) return;
  for (const market of ['futures', 'spot']) {
    const syms = watchlist.filter(w => w.market === market).map(w => w.symbol.toLowerCase() + '@miniTicker');
    if (!syms.length) continue;
    wlSockets.push(openWS(`${MARKETS[market].ws}/stream?streams=${syms.join('/')}`, m => {
      const d = m.data; if (!d) return;
      const pp = decimalsOf(d.c);
      setWlPrice(market + ':' + d.s, d.c, +d.o, (d.c - d.o) / d.o * 100, +(d.c - d.o).toFixed(pp));
    }));
  }
  const up = watchlist.filter(w => w.market === 'upbit').map(w => w.symbol);
  if (up.length) wlSockets.push(openWS(MARKETS.upbit.ws, d => {
    if (d.type !== 'ticker') return;
    setWlPrice('upbit:' + d.code, d.trade_price, +d.prev_closing_price, d.signed_change_rate * 100, d.signed_change_price);
  }, null, [{ ticket: 'wl' + Date.now() }, { type: 'ticker', codes: up }]));
}
// 실시간 연결이 안 들어오는 종목은 5초마다 직접 조회해서 채움
if (MOCK) setInterval(() => watchlist.forEach((w, i) => { const base = 60000 / (i + 1), c = (base * (1 + Math.sin(Date.now() / 7000 + i) * 0.01)).toFixed(2); setWlPrice(w.market + ':' + w.symbol, c, base, (c - base) / base * 100, +(c - base).toFixed(2)); }), 1000);
async function pollWatchlist() {
  if (MOCK || document.hidden || !L || !L.wlOpen) return;
  const now = Date.now();
  for (const w of watchlist) {
    if (w.market === 'upbit') continue;
    const k = w.market + ':' + w.symbol, p = wlPrices[k];
    if (p && now - p.t < 8000) continue;
    try {
      const x = await (await fetch(`${MARKETS[w.market].rest}/ticker/24hr?symbol=${w.symbol}`)).json();
      if (x && x.lastPrice) { setWlPrice(k, x.lastPrice, +x.openPrice, +x.priceChangePercent, x.priceChange); wlPrices[k].t = now - 3000; }
    } catch {}
  }
}
setInterval(pollWatchlist, 5000);
setTimeout(pollWatchlist, 2500);
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
function applyWl() { $('#right').classList.toggle('hide', isMobile() ? mView !== 'watch' : !L.wlOpen); $('#btnWl').classList.toggle('on', L.wlOpen); setTimeout(() => cells.forEach(c => c.chart.resize()), 0); }

// ───────── 기기 동기화 (깃허브 Gist에 저장) ─────────
const Sync = (() => {
  // 동기화 규칙: ① 항상 먼저 받아오고 그다음 올림 ② 시계 대신 버전 번호(v)로 판단
  // ③ 저장 항목(관심종목·레이아웃·종목별 작도·도구 스타일…)마다 따로 비교해서 바뀐 것만 반영
  // ④ 같은 항목을 양쪽에서 바꿨으면 나중에 바꾼 쪽 우선
  const SYNC_KEY = /^(layouts|layout:|draw:|watchlist|toolStyle:|groupCur)/; // curLayout은 기기마다 따로
  const FILE = 'my-chart-sync.json', DESC = 'my-chart sync (내 차트 동기화 데이터)';
  const API = 'https://api.github.com';
  let busy = false, timer = null, timer2 = null, started = false, again = false;
  const api = { lastError: '' };
  const token = () => localStorage.getItem('sync:token') || '';
  const meta = () => LS.get('sync:meta', {});
  const setMeta = m => LS.set('sync:meta', { ...meta(), ...m });
  const NONE = '∅';
  const h = str => { if (str == null) return NONE; let x = 0; for (let i = 0; i < str.length; i++) x = (x * 31 + str.charCodeAt(i)) | 0; return x + ':' + str.length; };
  function collect() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (SYNC_KEY.test(k)) data[k] = localStorage.getItem(k); }
    return data;
  }
  const hashes = data => Object.fromEntries(Object.entries(data).map(([k, v]) => [k, h(v)]));
  async function gh(path, opt = {}, tk = token()) {
    const r = await fetch(API + path, { cache: 'no-store', ...opt, headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + tk, ...(opt.body ? { 'Content-Type': 'application/json' } : {}) } });
    if (r.status === 401) throw new Error('토큰이 틀렸거나 만료됐어요');
    if (r.status === 403 || r.status === 404) throw new Error('토큰에 gist 권한이 없어요 (HTTP ' + r.status + ')');
    if (!r.ok) throw new Error('깃허브 응답 오류 (HTTP ' + r.status + ')');
    return r.status === 204 ? null : r.json();
  }
  async function readRemote(id) {
    const g = await gh('/gists/' + id);
    const f = g.files && g.files[FILE]; if (!f) return { v: 0, data: {}, at: {} };
    let text = f.content;
    if (f.truncated && f.raw_url) text = await (await fetch(f.raw_url, { cache: 'no-store' })).text();
    const j = JSON.parse(text);
    return { v: j.v || 0, data: j.data || {}, at: j.at || {} };
  }
  async function writeRemote(id, doc) {
    await gh('/gists/' + id, { method: 'PATCH', body: JSON.stringify({ files: { [FILE]: { content: JSON.stringify({ app: 'my-chart', ...doc }) } } }) });
  }
  // 받아온 항목을 이 기기에 반영 (앱을 새로고침하지 않고 필요한 부분만 다시 그림)
  function applyLocal(changes) {
    const keys = Object.keys(changes); if (!keys.length) return;
    keys.forEach(k => changes[k] == null ? localStorage.removeItem(k) : localStorage.setItem(k, changes[k]));
    if (keys.includes('watchlist')) { watchlist = LS.get('watchlist', []); renderWatchlist(); connectWatchlist(); }
    if (keys.includes('groupCur')) { Object.keys(groupCur).forEach(k => delete groupCur[k]); Object.assign(groupCur, LS.get('groupCur', {})); renderLeft(); }
    if (keys.includes('layouts') || keys.includes('layout:' + curLayout)) {
      layouts = LS.get('layouts', layouts);
      if (!layouts.some(l => l.id === curLayout)) curLayout = layouts[0].id;
      loadLayout(curLayout);
    } else cells.forEach(c => { if (keys.includes(c.drawKey())) c.restoreDrawings(); });
    toast('다른 기기 변경 내용을 받아왔어요');
  }
  // 한 번의 동기화: 받기 → 항목별 비교 → 이 기기 반영 → (바뀐 게 있으면) 올리기
  async function sync(force) {
    const m = meta(); if (!token() || !m.gistId) return;
    if (busy) { again = true; return; }
    busy = true;
    try {
      const remote = await readRemote(m.gistId);
      const local = collect(), base = m.base || {}, dirtyAt = m.dirtyAt || {};
      const now = Date.now();
      const take = {}, merged = { ...remote.data }, at = { ...remote.at };
      let push = false;
      const keys = new Set([...Object.keys(local), ...Object.keys(remote.data), ...Object.keys(base)]);
      for (const k of keys) {
        const lv = local[k], rv = remote.data[k];
        const lh = h(lv), rh = h(rv), bh = base[k] || NONE;
        if (lh === rh) continue;
        const lChanged = lh !== bh, rChanged = rh !== bh;
        let useLocal;
        if (lChanged && !rChanged) useLocal = true;
        else if (rChanged && !lChanged) useLocal = false;
        else useLocal = (dirtyAt[k] || 0) > (remote.at[k] || 0); // 둘 다 바뀜 → 나중에 바꾼 쪽
        if (useLocal) { if (lv == null) delete merged[k]; else merged[k] = lv; at[k] = dirtyAt[k] || now; push = true; }
        else take[k] = rv == null ? null : rv;
      }
      let ver = remote.v;
      if (push) { ver = remote.v + 1; await writeRemote(m.gistId, { v: ver, at, data: merged }); }
      applyLocal(take);
      setMeta({ ver, base: hashes(merged), dirtyAt: {}, lastSyncAt: now });
      api.lastError = '';
      if (force) toast(push || Object.keys(take).length ? '동기화 완료' : '이미 최신이에요');
    } catch (e) { api.lastError = e.message; if (force) toast('동기화 실패: ' + e.message); }
    finally {
      busy = false;
      if (again) { again = false; setTimeout(() => sync(), 300); }
    }
  }
  // 4초마다: 이 기기에서 바뀐 항목이 있으면 동기화 (먼저 받고 올림)
  function tick() {
    const m = meta(); if (!m.gistId || document.hidden) return;
    const base = m.base || {}, local = collect(), dirtyAt = { ...(m.dirtyAt || {}) };
    let dirty = false;
    for (const k of new Set([...Object.keys(local), ...Object.keys(base)])) {
      if (h(local[k]) !== (base[k] || NONE)) { dirty = true; if (!dirtyAt[k]) dirtyAt[k] = Date.now(); }
    }
    if (dirty) { setMeta({ dirtyAt }); sync(); }
  }
  async function connect(tk) {
    const user = await gh('/user', {}, tk);
    let found = null;
    for (let page = 1; page <= 5 && !found; page++) {
      const list = await gh('/gists?per_page=100&page=' + page, {}, tk);
      found = list.find(g => g.files && g.files[FILE]);
      if (list.length < 100) break;
    }
    localStorage.setItem('sync:token', tk);
    api.lastError = '';
    if (found) {
      setMeta({ gistId: found.id, user: user.login });
      const remote = await readRemote(found.id);
      if (confirm('다른 기기에서 저장한 동기화 데이터가 있어요.\n\n[확인] 그 데이터를 이 기기로 가져오기\n[취소] 이 기기 데이터로 덮어쓰기')) {
        const local = collect(), take = {};
        new Set([...Object.keys(local), ...Object.keys(remote.data)]).forEach(k => { if (local[k] !== remote.data[k]) take[k] = remote.data[k] ?? null; });
        applyLocal(take);
        setMeta({ ver: remote.v, base: hashes(remote.data), dirtyAt: {}, lastSyncAt: Date.now() });
      } else {
        const data = collect(), now = Date.now();
        await writeRemote(found.id, { v: remote.v + 1, at: Object.fromEntries(Object.keys(data).map(k => [k, now])), data });
        setMeta({ ver: remote.v + 1, base: hashes(data), dirtyAt: {}, lastSyncAt: now });
      }
    } else {
      const data = collect(), now = Date.now();
      const g = await gh('/gists', { method: 'POST', body: JSON.stringify({ description: DESC, public: false, files: { [FILE]: { content: JSON.stringify({ app: 'my-chart', v: 1, at: Object.fromEntries(Object.keys(data).map(k => [k, now])), data }) } } }) }, tk);
      setMeta({ gistId: g.id, user: user.login, ver: 1, base: hashes(data), dirtyAt: {}, lastSyncAt: now });
    }
    start();
  }
  // 예전 방식(통째로 저장)에서 넘어올 때 기준점 만들기
  async function migrate() {
    const m = meta(); if (m.base || !m.gistId) return;
    const remote = await readRemote(m.gistId), local = collect();
    const localUnchanged = m.lastHash && (() => { const keys = Object.keys(local).sort(); const o = {}; keys.forEach(k => { o[k] = local[k]; }); const str = JSON.stringify(o); let x = 0; for (let i = 0; i < str.length; i++) x = (x * 31 + str.charCodeAt(i)) | 0; return (x + ':' + str.length) === m.lastHash; })();
    // 이 기기가 마지막 동기화 뒤로 안 바뀌었으면 → 다른 기기 것이 최신으로 간주
    setMeta({ base: localUnchanged ? hashes(local) : hashes(remote.data), dirtyAt: {} });
  }
  function start() {
    if (started) return; started = true;
    timer = setInterval(tick, 4000);
    timer2 = setInterval(() => { if (!document.hidden) sync(); }, 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
  }
  function disconnect() { clearInterval(timer); clearInterval(timer2); started = false; localStorage.removeItem('sync:token'); localStorage.removeItem('sync:meta'); }
  async function init() {
    if (!token() || !meta().gistId) return;
    try { await migrate(); } catch (e) { api.lastError = e.message; }
    await sync();   // 켜자마자 먼저 받아오기
    start();
  }
  return Object.assign(api, { token, meta, connect, sync, pull: f => sync(f), push: () => sync(), disconnect, init });
})();

// 리플레이 중 Shift+→ : 차트 기본 단축키(화면 스크롤)보다 먼저 가로채서 한 봉만 진행
window.addEventListener('keydown', e => {
  if (!R.on || !e.shiftKey || e.key !== 'ArrowRight') return;
  const tag = (e.target.tagName || '').toLowerCase(); if (tag === 'input' || tag === 'select') return;
  e.preventDefault(); e.stopImmediatePropagation(); replayStep();
}, true);
// 24시간 등락 기준값 1분마다 새로 고침
setInterval(() => { if (!document.hidden) cells.forEach(c => c.fetch24()); }, 60000);

// ───────── 폰 전용 화면 (트뷰 모바일처럼) ─────────
const MQ = matchMedia('(max-width: 760px), (max-height: 500px) and (pointer: coarse)');
let mView = 'chart';
function isMobile() { return MQ.matches; }
const NAV_IC = {
  watch: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
  chart: '<svg viewBox="0 0 24 24"><path d="M7 3v4M7 15v5M17 6v3M17 17v3"/><rect x="5" y="7" width="4" height="8"/><rect x="15" y="9" width="4" height="8"/></svg>',
  draw: '<svg viewBox="0 0 24 24"><path d="M4 20l4-1L19 8l-3-3L5 16z"/><path d="M14 7l3 3"/></svg>',
  ind: '<svg viewBox="0 0 24 24"><path d="M3 17l5-6 4 4 8-9"/><path d="M3 21h18"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>'
};
function renderNav() {
  $('#mnav').innerHTML = [['watch', '관심종목'], ['chart', '차트'], ['draw', '작도'], ['ind', '지표'], ['more', '메뉴']]
    .map(([k, t]) => `<button data-nav="${k}" class="${(k === mView) ? 'on' : ''}">${NAV_IC[k]}<span>${t}</span></button>`).join('');
}
function setView(v) { mView = v; renderNav(); applyWl(); }
function closeSheets() { document.querySelectorAll('.sheet').forEach(s => s.classList.remove('show')); $('#sheetDim').classList.remove('show'); }
function openSheet(id, render) { closeMenus(); render(); $('#sheetDim').classList.add('show'); $(id).classList.add('show'); }
$('#sheetDim').onclick = closeSheets;
$('#mnav').addEventListener('click', e => {
  const b = e.target.closest('[data-nav]'); if (!b) return;
  const k = b.dataset.nav;
  closeSheets(); closeMenus(); $('#symPanel').classList.remove('show');
  if (k === 'watch') setView(mView === 'watch' ? 'chart' : 'watch');
  else if (k === 'chart') setView('chart');
  else if (k === 'draw') { setView('chart'); openSheet('#toolSheet', renderToolSheet); }
  else if (k === 'ind') { setView('chart'); openIndModal(); }
  else if (k === 'more') openSheet('#moreSheet', renderMoreSheet);
});
function renderToolSheet() {
  $('#toolSheet').innerHTML = '<div class="grab"></div>' + TK.GROUPS.map(g => `<h5>${g.title}</h5><div class="tgrid">${g.tools.map(t =>
    `<button data-st="${t}" class="${t === activeTool ? 'on' : ''}">${TK.ICONS[t]}<span>${TK.NAMES[t]}</span></button>`).join('')}</div>`).join('') +
    `<h5>작도 관리</h5><div class="tgrid">
      <button data-sa="magnet" class="${L.magnet !== 'off' ? 'on' : ''}"><span style="font-size:20px">🧲</span><span>자석: ${{ off: '끔', weak: '약', strong: '강' }[L.magnet]}</span></button>
      <button data-sa="lock" class="${L.lockAll ? 'on' : ''}"><span style="font-size:20px">🔒</span><span>${L.lockAll ? '잠금 풀기' : '모두 잠금'}</span></button>
      <button data-sa="hide" class="${drawHidden ? 'on' : ''}"><span style="font-size:20px">👁</span><span>${drawHidden ? '보이기' : '숨기기'}</span></button>
      <button data-sa="clear"><span style="font-size:20px">🗑</span><span>이 종목 전체 삭제</span></button></div>`;
}
$('#toolSheet').addEventListener('click', e => {
  const t = e.target.closest('[data-st]');
  if (t) { closeSheets(); startTool(t.dataset.st); return; }
  const a = e.target.closest('[data-sa]'); if (!a) return;
  const id = { magnet: 'btnMagnet', lock: 'btnLock', hide: 'btnHideDraw', clear: 'btnClearDraw' }[a.dataset.sa];
  $('#' + id).click();
  renderToolSheet();
});
function renderMoreSheet() {
  const n = GRIDS[L.grid];
  $('#moreSheet').innerHTML = `<div class="grab"></div>
    <div class="mrow" data-m="replay">⏪ ${R.on ? '리플레이 종료' : '리플레이'}</div>
    <div class="mrow" data-m="settings">⚙ 차트 설정</div>
    <div class="mrow" data-m="layout">▦ 레이아웃 · <b>${esc(layoutName())}</b></div>
    <div class="mrow" data-m="grid">⊞ 화면 분할 · ${n}칸 ${n > 1 ? '(폰에선 한 칸씩 보여요)' : ''}</div>
    <div class="mrow" data-m="star">${watchlist.some(w => w.market === activeCell().st.market && w.symbol === activeCell().st.symbol) ? '★ 관심종목에서 빼기' : '☆ 관심종목에 추가'}</div>`;
}
$('#moreSheet').addEventListener('click', e => {
  const r = e.target.closest('[data-m]'); if (!r) return;
  const m = r.dataset.m; closeSheets(); setView('chart');
  if (m === 'replay') R.on ? exitReplay() : beginPick();
  else if (m === 'settings') openSetModal();
  else if (m === 'layout') setTimeout(() => toggleMenu($('#layMenu'), $('#symBtn'), renderLayMenu), 0);
  else if (m === 'grid') setTimeout(() => toggleMenu($('#gridMenu'), $('#symBtn'), renderGridMenu), 0);
  else if (m === 'star') { const st = activeCell().st; toggleWatch(st.market, st.symbol); toast('관심종목 변경됨'); }
});
// 타임프레임 버튼 / 분할 칸 바꾸기
function updateMobileBar() {
  if (!L || !cells.length) return;
  $('#mTf').textContent = activeCell().st.tf;
  const n = cells.length;
  $('#mCell').style.visibility = n > 1 ? 'visible' : 'hidden';
  $('#mCell').textContent = `칸 ${L.active + 1}/${n}`;
}
$('#mTf').onclick = e => {
  e.stopPropagation();
  toggleMenu($('#tfMenu'), e.currentTarget, () => {
    const cur = activeCell().st.tf;
    $('#tfMenu').innerHTML = `<div class="t">타임프레임</div><div class="gridpick">${TF_SHOW.map(t => `<button data-tf="${t}" class="${t === cur ? 'on' : ''}">${t}</button>`).join('')}</div>`;
  });
  const m = $('#tfMenu'); m.style.left = Math.max(4, Math.min(m.getBoundingClientRect().left, innerWidth - m.offsetWidth - 6)) + 'px';
};
$('#tfMenu').addEventListener('click', e => { const b = e.target.closest('[data-tf]'); if (b) { changeTf(b.dataset.tf); closeMenus(); } });
$('#mCell').onclick = () => { setActive((L.active + 1) % cells.length); updateMobileBar(); };
// 관심종목 화면에서 종목을 고르면 차트로 돌아가기
$('#wl').addEventListener('click', e => { if (isMobile() && e.target.closest('[data-i]') && !e.target.closest('[data-del]')) setView('chart'); });
// 폰에서 그리는 중에는 위에 안내 + 취소 버튼
let drawHintOn = false;
function drawHint(name) {
  if (!isMobile() || picking) { if (drawHintOn) { $('#hint').classList.remove('show'); drawHintOn = false; } return; }
  if (name) {
    $('#hintText').textContent = `${TK.NAMES[name]} — ${TK.HINTS[name] || '차트를 눌러서 그리기'}`;
    $('#hintExtra').innerHTML = '';
    $('#hint').classList.add('show'); drawHintOn = true;
  } else if (drawHintOn) { $('#hint').classList.remove('show'); drawHintOn = false; }
}
$('#hintCancel').addEventListener('click', () => { if (drawHintOn) cancelDrawing(); });
function applyMobile() {
  document.body.classList.toggle('mobile', isMobile());
  if (!isMobile()) mView = 'chart';
  renderNav(); applyWl(); updateMobileBar();
  setTimeout(() => cells.forEach(c => { c.chart.resize(); c.fitPanes(); }), 60);
}
MQ.addEventListener('change', applyMobile);

// ───────── 시작 ─────────
let rsTimer;
window.addEventListener('resize', () => { clearTimeout(rsTimer); rsTimer = setTimeout(() => cells.forEach(c => c.chart.resize()), 50); });
let fitTimer;
new ResizeObserver(() => { cells.forEach(c => c.chart.resize()); clearTimeout(fitTimer); fitTimer = setTimeout(() => cells.forEach(c => c.fitPanes()), 150); }).observe($('#grid'));
connectWatchlist();
renderLeft();
document.body.classList.toggle('mobile', isMobile()); renderNav();
loadLayout(curLayout);
applyMobile();
if (innerWidth < 700 && !LS.get('seen', false)) { L.wlOpen = false; applyWl(); }
LS.set('seen', true);
Sync.init();
if (MOCK) toast('테스트 모드 (가짜 데이터)');
window.__cells = () => cells; window.__L = () => L; window.__sync = Sync;
Object.defineProperty(window, '__chart', { get: () => activeCell().chart });
})();
