// ═════════ 작도 도구 정의 (KLineChart overlay) ═════════
(() => {
'use strict';
const { registerOverlay } = klinecharts;

// ── 공통 도우미 ──
const stOf = o => (o.extendData && o.extendData.st) || {};
const colOf = o => stOf(o).color || '#2962ff';
const hexA = (hex, a) => { const h = String(hex).replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h.slice(0, 6), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
const ln = (a, b, styles) => ({ type: 'line', attrs: { coordinates: [a, b] }, ...(styles ? { styles } : {}) });
const dash = (a, b, col) => ln(a, b, { style: 'dashed', dashedValue: [4, 4], size: 1, ...(col ? { color: col } : {}) });
const fillPoly = (pts, o, alpha) => ({ type: 'polygon', ignoreEvent: false, attrs: { coordinates: pts }, styles: { style: 'fill', color: hexA(colOf(o), alpha != null ? alpha : (stOf(o).fill != null ? stOf(o).fill : 0.15)) } });
const lbl = (x, y, text, bg, base = 'bottom', align = 'center', color = '#fff') => ({
  type: 'text', ignoreEvent: true,
  attrs: { x, y, text, align, baseline: base },
  styles: { color, size: 11, weight: 'normal', backgroundColor: bg, borderColor: bg, borderSize: 0, borderRadius: 3, paddingLeft: 5, paddingRight: 5, paddingTop: 2, paddingBottom: 2 }
});
const arrowHead = (from, to, col, size = 9) => {
  const ang = Math.atan2(to.y - from.y, to.x - from.x);
  const p = (a, r) => ({ x: to.x - r * Math.cos(a), y: to.y - r * Math.sin(a) });
  return { type: 'polygon', ignoreEvent: true, attrs: { coordinates: [to, p(ang - 0.45, size), p(ang + 0.45, size)] }, styles: { style: 'fill', color: col } };
};
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
function precisionOf(chart) { const s = chart.getSymbol && chart.getSymbol(); return s && s.pricePrecision != null ? s.pricePrecision : 2; }
const fmtP = (chart, v) => Number(v).toLocaleString('en-US', { minimumFractionDigits: precisionOf(chart), maximumFractionDigits: precisionOf(chart) });
const pct = (a, b) => ((b - a) / a * 100);
const sgn = (v, d = 2) => (v >= 0 ? '+' : '') + v.toFixed(d);
function span(ms) {
  ms = Math.abs(ms);
  const d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5), m = Math.round(ms % 36e5 / 6e4);
  const out = [];
  if (d) out.push(d + '일'); if (h) out.push(h + '시간'); if (m && !d) out.push(m + '분');
  return out.join(' ') || '0분';
}
const idxAt = (xAxis, c) => xAxis ? xAxis.convertFromPixel(c.x) : 0;
const barsBetween = (xAxis, c0, c1) => Math.round(idxAt(xAxis, c1) - idxAt(xAxis, c0));
// 점이 주변보다 높은 곳(고점)인지 → 라벨을 위에 붙일지
const isHigh = (c, i) => {
  const prev = c[i - 1], next = c[i + 1];
  if (prev && next) return c[i].y <= Math.min(prev.y, next.y) || (c[i].y < prev.y && c[i].y < next.y) || c[i].y < (prev.y + next.y) / 2;
  if (next) return c[i].y < next.y;
  if (prev) return c[i].y < prev.y;
  return true;
};
const ptLabel = (c, i, text, col) => { const hi = isHigh(c, i); return lbl(c[i].x, c[i].y + (hi ? -6 : 6), text, col, hi ? 'bottom' : 'top'); };

const reg = t => registerOverlay(Object.assign({ needDefaultPointFigure: true, needDefaultXAxisFigure: true, needDefaultYAxisFigure: true }, t));

// ═════ 선 ═════
reg({ // 정보선
  name: 'infoLine', totalStep: 3,
  createPointFigures: ({ coordinates: c, overlay: o, chart, xAxis }) => {
    if (c.length < 2) return [];
    const [p0, p1] = o.points, col = colOf(o);
    const ang = Math.atan2(-(c[1].y - c[0].y), c[1].x - c[0].x) * 180 / Math.PI;
    const t1 = `${sgn(p1.value - p0.value, precisionOf(chart))} (${sgn(pct(p0.value, p1.value))}%)`;
    const t2 = `${barsBetween(xAxis, c[0], c[1])}봉, ${span((p1.timestamp || 0) - (p0.timestamp || 0))}, ${ang.toFixed(1)}°`;
    const up = c[1].y < c[0].y;
    return [ln(c[0], c[1]),
      lbl(c[1].x + 8, c[1].y + (up ? -20 : 4), t1, col, 'top', 'left'),
      lbl(c[1].x + 8, c[1].y + (up ? -2 : 22), t2, col, 'top', 'left')];
  }
});
reg({ // 추세 각도
  name: 'trendAngle', totalStep: 3,
  createPointFigures: ({ coordinates: c, overlay: o }) => {
    if (c.length < 2) return [];
    const col = colOf(o);
    const ang = Math.atan2(-(c[1].y - c[0].y), c[1].x - c[0].x);
    const r = 40, dir = c[1].x >= c[0].x ? 1 : -1;
    return [ln(c[0], c[1]), dash(c[0], { x: c[0].x + dir * (r + 30), y: c[0].y }),
      { type: 'arc', ignoreEvent: true, attrs: { x: c[0].x, y: c[0].y, r, startAngle: Math.min(0, -ang), endAngle: Math.max(0, -ang) }, styles: { color: col, size: 1, style: 'solid' } },
      lbl(c[0].x + dir * (r + 34), c[0].y, `${(ang * 180 / Math.PI).toFixed(2)}°`, col, 'middle', dir > 0 ? 'left' : 'right')];
  }
});
reg({ // 화살표 선
  name: 'arrowLine', totalStep: 3,
  createPointFigures: ({ coordinates: c, overlay: o }) => c.length < 2 ? [] : [ln(c[0], c[1]), arrowHead(c[0], c[1], colOf(o), 8 + 2 * (stOf(o).size || 1))]
});
reg({ // 크로스 라인
  name: 'crossLine', totalStep: 2,
  createPointFigures: ({ coordinates: c, bounding }) => c.length < 1 ? [] : [
    ln({ x: 0, y: c[0].y }, { x: bounding.width, y: c[0].y }),
    ln({ x: c[0].x, y: 0 }, { x: c[0].x, y: bounding.height })]
});

// ═════ 채널 ═════
reg({ // 평행 채널
  name: 'parallelChannel', totalStep: 4,
  createPointFigures: ({ coordinates: c, overlay: o }) => {
    if (c.length < 2) return [];
    const figs = [ln(c[0], c[1])];
    if (c.length < 3) return figs;
    const slope = (c[1].y - c[0].y) / ((c[1].x - c[0].x) || 1e-9);
    const dy = c[2].y - (c[0].y + slope * (c[2].x - c[0].x));
    const a = { x: c[0].x, y: c[0].y + dy }, b = { x: c[1].x, y: c[1].y + dy };
    figs.unshift(fillPoly([c[0], c[1], b, a], o));
    figs.push(ln(a, b), dash(mid(c[0], a), mid(c[1], b), colOf(o)));
    return figs;
  },
  performEventMoveForDrawing: () => {}
});
reg({ // 회귀 추세 (선형회귀 ± 2 표준편차)
  name: 'regressionTrend', totalStep: 3,
  createPointFigures: ({ coordinates: c, overlay: o, chart, xAxis, yAxis }) => {
    if (c.length < 2 || !xAxis || !yAxis) return [];
    const list = chart.getDataList();
    const a0 = Math.round(xAxis.convertFromPixel(c[0].x)), a1 = Math.round(xAxis.convertFromPixel(c[1].x));
    let i0 = Math.min(a0, a1), i1 = Math.max(a0, a1);
    i0 = Math.max(0, i0); i1 = Math.min(list.length - 1, i1);
    if (i1 - i0 < 2) return [dash(c[0], c[1], colOf(o))];
    let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = i0; i <= i1; i++) { const y = list[i].close; n++; sx += i; sy += y; sxx += i * i; sxy += i * y; }
    const b = (n * sxy - sx * sy) / ((n * sxx - sx * sx) || 1e-9), a = (sy - b * sx) / n;
    let ss = 0; for (let i = i0; i <= i1; i++) { const r = list[i].close - (a + b * i); ss += r * r; }
    const sd = Math.sqrt(ss / n), k = 2;
    const P = (i, off) => ({ x: xAxis.convertToPixel(i), y: yAxis.convertToPixel(a + b * i + off) });
    const u0 = P(i0, k * sd), u1 = P(i1, k * sd), d0 = P(i0, -k * sd), d1 = P(i1, -k * sd);
    return [fillPoly([u0, u1, d1, d0], o), ln(u0, u1), ln(d0, d1), dash(P(i0, 0), P(i1, 0), colOf(o))];
  }
});
reg({ // 평탄 상단/하단
  name: 'flatTopBottom', totalStep: 4,
  createPointFigures: ({ coordinates: c, overlay: o }) => {
    if (c.length < 2) return [];
    const figs = [ln(c[0], c[1])];
    if (c.length < 3) return figs;
    const a = { x: c[0].x, y: c[2].y }, b = { x: c[1].x, y: c[2].y };
    figs.unshift(fillPoly([c[0], c[1], b, a], o));
    figs.push(ln(a, b));
    return figs;
  }
});
reg({ // 분리 채널
  name: 'disjointChannel', totalStep: 4,
  createPointFigures: ({ coordinates: c, overlay: o }) => {
    if (c.length < 2) return [];
    const figs = [ln(c[0], c[1])];
    if (c.length < 3) return figs;
    const a = { x: c[0].x, y: c[2].y }, b = { x: c[1].x, y: c[2].y - (c[1].y - c[0].y) };
    figs.unshift(fillPoly([c[0], c[1], b, a], o));
    figs.push(ln(a, b));
    return figs;
  }
});

// ═════ 패턴 (여러 점을 잇는 도형) ═════
// ratios: [점i, 점j(점선), [분자 a,b], [분모 c,d]] → |v[a]-v[b]| / |v[c]-v[d]|
function wave(name, n, labels, opt = {}) {
  reg({
    name, totalStep: n + 1, needDefaultXAxisFigure: false,
    createPointFigures: ({ coordinates: c, overlay: o }) => {
      const col = colOf(o), v = o.points.map(p => p.value), figs = [];
      (opt.fills || []).forEach(f => { if (f.every(i => c[i])) figs.push(fillPoly(f.map(i => c[i]), o)); });
      if (opt.closedFill && c.length >= 3) figs.push(fillPoly(c, o));
      for (let i = 0; i < c.length - 1; i++) figs.push(ln(c[i], c[i + 1]));
      (opt.ratios || []).forEach(([i, j, [a, b], [cc, d]]) => {
        if (!c[i] || !c[j] || [a, b, cc, d].some(k => v[k] == null || !c[k])) return;
        figs.push(dash(c[i], c[j], col));
        const den = Math.abs(v[cc] - v[d]);
        if (den > 0) { const m = mid(c[i], c[j]); figs.push(lbl(m.x, m.y, (Math.abs(v[a] - v[b]) / den).toFixed(3), hexA(col, 0.85), 'middle')); }
      });
      if (opt.extra) figs.push(...opt.extra(c, o, col));
      c.forEach((_, i) => { if (labels[i]) figs.push(ptLabel(c, i, labels[i], col)); });
      return figs;
    }
  });
}
wave('xabcd', 5, ['X', 'A', 'B', 'C', 'D'], { fills: [[0, 1, 2], [2, 3, 4]], ratios: [[0, 2, [1, 2], [0, 1]], [1, 3, [2, 3], [1, 2]], [2, 4, [3, 4], [2, 3]], [0, 4, [1, 4], [0, 1]]] });
wave('cypher', 5, ['X', 'A', 'B', 'C', 'D'], { fills: [[0, 1, 2], [2, 3, 4]], ratios: [[0, 2, [1, 2], [0, 1]], [1, 3, [2, 3], [0, 1]], [0, 4, [3, 4], [0, 3]]] });
wave('abcd', 4, ['A', 'B', 'C', 'D'], { ratios: [[0, 2, [1, 2], [0, 1]], [1, 3, [2, 3], [1, 2]]] });
wave('trianglePattern', 4, ['A', 'B', 'C', 'D'], { fills: [[0, 1, 2], [1, 2, 3]] });
wave('threeDrives', 7, ['', '드라이브1', 'A', '드라이브2', 'B', '드라이브3', ''], {
  ratios: [[1, 3, [2, 3], [1, 2]], [3, 5, [4, 5], [3, 4]], [2, 4, [3, 4], [2, 3]]]
});
wave('headShoulders', 7, ['', '왼쪽 어깨', '', '머리', '', '오른쪽 어깨', ''], {
  closedFill: true,
  extra: (c, o, col) => {
    if (!c[2] || !c[4]) return [];
    const s = (c[4].y - c[2].y) / ((c[4].x - c[2].x) || 1e-9);
    const x0 = c[0].x, x1 = (c[6] || c[4]).x;
    return [ln({ x: x0, y: c[2].y + s * (x0 - c[2].x) }, { x: x1, y: c[2].y + s * (x1 - c[2].x) }, { style: 'dashed', dashedValue: [6, 4], color: col, size: 1 }),
      lbl((x0 + x1) / 2, c[2].y + s * ((x0 + x1) / 2 - c[2].x) + 4, '넥라인', hexA(col, 0.85), 'top')];
  }
});
wave('elliottImpulse', 6, ['(0)', '(1)', '(2)', '(3)', '(4)', '(5)']);
wave('elliottCorrection', 4, ['(0)', '(A)', '(B)', '(C)']);
wave('elliottTriangle', 6, ['(0)', '(A)', '(B)', '(C)', '(D)', '(E)']);
wave('elliottDoubleCombo', 4, ['(0)', '(W)', '(X)', '(Y)']);
wave('elliottTripleCombo', 6, ['(0)', '(W)', '(X)', '(Y)', '(X)', '(Z)']);

// ═════ 예측·측정 ═════
reg({ // 예측
  name: 'forecast', totalStep: 3,
  createPointFigures: ({ coordinates: c, overlay: o, chart, xAxis }) => {
    if (c.length < 2) return [];
    const [p0, p1] = o.points, col = colOf(o), up = p1.value >= p0.value;
    const bg = up ? '#089981' : '#f23645';
    return [ln(c[0], c[1], { style: 'dashed', dashedValue: [6, 4] }), arrowHead(c[0], c[1], col),
      { type: 'circle', attrs: { x: c[0].x, y: c[0].y, r: 4 }, styles: { style: 'fill', color: col } },
      lbl(c[1].x, c[1].y + (up ? -10 : 10), `${sgn(pct(p0.value, p1.value))}%  ${fmtP(chart, p1.value)}`, bg, up ? 'bottom' : 'top'),
      lbl(c[1].x, c[1].y + (up ? -30 : 30), `${barsBetween(xAxis, c[0], c[1])}봉 · ${span((p1.timestamp || 0) - (p0.timestamp || 0))}`, hexA(col, 0.9), up ? 'bottom' : 'top')];
  }
});
function rangeTool(name, kind) {
  reg({
    name, totalStep: 3,
    createPointFigures: ({ coordinates: c, overlay: o, chart, xAxis }) => {
      if (c.length < 2) return [];
      const [p0, p1] = o.points, col = colOf(o);
      const x0 = Math.min(c[0].x, c[1].x), x1 = Math.max(c[0].x, c[1].x), y0 = Math.min(c[0].y, c[1].y), y1 = Math.max(c[0].y, c[1].y);
      const figs = [fillPoly([{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], o)];
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      const texts = [];
      if (kind !== 'date') {
        figs.push(ln(c[0].y === y0 ? { x: x0, y: y0 } : { x: x0, y: y1 }, c[0].y === y0 ? { x: x1, y: y0 } : { x: x1, y: y1 }, { size: 1 }));
        figs.push(ln({ x: mx, y: c[0].y }, { x: mx, y: c[1].y }), arrowHead({ x: mx, y: c[0].y }, { x: mx, y: c[1].y }, col, 8));
        texts.push(`${sgn(p1.value - p0.value, precisionOf(chart))} (${sgn(pct(p0.value, p1.value))}%)`);
      }
      if (kind !== 'price') {
        figs.push(ln({ x: c[0].x, y: my }, { x: c[1].x, y: my }), arrowHead({ x: c[0].x, y: my }, { x: c[1].x, y: my }, col, 8));
        texts.push(`${barsBetween(xAxis, c[0], c[1])}봉, ${span((p1.timestamp || 0) - (p0.timestamp || 0))}`);
      }
      const down = c[1].y > c[0].y;
      const ty = kind === 'date' ? y1 + 6 : (down ? y1 + 6 : y0 - 6);
      const base = kind === 'date' || down ? 'top' : 'bottom';
      if (texts.length === 2) { figs.push(lbl(mx, ty, texts[0], col, base)); figs.push(lbl(mx, ty + (base === 'top' ? 20 : -20), texts[1], col, base)); }
      else figs.push(lbl(mx, ty, texts[0], col, base));
      return figs;
    }
  });
}
rangeTool('priceRange', 'price');
rangeTool('dateRange', 'date');
rangeTool('datePriceRange', 'both');

// 롱/숏 포지션: 진입 → 목표 → 손절
const position = (name, isLong) => ({
  name, totalStep: 4, needDefaultPointFigure: true, needDefaultXAxisFigure: false, needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates: c, overlay }) => {
    if (c.length < 2) return [];
    const p = overlay.points;
    const entry = p[0].value, target = p[1].value;
    let stop, yStop;
    if (c.length >= 3 && p[2] && p[2].value != null) { stop = p[2].value; yStop = c[2].y; }
    else { stop = entry - (target - entry) / 2; yStop = c[0].y + (c[0].y - c[1].y) / 2; }
    const x = Math.min(c[0].x, c[1].x), w = Math.max(Math.abs(c[1].x - c[0].x), 2);
    const box = (y1, y2, col) => ({ type: 'polygon', attrs: { coordinates: [{ x, y: y1 }, { x: x + w, y: y1 }, { x: x + w, y: y2 }, { x, y: y2 }] }, styles: { style: 'fill', color: col } });
    const rr = Math.abs(target - entry) / Math.max(Math.abs(entry - stop), 1e-12);
    const goodUp = c[1].y < c[0].y;
    return [
      box(c[0].y, c[1].y, 'rgba(38,166,154,0.22)'),
      box(c[0].y, yStop, 'rgba(239,83,80,0.22)'),
      { type: 'line', attrs: { coordinates: [{ x, y: c[0].y }, { x: x + w, y: c[0].y }] }, styles: { color: '#9598a1', size: 1, style: 'solid' } },
      lbl(x + w / 2, c[1].y + (goodUp ? -4 : 4), `목표 ${sgn(pct(entry, target))}%`, '#26a69a', goodUp ? 'bottom' : 'top'),
      lbl(x + w / 2, yStop + (goodUp ? 4 : -4), `손절 ${sgn(pct(entry, stop))}%`, '#ef5350', goodUp ? 'top' : 'bottom'),
      lbl(x + w / 2, c[0].y, `${isLong ? '롱' : '숏'}  손익비 1:${rr.toFixed(2)}`, '#5d606b', 'middle')
    ];
  },
  performEventMoveForDrawing: ({ currentStep, points, performPoint }) => {
    if (currentStep === 3) { performPoint.timestamp = points[0].timestamp; performPoint.dataIndex = points[0].dataIndex; }
  },
  performEventPressedMove: ({ points, performPointIndex, performPoint }) => {
    if (performPointIndex === 2) { performPoint.timestamp = points[0].timestamp; performPoint.dataIndex = points[0].dataIndex; }
    if (performPointIndex === 0 && points[2]) { points[2].timestamp = points[0].timestamp; points[2].dataIndex = points[0].dataIndex; }
  }
});
registerOverlay(position('longPosition', true));
registerOverlay(position('shortPosition', false));

