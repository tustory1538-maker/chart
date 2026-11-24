// ═════════ 캔들매매법 엔진 (캔들(군) 신호 + 파동연상 기준) ═════════
// 순수 계산 모듈: 브라우저에서는 window.CM, Node에서는 require('./candlemaster.js')
// 모든 판단은 "그 봉 시점에 알 수 있었던 정보"만 쓴다 (고점·저점은 확정된 뒤에만 사용 → 백테스트에 미래 정보 없음)
(function (root) {
'use strict';

const DEF = {
  atrLen: 14,
  zz: [1.5, 3, 6, 12],   // 파동 크기 구분용 ATR 배수: 소 / 중 / 대 / 극대
  jk: 0.10,              // 적깊 = 기준선을 만든 파동 높이 × jk (비깊 = 2배, 어깊 = 비깊 × 1.5)
  maxStopPct: 3,         // 손절 폭이 이 %를 넘으면 진입 안 함 (손절매가 최소화되지 않는 자리)
  rr: 2,                 // 익절 = 손절 폭 × rr (반대 신호가 먼저 나오면 그때 청산)
  maxHold: 48,           // 최대 보유 봉 수
  dir: 1,                // 1 = 양방향, 2 = 매수만, 3 = 매도만
  cost: 0.0008           // 왕복 수수료·슬리피지 (진입가 대비)
};

// ───────── 기본 계산 ─────────
function atrOf(list, len) {
  const n = list.length, out = new Array(n).fill(null); let s = 0;
  const tr = i => { const pc = i ? list[i - 1].close : list[0].close; const k = list[i]; return Math.max(k.high - k.low, Math.abs(k.high - pc), Math.abs(k.low - pc)); };
  for (let i = 0; i < n; i++) { s += tr(i); if (i >= len) s -= tr(i - len); if (i >= len - 1) out[i] = s / len; }
  return out;
}

// 지그재그: 고점·저점 + 확정된 봉(conf). 반대 방향으로 ATR×k 이상 움직여야 확정
function zigzag(list, atr, k) {
  const pv = []; let dir = 0, ei = 0, ep = list[0].high, li = 0, lp = list[0].low;
  for (let i = 1; i < list.length; i++) {
    const t = (atr[i] || (list[i].high - list[i].low)) * k, h = list[i].high, l = list[i].low;
    if (dir >= 0) { if (h > ep) { ep = h; ei = i; } }
    if (dir <= 0) { if (l < lp) { lp = l; li = i; } }
    if (dir === 0) {
      if (ep - l >= t && ei < i) { pv.push({ i: ei, p: ep, t: 1, conf: i }); dir = -1; lp = l; li = i; }
      else if (h - lp >= t && li < i) { pv.push({ i: li, p: lp, t: -1, conf: i }); dir = 1; ep = h; ei = i; }
    } else if (dir > 0) {
      if (ep - l >= t) { pv.push({ i: ei, p: ep, t: 1, conf: i }); dir = -1; lp = l; li = i; }
    } else {
      if (h - lp >= t) { pv.push({ i: li, p: lp, t: -1, conf: i }); dir = 1; ep = h; ei = i; }
    }
  }
  for (let j = 0; j < pv.length; j++) pv[j].h = j ? Math.abs(pv[j].p - pv[j - 1].p) : null; // 이 고점·저점을 만든 파동 높이
  return pv;
}

// ───────── 캔들 성질 ─────────
function candleKit(list) {
  const n = list.length, body = [], up = [], dn = [], rng = [], avgB = new Array(n).fill(null), avgR = new Array(n).fill(null);
  for (const k of list) { body.push(Math.abs(k.close - k.open)); up.push(k.high - Math.max(k.open, k.close)); dn.push(Math.min(k.open, k.close) - k.low); rng.push(k.high - k.low); }
  let sb = 0, sr = 0; const W = 20;
  for (let i = 0; i < n; i++) { sb += body[i]; sr += rng[i]; if (i >= W) { sb -= body[i - W]; sr -= rng[i - W]; } if (i >= W - 1) { avgB[i] = sb / W; avgR[i] = sr / W; } }
  const bull = i => list[i].close > list[i].open, bear = i => list[i].close < list[i].open;
  const rel = i => avgB[i - 1] ? body[i] / avgB[i - 1] : 1;   // 직전 20봉 평균 몸통 대비 크기
  const K = {
    body, up, dn, rng, avgB, avgR, bull, bear, rel,
    big: i => rel(i) >= 1.4, mid: i => rel(i) >= 0.7, small: i => rel(i) <= 0.6, tiny: i => rel(i) <= 0.35,
    hiN: (i, m) => { let v = -Infinity; for (let j = Math.max(0, i - m); j < i; j++) v = Math.max(v, list[j].high); return v; },
    loN: (i, m) => { let v = Infinity; for (let j = Math.max(0, i - m); j < i; j++) v = Math.min(v, list[j].low); return v; },
    // a..b 구간의 캔들이 모두 작고(평균 몸통 이하) 높낮이가 좁은가 = 작은 캔들군 / 수평 횡보
    quiet: (a, b) => { if (a < 1) return false; let hh = -Infinity, ll = Infinity, s = 0; for (let j = a; j <= b; j++) { hh = Math.max(hh, list[j].high); ll = Math.min(ll, list[j].low); s += body[j]; } const ab = avgB[a - 1] || 1; return s / (b - a + 1) <= 0.75 * ab && (hh - ll) <= (b - a + 2) * 0.9 * (avgR[a - 1] || 1); },
    // a..b 구간 순상승(+)/순하락(-)이 평균 몸통 몇 배인가
    run: (a, b) => { if (a < 1) return 0; return (list[b].close - list[a].open) / (avgB[a - 1] || 1); }
  };
  return K;
}

// ───────── 캔들(군) 신호 ─────────
// 반환: { side: +1 매수 / -1 매도, code, name, stop } — stop은 "돌파해서는 안 되는 선"(신호의 저가/고가)
// 『캔들(군) 신호』 고점 매도 9종 중 책 끝 안내로 제외된 '다(작은 양봉 꼬리군)'와 '나'의 2·3번째 유형은 넣지 않았다
function detect(list, K, i) {
  const out = [], L = list, b = K.body, u = K.up, d = K.dn;
  if (i < 25) return out;
  const newHi = L[i].high >= K.hiN(i, 15) * 0.999, newLo = L[i].low <= K.loN(i, 15) * 1.001;
  const upRun = K.run(i - 6, i - 1), dnRun = -K.run(i - 6, i - 1);
  const hiOf = (a, c) => { let v = -Infinity; for (let j = a; j <= c; j++) v = Math.max(v, L[j].high); return v; };
  const loOf = (a, c) => { let v = Infinity; for (let j = a; j <= c; j++) v = Math.min(v, L[j].low); return v; };

  // ── 고점 매도 ──
  // 가. 긴 아래 꼬리 작은 음봉/도지: 큰 양봉(군) 직후, 몸통 매우 작고 아래꼬리 길게, 고가 갱신
  if (upRun >= 3 && K.bull(i - 1) && K.mid(i - 1) && !K.bull(i) && K.small(i) && d[i] >= 2 * b[i] && d[i] >= 0.45 * K.rng[i] && newHi)
    out.push({ side: -1, code: 'S가', name: '긴 아래꼬리 작은 음봉/도지', stop: L[i].high });
  // 나(1유형). 위 꼬리 작은 양봉: 양봉(군) 상승 → 작은 음봉군 2~4개 → 위꼬리로 고가 갱신/위협하는 작은 양봉
  for (let m = 2; m <= 4; m++) {
    let ok = K.bull(i) && K.small(i) && u[i] >= 1.5 * b[i] && K.run(i - m - 5, i - m - 1) >= 3;
    for (let j = i - m; j < i && ok; j++) ok = K.bear(j) && K.small(j);
    if (ok && L[i].high >= hiOf(i - m - 5, i - 1) * 0.998) { out.push({ side: -1, code: 'S나', name: '위꼬리 작은 양봉', stop: L[i].high }); break; }
  }
  // 라. 작은 음봉 꼬리군: 큰 양봉(군) 상승 중 꼬리 달린 작은 음봉 2개 + 위아래 꼬리 세 번째 음봉
  if (K.run(i - 7, i - 3) >= 4 && [i - 2, i - 1, i].every(j => K.bear(j) && K.small(j) && u[j] + d[j] > 0.3 * b[j]) && u[i] >= 0.3 * b[i] && d[i] >= 0.3 * b[i] && hiOf(i - 2, i) >= K.hiN(i - 2, 15) * 0.998)
    out.push({ side: -1, code: 'S라', name: '작은 음봉 꼬리군', stop: hiOf(i - 3, i) });
  // 마. 긴 아래 꼬리 양봉: 고점 부근 긴 아래꼬리 + 큰 몸통, 작은 캔들군 직후 갑작스레 고가 돌파
  if (K.bull(i) && K.mid(i) && d[i] >= b[i] && newHi && K.quiet(i - 6, i - 1))
    out.push({ side: -1, code: 'S마', name: '긴 아래꼬리 양봉', stop: L[i].high });
  // 바. (둔탁한) 상승 다람쥐: 작은 캔들군 직후 갑자기 몸통 큰 양봉 3개 (또는 세 번째가 꼬리 없는 큰 양봉)
  if ([i - 2, i - 1, i].every(j => K.bull(j)) && K.quiet(i - 8, i - 3) &&
      (([i - 2, i - 1, i].every(j => K.mid(j))) || (K.big(i) && u[i] <= 0.1 * b[i])) &&
      // 책 조건: 고가를 낮추는 위치(직전 고가 아래) 또는 직전 고점을 가까스로 돌파한 정도
      (() => { const ph = K.hiN(i - 8, 30), over = L[i].high - ph; return over <= 0.5 * (K.avgR[i - 3] || 0) && L[i].high >= ph - 1.5 * (K.avgR[i - 3] || 0); })())
    out.push({ side: -1, code: 'S바', name: '둔탁한 상승 다람쥐', stop: L[i].high });
  // 사. 큰 양봉 + 위아래 꼬리 작은 양봉: 서서히 오르던 중 갑자기 큰 양봉, 다음 위아래 꼬리 작은 양봉
  if (K.bull(i - 1) && K.big(i - 1) && K.quiet(i - 7, i - 2) && K.bull(i) && K.small(i) && u[i] >= 0.4 * b[i] && d[i] >= 0.4 * b[i])
    out.push({ side: -1, code: 'S사', name: '큰 양봉+위아래꼬리 작은 양봉', stop: Math.max(L[i].high, L[i - 1].high) });
  // 아. 매우 작은 캔들군: 큰 양봉군 직후 도지급 캔들 4~8개 횡보 → 끝자락 음봉 스프링/긴 아래꼬리 음봉
  for (let m = 4; m <= 8; m++) {
    let ok = K.run(i - m - 4, i - m - 1) >= 4;
    for (let j = i - m; j < i && ok; j++) ok = K.tiny(j);
    const trig = K.bear(i) && K.mid(i) && (d[i] <= 0.1 * K.rng[i] || d[i] >= 1.5 * b[i]);
    if (ok && trig) { out.push({ side: -1, code: 'S아', name: '매우 작은 캔들군 + 하락 캔들', stop: hiOf(i - m, i) }); break; }
  }
  // 자. 뜬금없는 양봉: 큰 양봉군 → 작은 캔들군 짧은 수평 횡보 → 갑자기 꼬리 짧은 큰 양봉
  for (let m = 3; m <= 7; m++) {
    if (K.run(i - m - 4, i - m - 1) >= 4 && K.quiet(i - m, i - 1) && K.bull(i) && K.big(i) && (u[i] <= 0.15 * b[i] || d[i] <= 0.1 * b[i]) && L[i].high > hiOf(i - m, i - 1)) {
      out.push({ side: -1, code: 'S자', name: '뜬금없는 양봉', stop: L[i].high + 0.25 * b[i] }); break;
    }
  }

  // ── 저점 매수 ──
  // 가. 작은 양봉 꼬리군: 큰 음봉(군) 직후 작은 양봉 3개, 2·3번째는 위아래 꼬리
  if (-K.run(i - 7, i - 3) >= 4 && [i - 2, i - 1, i].every(j => K.bull(j) && K.small(j)) && [i - 1, i].every(j => u[j] >= 0.3 * b[j] && d[j] >= 0.3 * b[j]) && loOf(i - 2, i) <= K.loN(i - 2, 15) * 1.002)
    out.push({ side: 1, code: 'B가', name: '작은 양봉 꼬리군', stop: loOf(i - 3, i) });
  // 나. 양봉 팽이군: 저점 바로 근처, 위아래 꼬리 긴 양봉 팽이 2~3개 연속
  if (dnRun >= 3 && [i - 1, i].every(j => K.bull(j) && K.tiny(j) && u[j] >= 0.6 * b[j] && d[j] >= 0.6 * b[j]) && loOf(i - 3, i) <= K.loN(i - 3, 15) * 1.002)
    out.push({ side: 1, code: 'B나', name: '양봉 팽이군', stop: loOf(i - 3, i) });
  // 다. 위아래 꼬리 큰 음봉: 저점 수평 횡보 끝자락, 저가 갱신(근접), 큰 음봉군 직후는 무효
  if (K.bear(i) && K.mid(i) && u[i] >= 0.4 * b[i] && d[i] >= 0.4 * b[i] && newLo && K.quiet(i - 7, i - 1) && !(K.big(i - 1) && K.bear(i - 1) && K.big(i - 2) && K.bear(i - 2)))
    out.push({ side: 1, code: 'B다', name: '위아래꼬리 큰 음봉', stop: L[i].low });
  // 라. 미니 기울어진 W: 큰 음봉군 하락 → 횡보 캔들군 → 큰 음봉으로 저가 급히 돌파 → 연속 양봉 2개가 큰 음봉 시가 부근 회복
  if (K.bull(i) && K.bull(i - 1) && K.mid(i) && K.mid(i - 1) && K.bear(i - 2) && K.big(i - 2)) {
    const j = i - 2, op = L[j].open;
    for (let m = 3; m <= 10; m++) {
      if (-K.run(j - m - 4, j - m - 1) >= 3 && K.quiet(j - m, j - 1) && L[j].low < loOf(j - m, j - 1) && L[i].close >= op * 0.997 && L[i].close <= op + 0.6 * K.body[j]) {
        out.push({ side: 1, code: 'B라', name: '미니 기울어진 W', stop: loOf(j, i) }); break;
      }
    }
  }
  // 마. 미니 기울어진 M: 큰 음봉으로 직전 저가를 2~3차례 연속 돌파 → 매수 캔들
  if (K.bull(i) && K.mid(i)) {
    let breaks = 0, last = -1;
    for (let j = i - 14; j < i; j++) if (K.bear(j) && K.big(j) && L[j].low < K.loN(j, 6)) { if (j - last >= 3) breaks++; last = j; }
    if (breaks >= 2 && i - last <= 3 && (K.bull(i - 1) || d[i] >= b[i]))
      out.push({ side: 1, code: 'B마', name: '미니 기울어진 M', stop: loOf(i - 4, i) });
  }
  // 바. 큰 음봉 다지기: 긴 위꼬리/위아래꼬리 큰 음봉 → 큰 음봉(군) → 수평 횡보 → 끝자락 양봉 신호
  for (let m = 3; m <= 8; m++) {
    const a = i - m - 2;
    if (a < 2) break;
    if (K.bear(a) && K.big(a) && u[a] >= 0.4 * b[a] && K.bear(a + 1) && K.mid(a + 1) && K.quiet(i - m, i - 1) && K.bull(i) && (K.big(i) || u[i] <= 0.1 * b[i])) {
      out.push({ side: 1, code: 'B바', name: '큰 음봉 다지기', stop: loOf(a, i) }); break;
    }
  }
  return out;
}

// ───────── 위치: 기준선·깊이·구간 ─────────
// 그 시점까지 확정된 고점·저점만 본다
function known(pv, i) { let r = pv.length; while (r > 0 && pv[r - 1].conf > i) r--; return r; } // pv[0..r-1]이 i 시점에 알려진 것

function zoneAt(Z4, list, i, P) {
  const r = known(Z4, i);
  if (r < 2) return { code: 'none', name: '판단 불가' };
  const B = Z4[r - 1], A = Z4[r - 2], c = list[i].close;
  // B 이후 지금까지의 극값
  let hh = -Infinity, ll = Infinity; for (let j = B.i; j <= i; j++) { hh = Math.max(hh, list[j].high); ll = Math.min(ll, list[j].low); }
  const H = B.t > 0 ? B.p : A.p, Lw = B.t > 0 ? A.p : B.p, span = H - Lw;
  if (!(span > 0)) return { code: 'none', name: '판단 불가' };
  const z = { H, L: Lw, A, B };
  if (B.t > 0) { // 마지막 큰 움직임이 상승 (저점 A → 고점 B)
    const q = (H - c) / span, qMax = (H - ll) / span;
    z.lines = [{ p: H - 0.5 * span, t: '큰 하락 조정 변경선' }, { p: H - 0.85 * span, t: '하락세 변경선' }];
    if (c > H + 2 * P.jk * span) return Object.assign(z, { code: 'up', name: '상승세' });
    if (qMax >= 0.5 && q <= 0.25) return Object.assign(z, { code: 'range', name: '보합 예상구간' });
    if (q < 0.5) return Object.assign(z, { code: 'up', name: '상승세/단순 하락 조정' });
    if (q < 0.85 && c >= Lw) return Object.assign(z, { code: 'upBig', name: '상승세 큰 하락 조정' });
    return Object.assign(z, { code: 'dn', name: '하락세' });
  } else {      // 마지막 큰 움직임이 하락 (고점 A → 저점 B)
    const q = (c - Lw) / span, qMax = (hh - Lw) / span;
    z.lines = [{ p: Lw + 0.5 * span, t: '큰 상승 조정 변경선' }, { p: Lw + span * 2 / 3, t: '⅔ 무주공산' }];
    if (c < Lw - 3 * P.jk * span) return Object.assign(z, { code: 'dn', name: '하락세' });
    if (qMax >= 0.5 && q <= 0.25) return Object.assign(z, { code: 'range', name: '보합 예상구간' });
    if (q < 0.5) return Object.assign(z, { code: 'dn', name: '하락세/단순 상승 조정' });
    if (q < 2 / 3) return Object.assign(z, { code: 'dnBig', name: '하락세 큰 상승 조정' });
    if (c <= H) return Object.assign(z, { code: 'upBias', name: '상승 우세 (⅔ 돌파)' });
    return Object.assign(z, { code: 'up', name: '상승세' });
  }
}

// 신호 근처의 의미 있는 기준선과 돌파 깊이 찾기
const SC_NAME = { hi: ['직전 고가', '직전 고점', '전 고점', '현저한 전 고점'], lo: ['직전 저가', '직전 저점', '전 저점', '현저한 전 저점'] };
function levelNear(ZZ, list, i, side, P) {
  // 큰 스케일부터: 해당 방향의 최근 고점/저점 중 지금 가격이 '바로 앞둔 ~ 어깊' 안에 있는 것
  const x = side > 0 ? list[i].low : list[i].high;
  let best = null;
  for (let s = ZZ.length - 1; s >= 0; s--) {
    const pv = ZZ[s], r = known(pv, i);
    for (let k = r - 1; k >= Math.max(0, r - 6); k--) {
      const p = pv[k]; if (p.t !== (side > 0 ? -1 : 1) || !p.h) continue;
      const jk = P.jk * p.h, depth = side > 0 ? (p.p - x) / jk : (x - p.p) / jk; // 돌파 깊이를 적깊 단위로 (+ = 돌파, - = 못 미침)
      if (depth < -0.5 || depth > 4.5) continue;                                   // 바로 앞둔(적깊 절반) ~ 어깊(적깊 3배) 바깥
      // 신호 이전에 이미 그 선을 크게 지나간 적이 있으면 (선이 무너진 뒤) 무의미
      let broken = false; for (let j = p.conf; j < i - 3; j++) { if (side > 0 ? list[j].low < p.p - 3.5 * jk : list[j].high > p.p + 3.5 * jk) { broken = true; break; } }
      if (broken) continue;
      const dn = depth < -0.15 ? '바로 앞둔' : depth < 0.25 ? '근접/살짝 닿은' : depth < 1.5 ? '적깊' : depth < 3 ? '비깊' : '어깊';
      best = { s, p: p.p, i: p.i, h: p.h, depth, dn, name: SC_NAME[side > 0 ? 'lo' : 'hi'][s] };
      return best;
    }
  }
  return best;
}

// 책의 위치 규칙으로 신호 유효성 판단 → { ok, grade('A'|'B'), why }
function judge(sig, lv, zone) {
  if (!lv) return { ok: false, why: '의미 있는 기준선 없음' };
  if (zone.code === 'range') return { ok: false, why: '보합 예상구간' };
  if (lv.s === 0) return { ok: false, why: lv.name + '만 있음(소파동)' };
  const big = lv.s >= 2, z = zone.code, D = lv.depth;
  if (sig.side > 0) {
    if (lv.dn === '바로 앞둔' && big) return { ok: false, why: lv.name + ' 바로 앞둔 매수 = 무효' };
    if ((z === 'dn') && lv.s === 3 && lv.dn !== '비깊' && lv.dn !== '어깊') return { ok: false, why: '하락세 현저한 전저는 비깊~어깊만' };
    if ((z === 'dn' || z === 'dnBig') && lv.s <= 1 && D < 1.5) return { ok: false, why: '하락세 직전저점 돌파 직후' };
    const grade = (z === 'up' || z === 'upBig' || z === 'upBias') && D >= 0 && D < 3 ? 'A' : D >= 1.5 && D < 4.5 ? 'A' : 'B';
    return { ok: true, grade, why: `${zone.name} · ${lv.name} ${lv.dn}` };
  } else {
    if ((z === 'up') && big && D >= 3) return { ok: false, why: '상승세 전고 비깊 넘은 위치 = 매도 무효' };
    if ((z === 'up' || z === 'upBias') && lv.s <= 1 && sig.code !== 'S자' && sig.code !== 'S바') return { ok: false, why: '상승세 직전고점 = 매도 신뢰 낮음' };
    const grade = (z === 'dnBig' || z === 'dn') ? 'A' : D <= 2 ? 'A' : 'B';
    return { ok: true, grade, why: `${zone.name} · ${lv.name} ${lv.dn}` };
  }
}

// ───────── 전체 분석 + 백테스트 ─────────
function analyze(list, opt) {
  const P = Object.assign({}, DEF, opt || {}), n = list.length;
  const res = { P, signals: [], trades: [], zz: [], zones: new Array(n).fill(null) };
  if (n < 60) return res;
  const atr = atrOf(list, P.atrLen), K = candleKit(list);
  const ZZ = P.zz.map(k => zigzag(list, atr, k));
  res.zz = ZZ; res.atr = atr;
  for (let i = 0; i < n; i++) res.zones[i] = zoneAt(ZZ[3], list, i, P);
  for (let i = 25; i < n; i++) {
    for (const s of detect(list, K, i)) {
      if (P.dir === 2 && s.side < 0) continue; if (P.dir === 3 && s.side > 0) continue;
      const lv = levelNear(ZZ, list, i, s.side, P), j = judge(s, lv, res.zones[i]);
      res.signals.push(Object.assign(s, { i, lv, zone: res.zones[i].name, ok: P.noFilter ? true : j.ok, posOk: j.ok, grade: j.grade || '-', why: j.why }));
    }
  }
  // 같은 봉·같은 방향 중복은 하나로 (유효한 것 우선)
  const seen = {}; res.signals = res.signals.filter(s => { const k = s.i + ':' + s.side; if (seen[k]) { if (s.ok && !seen[k].ok) Object.assign(seen[k], s); return false; } seen[k] = s; return true; });
  backtest(list, res, P, atr);
  return res;
}

// 진입: 유효 신호 다음 봉 시가. 손절: 신호의 저가/고가 바깥 (ATR 0.1). 익절: rr배 또는 반대 유효 신호. 시간 청산
function backtest(list, res, P, atr) {
  const n = list.length, sigAt = {};
  res.signals.forEach(s => { if (s.ok) (sigAt[s.i] = sigAt[s.i] || []).push(s); });
  let i = 0;
  while (i < n - 1) {
    const ss = sigAt[i]; if (!ss) { i++; continue; }
    const s = ss[0], e = list[i + 1].open, side = s.side;
    const stop = side > 0 ? Math.min(s.stop, list[i].low) - 0.1 * atr[i] : Math.max(s.stop, list[i].high) + 0.1 * atr[i];
    const risk = side * (e - stop);
    if (!(risk > 0) || risk / e * 100 > P.maxStopPct || risk / e < 0.0015) { s.skip = risk > 0 && risk / e * 100 > P.maxStopPct ? '손절 폭 초과' : '손절 폭 비정상'; i++; continue; }
    const tp = e + side * P.rr * risk, T = { s: i, side, code: s.code, name: s.name, grade: s.grade, ent: i + 1, e, sl: stop, tp };
    let x = -1, xp = null, why = null;
    for (let j = i + 1; j < Math.min(n, i + 1 + P.maxHold); j++) {
      const k = list[j];
      if (side > 0 ? k.low <= stop : k.high >= stop) { x = j; xp = stop; why = 'sl'; break; }
      if (side > 0 ? k.high >= tp : k.low <= tp) { x = j; xp = tp; why = 'tp'; break; }
      const opp = sigAt[j] && sigAt[j].find(o => o.side === -side);
      if (opp && j + 1 < n) { x = j + 1; xp = list[j + 1].open; why = 'rev'; break; }
    }
    if (x < 0) { const j = Math.min(n - 1, i + P.maxHold); x = j; xp = list[j].close; why = i + P.maxHold <= n - 1 ? 'time' : 'open'; }
    T.x = x; T.xp = xp; T.res = why; T.R = side * (xp - e) / risk - P.cost * e / risk;
    res.trades.push(T);
    i = Math.max(i + 1, why === 'rev' ? x - 1 : x);
  }
}

// 화면용: 마지막 봉 기준으로 그릴 기준선(최근 것만)과 깊이 밴드
function levelsForDisplay(res, list) {
  const i = list.length - 1, out = [];
  if (!res.zz.length) return out;
  const lastPrice = list[i].close;
  for (let s = 1; s < res.zz.length; s++) {
    const pv = res.zz[s], r = known(pv, i);
    for (const t of [1, -1]) {
      for (let k = r - 1, cnt = 0; k >= 0 && cnt < (s >= 2 ? 2 : 1); k--) {
        const p = pv[k]; if (p.t !== t || !p.h) continue;
        // 이미 크게 지나간 선은 빼기
        if (t > 0 ? lastPrice > p.p + 3 * res.P.jk * p.h * 2 : lastPrice < p.p - 3 * res.P.jk * p.h * 2) continue;
        if (out.some(o => Math.abs(o.p - p.p) / p.p < 0.001)) continue;
        out.push({ s, t, i: p.i, p: p.p, h: p.h, name: SC_NAME[t > 0 ? 'hi' : 'lo'][s] }); cnt++;
      }
    }
  }
  return out;
}

function summary(trades) {
  const done = trades.filter(t => t.res !== 'open'), win = done.filter(t => t.R > 0).length, sum = done.reduce((a, t) => a + t.R, 0);
  return { n: done.length, win, wr: done.length ? win / done.length : 0, avg: done.length ? sum / done.length : 0, sum };
}

const CM = { DEF, analyze, levelsForDisplay, summary, zigzag, atrOf, candleKit, detect, known };
if (typeof module !== 'undefined' && module.exports) module.exports = CM; else root.CM = CM;
})(typeof window !== 'undefined' ? window : globalThis);