// ═════ 도형 ═════
reg({
  name: 'rectBox', totalStep: 3,
  createPointFigures: ({ coordinates: c }) => c.length < 2 ? [] : [{
    type: 'polygon', attrs: { coordinates: [c[0], { x: c[1].x, y: c[0].y }, c[1], { x: c[0].x, y: c[1].y }] }, styles: { style: 'stroke_fill' }
  }]
});

// ═════ 툴바 구성 ═════
const I = d => `<svg viewBox="0 0 24 24">${d}</svg>`;
const dot = (x, y) => `<circle cx="${x}" cy="${y}" r="1.8"/>`;
const ICONS = {
  segment: I(`<path d="M5 19L19 5"/>${dot(5, 19)}${dot(19, 5)}`),
  rayLine: I(`<path d="M5 19L22 2"/>${dot(5, 19)}${dot(12, 12)}`),
  straightLine: I(`<path d="M2 22L22 2"/>${dot(8, 16)}${dot(16, 8)}`),
  infoLine: I(`<path d="M4 20L14 8"/>${dot(4, 20)}${dot(14, 8)}<rect x="15" y="3" width="7" height="6" rx="1"/>`),
  trendAngle: I(`<path d="M4 18L19 6M4 18h16"/><path d="M11 18a7 7 0 00-1.5-4.5"/>`),
  arrowLine: I(`<path d="M5 19L18 6M18 6h-6M18 6v6"/>`),
  horizontalStraightLine: I(`<path d="M2 12h20"/>${dot(12, 12)}`),
  horizontalRayLine: I(`<path d="M8 12h14"/>${dot(7, 12)}`),
  verticalStraightLine: I(`<path d="M12 2v20"/>${dot(12, 12)}`),
  crossLine: I(`<path d="M2 12h20M12 2v20"/>${dot(12, 12)}`),
  parallelChannel: I(`<path d="M3 15L15 5M9 20L21 10"/><path d="M6 17.5L18 7.5" stroke-dasharray="2 2"/>`),
  regressionTrend: I(`<path d="M3 13L21 7M3 19L21 13M3 7L21 1" /><circle cx="7" cy="11" r="1"/><circle cx="12" cy="10" r="1"/><circle cx="16" cy="8" r="1"/>`),
  flatTopBottom: I(`<path d="M3 18L21 8M3 6h18"/>`),
  disjointChannel: I(`<path d="M3 16L21 6M3 8L21 18"/>`),
  fibonacciLine: I(`<path d="M3 5h18M3 10h18M3 14h18M3 19h18" stroke-dasharray="2 2"/><path d="M5 19L19 5"/>`),
  xabcd: I(`<path d="M2 18L7 6L11 14L16 4L22 16"/><path d="M2 18L11 14" stroke-dasharray="2 2"/>`),
  cypher: I(`<path d="M2 16L7 7L11 12L16 3L22 14"/><text x="2" y="23" font-size="7" stroke="none" fill="currentColor">C</text>`),
  abcd: I(`<path d="M3 18L9 6L15 13L21 4"/><path d="M3 18L15 13" stroke-dasharray="2 2"/>`),
  trianglePattern: I(`<path d="M3 6L9 18L15 8L21 15"/><path d="M3 6L15 8M9 18L21 15" stroke-dasharray="2 2"/>`),
  threeDrives: I(`<path d="M2 20L5 14L8 16L12 9L15 11L19 3L22 6"/>`),
  headShoulders: I(`<path d="M2 18L6 10L9 14L12 4L15 14L18 10L22 18"/><path d="M5 14h15" stroke-dasharray="2 2"/>`),
  elliottImpulse: I(`<path d="M2 20L6 12L9 15L15 5L18 9L22 3"/>`),
  elliottCorrection: I(`<path d="M3 5L9 17L14 10L21 20"/>`),
  elliottTriangle: I(`<path d="M2 4L6 18L10 7L14 15L18 9L22 13"/>`),
  elliottDoubleCombo: I(`<path d="M3 5L10 15L14 9L21 19"/><text x="15" y="7" font-size="7" stroke="none" fill="currentColor">W</text>`),
  elliottTripleCombo: I(`<path d="M2 4L6 12L9 8L13 16L16 11L22 20"/>`),
  longPosition: I(`<rect x="5" y="4" width="14" height="8" fill="rgba(38,166,154,.45)" stroke="none"/><rect x="5" y="12" width="14" height="6" fill="rgba(239,83,80,.45)" stroke="none"/><path d="M5 12h14"/>`),
  shortPosition: I(`<rect x="5" y="6" width="14" height="6" fill="rgba(239,83,80,.45)" stroke="none"/><rect x="5" y="12" width="14" height="8" fill="rgba(38,166,154,.45)" stroke="none"/><path d="M5 12h14"/>`),
  forecast: I(`<path d="M4 18L18 6" stroke-dasharray="3 2"/><circle cx="4" cy="18" r="2"/><path d="M18 6h-5M18 6v5"/>`),
  priceRange: I(`<rect x="5" y="4" width="14" height="16" stroke-dasharray="2 2"/><path d="M12 18V6M9 9l3-3 3 3"/>`),
  dateRange: I(`<rect x="4" y="5" width="16" height="14" stroke-dasharray="2 2"/><path d="M6 12h12M15 9l3 3-3 3"/>`),
  datePriceRange: I(`<rect x="4" y="4" width="16" height="16" stroke-dasharray="2 2"/><path d="M12 18V7M6 12h11"/>`),
  rectBox: I(`<rect x="4" y="6" width="16" height="12" rx="1"/>`),
  brush: I(`<path d="M4 18c3-1 4-6 7-6s3 5 6 4 3-6 3-6"/>`)
};
const NAMES = {
  segment: '추세선', rayLine: '레이', straightLine: '확장선', infoLine: '정보선', trendAngle: '추세 각도', arrowLine: '화살표 선',
  horizontalStraightLine: '수평선', horizontalRayLine: '수평 레이', verticalStraightLine: '수직선', crossLine: '크로스 라인',
  parallelChannel: '평행 채널', regressionTrend: '회귀 추세', flatTopBottom: '평탄 상단/하단', disjointChannel: '분리 채널',
  fibonacciLine: '피보나치 되돌림',
  xabcd: 'XABCD 패턴', cypher: '사이퍼 패턴', abcd: 'ABCD 패턴', trianglePattern: '삼각형 패턴', threeDrives: '쓰리 드라이브 패턴', headShoulders: '헤드 앤 숄더',
  elliottImpulse: '엘리엇 충격파 (12345)', elliottCorrection: '엘리엇 조정파 (ABC)', elliottTriangle: '엘리엇 삼각형 (ABCDE)', elliottDoubleCombo: '엘리엇 이중 조합 (WXY)', elliottTripleCombo: '엘리엇 삼중 조합 (WXYXZ)',
  longPosition: '롱 포지션', shortPosition: '숏 포지션', forecast: '예측',
  priceRange: '가격 범위', dateRange: '날짜 범위', datePriceRange: '날짜·가격 범위',
  rectBox: '사각형', brush: '펜'
};
const HINTS = {
  longPosition: '진입 → 목표 → 손절 순서로 클릭', shortPosition: '진입 → 목표 → 손절 순서로 클릭',
  parallelChannel: '두 점으로 선을 긋고, 세 번째 점으로 폭 지정', flatTopBottom: '두 점으로 선, 세 번째 점으로 평탄선 높이',
  disjointChannel: '두 점으로 선, 세 번째 점으로 반대쪽 시작', regressionTrend: '시작 봉과 끝 봉을 클릭',
  xabcd: 'X → A → B → C → D 순서로 5번 클릭', cypher: 'X → A → B → C → D 순서로 5번 클릭', abcd: 'A → B → C → D 4번 클릭',
  trianglePattern: 'A → B → C → D 4번 클릭', threeDrives: '7번 클릭', headShoulders: '7번 클릭 (시작-어깨-골-머리-골-어깨-끝)',
  elliottImpulse: '0 → 1 → 2 → 3 → 4 → 5 순서로 6번 클릭', elliottCorrection: '0 → A → B → C 4번 클릭', elliottTriangle: '6번 클릭',
  elliottDoubleCombo: '4번 클릭', elliottTripleCombo: '6번 클릭', brush: '누른 채로 드래그해서 그리기'
};
const SHORTCUTS = { segment: 'Alt+T', horizontalStraightLine: 'Alt+H', horizontalRayLine: 'Alt+J', verticalStraightLine: 'Alt+V', crossLine: 'Alt+C', fibonacciLine: 'Alt+F', rectBox: 'Alt+R' };
const GROUPS = [
  { id: 'lines', title: '선', tools: ['segment', 'rayLine', 'straightLine', 'infoLine', 'trendAngle', 'arrowLine', 'horizontalStraightLine', 'horizontalRayLine', 'verticalStraightLine', 'crossLine'] },
  { id: 'channels', title: '채널', tools: ['parallelChannel', 'regressionTrend', 'flatTopBottom', 'disjointChannel'] },
  { id: 'fib', title: '피보나치', tools: ['fibonacciLine'] },
  { id: 'patterns', title: '패턴', tools: ['xabcd', 'cypher', 'abcd', 'trianglePattern', 'threeDrives', 'headShoulders'] },
  { id: 'elliott', title: '엘리엇 파동', tools: ['elliottImpulse', 'elliottCorrection', 'elliottTriangle', 'elliottDoubleCombo', 'elliottTripleCombo'] },
  { id: 'predict', title: '예측', tools: ['longPosition', 'shortPosition', 'forecast'] },
  { id: 'measure', title: '측정', tools: ['priceRange', 'dateRange', 'datePriceRange'] },
  { id: 'shapes', title: '도형·펜', tools: ['rectBox', 'brush'] }
];
// 채우기(배경) 투명도를 바꿀 수 있는 도구
const FILLABLE = ['rectBox', 'parallelChannel', 'regressionTrend', 'flatTopBottom', 'disjointChannel', 'xabcd', 'cypher', 'trianglePattern', 'headShoulders', 'priceRange', 'dateRange', 'datePriceRange'];
const NO_STYLE = ['longPosition', 'shortPosition'];
// 도구별 기본 스타일
const DEFAULT_STYLE = { color: '#2962ff', size: 1, line: 'solid', fill: 0.15 };
const TOOL_DEFAULTS = {
  horizontalStraightLine: { color: '#ff9800' }, horizontalRayLine: { color: '#ff9800' }, verticalStraightLine: { color: '#9c27b0' },
  crossLine: { color: '#787b86' }, xabcd: { color: '#2962ff', fill: 0.12 }, cypher: { color: '#00bcd4', fill: 0.12 }, abcd: { color: '#089981' },
  trianglePattern: { color: '#9c27b0', fill: 0.12 }, headShoulders: { color: '#089981', fill: 0.1 }, threeDrives: { color: '#f7c948' },
  elliottImpulse: { color: '#2962ff' }, elliottCorrection: { color: '#f23645' }, elliottTriangle: { color: '#ff9800' },
  elliottDoubleCombo: { color: '#089981' }, elliottTripleCombo: { color: '#9c27b0' },
  forecast: { color: '#2962ff' }, priceRange: { color: '#2962ff', fill: 0.12 }, dateRange: { color: '#2962ff', fill: 0.12 }, datePriceRange: { color: '#2962ff', fill: 0.12 },
  regressionTrend: { color: '#2962ff', fill: 0.08 }, parallelChannel: { color: '#2962ff', fill: 0.1 }
};

window.TOOLKIT = { ICONS, NAMES, HINTS, SHORTCUTS, GROUPS, FILLABLE, NO_STYLE, DEFAULT_STYLE, TOOL_DEFAULTS, hexA };
})();
