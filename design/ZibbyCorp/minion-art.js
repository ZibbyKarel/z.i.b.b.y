/* Vector minion art — shared by Minion Crew Concepts and Floor Dashboard. Usage: const MA = window.MinionArt(React); */
window.MinionArt = function (React) {
// ---------- Turn 2 · vector ----------
const h2 = (...a) => React.createElement(...a);
const K = '#111312';
const SH = { working:'#1F9D6E', thinking:'#3F7FC4', blocked:'#D9952B', error:'#D0453F', done:'#8F5BC2', idle:'#A9ADA7' };
const VSKIN = ['#F6D03C', '#F0C22E', '#F9DC62'], DEN = '#3F6EA3', DEN2 = '#2C4F7A', MET = '#B5BAB3', MET2 = '#7A7F78';
const ORD = ['working','thinking','blocked','error','done','idle'];
const A = (anim, origin) => ({ animation: anim, transformBox: origin ? 'view-box' : 'fill-box', transformOrigin: origin || 'center' });

function arm(k, sx, sy, hx, hy, out, skin) {
  const c = `${sx + out} ${(sy + hy) / 2}`, d = `M${sx} ${sy} Q${c} ${hx} ${hy}`;
  return [h2('path', { key: k + 'o', d, stroke: K, strokeWidth: 8, fill: 'none', strokeLinecap: 'round' }), h2('path', { key: k + 'i', d, stroke: skin, strokeWidth: 4.6, fill: 'none', strokeLinecap: 'round' }), h2('circle', { key: k + 'g', cx: hx, cy: hy, r: 4.8, fill: K })];
}

function extras(st, x, y, w, S, k) {
  const E = [];
  if (st === 'thinking') [[x + w + 3, y + 4, 2.2], [x + w + 9, y - 3, 3.2], [x + w + 17, y - 12, 4.6]].forEach(([a, b, r], i) => E.push(h2('circle', { key: k + 't' + i, cx: a, cy: b, r, fill: S, style: A(`mv-pulse 1.4s ${i * .25}s ease-in-out infinite`) })));
  if (st === 'blocked') E.push(h2('g', { key: k + 'b', style: A('mv-blink 1s steps(1,end) infinite') }, h2('circle', { cx: x + w + 16, cy: y - 10, r: 9, fill: S, stroke: K, strokeWidth: 2 }), h2('rect', { x: x + w + 14.6, y: y - 16, width: 2.8, height: 7.5, rx: 1.2, fill: '#fff' }), h2('circle', { cx: x + w + 16, cy: y - 5.6, r: 1.6, fill: '#fff' })));
  if (st === 'error') {
    const mx = x + w / 2, mb = y + 1, star = [...Array(16)].map((_, i) => { const a = i / 16 * Math.PI * 2, rr = i % 2 ? 9 : 19; return `${(mx + Math.cos(a) * rr).toFixed(1)},${(mb - 16 + Math.sin(a) * rr * .8).toFixed(1)}`; }).join(' ');
    E.push(h2('polygon', { key: k + 'fx', points: star, fill: S + '66', style: A('mv-blink .5s steps(1,end) infinite') }));
    E.push(h2('path', { key: k + 'stem', d: `M${mx - 3.5} ${mb} Q${mx - 2} ${mb - 7} ${mx - 3} ${mb - 13} H${mx + 3} Q${mx + 2} ${mb - 7} ${mx + 3.5} ${mb} Z`, fill: '#D9DBD6', stroke: K, strokeWidth: 1.8 }));
    E.push(h2('ellipse', { key: k + 'ring', cx: mx, cy: mb - 8, rx: 7, ry: 2.2, fill: '#BFC2BC', stroke: K, strokeWidth: 1.6 }));
    E.push(h2('g', { key: k + 'cap', style: A('mv-boom 1.2s ease-in-out infinite', `${mx}px ${mb - 18}px`) },
      ...[[-8, -17, 6], [8, -17, 6], [-4, -22, 7], [4, -22, 7], [0, -17, 7]].map(([dx, dy, r], i) => h2('circle', { key: i, cx: mx + dx, cy: mb + dy, r, fill: '#D9DBD6', stroke: K, strokeWidth: 1.8 })),
      h2('path', { d: `M${mx - 12} ${mb - 15} Q${mx} ${mb - 10} ${mx + 12} ${mb - 15}`, fill: 'none', stroke: S, strokeWidth: 2.4, strokeLinecap: 'round' }),
      h2('circle', { cx: mx, cy: mb - 19, r: 3, fill: S })));
    [[x + w * .22, y + 13, 2.2], [x + w * .74, y + 10, 1.8]].forEach(([a, b, r], i) => E.push(h2('circle', { key: k + 'soot' + i, cx: a, cy: b, r, fill: 'rgba(17,19,18,.55)' })));
  }
  if (st === 'done') { E.push(h2('g', { key: k + 'd' }, h2('circle', { cx: x - 12, cy: y - 6, r: 9, fill: S, stroke: K, strokeWidth: 2 }), h2('path', { d: `M${x - 16} ${y - 6} l3 3 6 -6`, stroke: '#fff', strokeWidth: 2.6, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' })));
    [[x + w + 6, y - 4, S], [x + w + 14, y + 4, K], [x + w + 2, y - 14, K], [x + w + 12, y - 12, S]].forEach(([a, b, c], i) => E.push(h2('rect', { key: k + 'c' + i, x: a, y: b, width: 3.5, height: 3.5, fill: c, transform: `rotate(${i * 30} ${a} ${b})` }))); }
  if (st === 'idle') [[x + w + 4, y + 6, 9], [x + w + 12, y - 4, 12]].forEach(([a, b, s], i) => E.push(h2('text', { key: k + 'z' + i, x: a, y: b, fontSize: s, fontFamily: 'Geist Mono, monospace', fontWeight: 600, fill: '#8A8E88', style: A(`mv-pulse 2.4s ${i * .6}s ease-in-out infinite`) }, 'z')));
  return E;
}

function vMinion(o) {
  const k = o.key || 'm', st = o.state || 'working', S = SH[st], skin = o.skin || VSKIN[0];
  const suit = o.suit === 'state' ? S : (o.suit || DEN), suit2 = o.suit === 'state' ? 'rgba(17,19,18,.28)' : DEN2;
  const w = o.w || 44, H = o.h || 56, cx = o.cx ?? 50, gy = o.gy ?? (o.jet ? 94 : 104), x = cx - w / 2, y = gy - H, r = w / 2;
  const two = o.eyes === 2, R = two ? Math.min(11, w / 4.2) : Math.min(13, H * .22);
  const eyeY = y + Math.max(R + 4, H * .28), my = eyeY + R + 6, ovTop = gy - H * .26, bibTop = Math.max(my + 5, ovTop - 9), shY = bibTop - 1;
  const E = [];
  if (o.ring) { E.push(h2('circle', { key: k + 'rp', cx, cy: 70, r: 50, fill: 'none', stroke: S, strokeWidth: 3, style: A('mv-ring 1.6s ease-out infinite', '50px 70px') })); E.push(h2('circle', { key: k + 'r', cx, cy: 70, r: 50, fill: '#FAFAF8', stroke: S, strokeWidth: 8 })); }
  if (!o.noFloor) E.push(h2('ellipse', { key: k + 'fl', cx, cy: gy + 9, rx: o.jet ? w * .5 : w * .78, ry: o.jet ? 3 : 4.5, fill: o.jet ? 'rgba(17,19,18,.12)' : S + '55' }));
  if (o.jet) [x - 6, x + w - 3].forEach((jx, i) => { E.push(h2('path', { key: k + 'f' + i, d: `M${jx + 1} ${y + H * .38 + 26} q3.5 ${16} 7 0 z`, fill: S, stroke: K, strokeWidth: 1.6, style: A('mv-flick .35s ease-in-out infinite alternate', `${jx + 4.5}px ${y + H * .38 + 26}px`) }));
    E.push(h2('rect', { key: k + 'j' + i, x: jx, y: y + H * .38, width: 9, height: 27, rx: 4, fill: MET, stroke: K, strokeWidth: 2 })); });
  const legs = s => [h2('rect', { key: k + 'l' + s, x: s ? cx + 4 : cx - 12, y: gy - 3, width: 8, height: 8, fill: suit, stroke: K, strokeWidth: 2 }), h2('ellipse', { key: k + 's' + s, cx: s ? cx + 10 : cx - 10, cy: gy + 6, rx: 7.5, ry: 3.8, fill: K })];
  if (o.march) [0, 1].forEach(s => E.push(h2('g', { key: k + 'lg' + s }, ...legs(s), AT('translate', s ? '0 0;0 0;0 0;0 -4;0 0' : '0 0;0 -4;0 0;0 0;0 0', o.march, { begin: o.begin }))));
  else E.push(...legs(0), ...legs(1));
  const cid = 'cl' + k;
  E.push(h2('defs', { key: k + 'df' }, h2('clipPath', { id: cid }, h2('rect', { x, y, width: w, height: H, rx: r }))));
  E.push(h2('g', { key: k + 'bd', clipPath: `url(#${cid})` },
    h2('rect', { x, y, width: w, height: H, fill: skin }),
    h2('rect', { x: x + w * .62, y, width: w * .38, height: H, fill: 'rgba(17,19,18,.06)' }),
    h2('rect', { x, y: ovTop, width: w, height: H, fill: suit }),
    h2('rect', { x, y: eyeY - 3.5, width: w, height: 7, fill: K })));
  E.push(h2('rect', { key: k + 'ol', x, y, width: w, height: H, rx: r, fill: 'none', stroke: K, strokeWidth: 2.6 }));
  if (bibTop < ovTop - 2) { E.push(h2('rect', { key: k + 'bib', x: cx - w * .3, y: bibTop, width: w * .6, height: ovTop - bibTop + 2, fill: suit }));
    E.push(h2('path', { key: k + 'bo', d: `M${cx - w * .3} ${ovTop} V${bibTop} H${cx + w * .3} V${ovTop}`, fill: 'none', stroke: K, strokeWidth: 1.6 }));
    E.push(h2('line', { key: k + 'st1', x1: cx - w * .3, y1: bibTop + 1, x2: x + 1.5, y2: bibTop - 7, stroke: suit, strokeWidth: 3.5 })); E.push(h2('line', { key: k + 'st2', x1: cx + w * .3, y1: bibTop + 1, x2: x + w - 1.5, y2: bibTop - 7, stroke: suit, strokeWidth: 3.5 }));
    E.push(h2('rect', { key: k + 'pk', x: cx - 5, y: bibTop + (ovTop - bibTop) * .35, width: 10, height: 6, rx: 1.5, fill: suit2 })); }
  E.push(h2('line', { key: k + 'ovl', x1: x + 1, y1: ovTop, x2: x + w - 1, y2: ovTop, stroke: K, strokeWidth: 1.6 }));
  // goggles
  const exs = two ? [cx - R - .5, cx + R + .5] : [cx];
  const est = o.eyeSt || st, mst = o.mouthSt || st;
  const look = o.look || { working: [0, 2.5], thinking: [3, -3.5], blocked: [0, 0], error: [0, 0], done: [0, 0], idle: [0, 0] }[est];
  exs.forEach((ex, i) => {
    const ri = R - 3.6;
    E.push(h2('circle', { key: k + 'gr' + i, cx: ex, cy: eyeY, r: R, fill: o.lens ? S : MET, stroke: K, strokeWidth: 2.4 }));
    E.push(h2('circle', { key: k + 'gw' + i, cx: ex, cy: eyeY, r: ri, fill: '#fff', stroke: K, strokeWidth: 1.4 }));
    if (o.lens) E.push(h2('circle', { key: k + 'gt' + i, cx: ex, cy: eyeY, r: ri, fill: S + '66', style: A('mv-pulse 2s ease-in-out infinite') }));
    if (est === 'done') E.push(h2('path', { key: k + 'ec' + i, d: `M${ex - ri * .55} ${eyeY + 1.5} Q${ex} ${eyeY - ri * .7} ${ex + ri * .55} ${eyeY + 1.5}`, stroke: K, strokeWidth: 2.4, fill: 'none', strokeLinecap: 'round' }));
    else if (est === 'idle') { E.push(h2('path', { key: k + 'el' + i, d: `M${ex - ri} ${eyeY} A${ri} ${ri} 0 0 1 ${ex + ri} ${eyeY} Z`, fill: skin, stroke: K, strokeWidth: 1.4 })); E.push(h2('line', { key: k + 'ell' + i, x1: ex - ri * .6, y1: eyeY + 1.5, x2: ex + ri * .6, y2: eyeY + 1.5, stroke: K, strokeWidth: 2, strokeLinecap: 'round' })); }
    else if (est === 'error') { const q = ri * .45; E.push(h2('path', { key: k + 'ex' + i, d: `M${ex - q} ${eyeY - q} L${ex + q} ${eyeY + q} M${ex + q} ${eyeY - q} L${ex - q} ${eyeY + q}`, stroke: K, strokeWidth: 2.4, strokeLinecap: 'round' })); }
    else { const pr = Math.max(2.6, ri * .36); E.push(h2('circle', { key: k + 'p' + i, cx: ex + look[0] * ri / 8, cy: eyeY + look[1] * ri / 8, r: pr, fill: K })); E.push(h2('circle', { key: k + 'ph' + i, cx: ex + look[0] * ri / 8 - pr * .35, cy: eyeY + look[1] * ri / 8 - pr * .35, r: pr * .3, fill: '#fff' }));
      if (est === 'blocked') E.push(h2('path', { key: k + 'lid' + i, d: `M${ex - ri} ${eyeY - .5} A${ri} ${ri} 0 0 1 ${ex + ri} ${eyeY - .5} Z`, fill: skin, stroke: K, strokeWidth: 1.4 })); }
  });
  // mouth
  const M = { working: `M${cx - 5} ${my} Q${cx} ${my + 3} ${cx + 5} ${my}`, thinking: null, blocked: `M${cx - 5} ${my + 1} L${cx + 5} ${my + 1}`, error: `M${cx - 7} ${my + 1} l3.5 -2.5 3.5 2.5 3.5 -2.5 3.5 2.5`, done: null, idle: `M${cx - 3} ${my} Q${cx} ${my + 2} ${cx + 3} ${my}` }[mst] || '';
  if (mst === 'thinking') E.push(h2('ellipse', { key: k + 'mo', cx: cx + 3, cy: my + 1, rx: 2.2, ry: 2.6, fill: K }));
  else if (mst === 'done') { E.push(h2('path', { key: k + 'mo', d: `M${cx - 8} ${my - 1} Q${cx} ${my + 10} ${cx + 8} ${my - 1} Z`, fill: K })); E.push(h2('path', { key: k + 'mt', d: `M${cx - 6} ${my} H${cx + 6} V${my + 1.8} H${cx - 6} Z`, fill: '#fff' })); }
  else if (mst !== 'none') E.push(h2('path', { key: k + 'mo', d: M, stroke: K, strokeWidth: 2.2, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }));
  if (o.stache) E.push(h2('path', { key: k + 'sh', d: `M${cx} ${my - 3.5} q-5 -4 -10 -.5 q-2 1.5 -4 1 q3 4.5 8 2.5 q4 -1 6 -3 q2 2 6 3 q5 2 8 -2.5 q-2 .5 -4 -1 q-5 -3.5 -10 .5 z`, fill: K }));
  // hair
  const HR = { tuft: `M${cx} ${y + 1} q-2 -8 -7 -10 M${cx} ${y + 1} q1 -9 6 -11 M${cx} ${y + 1} q0 -6 -1 -10`, spikes: [-9, -3, 3, 9].map(d => `M${cx + d} ${y + 1.5 + Math.abs(d) * .25} l${d * .25} -8`).join(' '), sprout: `M${cx} ${y + 1} q3 -10 9 -12`, strands: `M${cx - 6} ${y + 1.5} q-3 -6 0 -10 M${cx} ${y + .5} q3 -6 0 -11 M${cx + 6} ${y + 1.5} q3 -6 0 -10` }[o.hair];
  if (HR && !o.hat) E.push(h2('path', { key: k + 'hr', d: HR, stroke: K, strokeWidth: 2, fill: 'none', strokeLinecap: 'round' }));
  if (o.hat === 'headphones') { E.push(h2('path', { key: k + 'hb', d: `M${x - 1} ${y + r} A${r + 3} ${r + 3} 0 0 1 ${x + w + 1} ${y + r}`, stroke: K, strokeWidth: 4, fill: 'none' }));
    E.push(h2('rect', { key: k + 'hc1', x: x - 5, y: y + r - 6, width: 8, height: 13, rx: 3, fill: K })); E.push(h2('rect', { key: k + 'hc2', x: x + w - 3, y: y + r - 6, width: 8, height: 13, rx: 3, fill: K })); }
  if (o.hat === 'hardhat') { if (o.beacon) { E.push(h2('g', { key: k + 'ray', style: A('mv-spin 2.6s linear infinite', `${cx}px ${y - 16}px`) },
        h2('path', { d: `M${cx} ${y - 16} L${cx - 46} ${y - 32} L${cx - 46} ${y} Z`, fill: S + '55' }), h2('path', { d: `M${cx} ${y - 16} L${cx + 46} ${y - 32} L${cx + 46} ${y} Z`, fill: S + '55' })));
      E.push(h2('circle', { key: k + 'bg', cx, cy: y - 15, r: 11, fill: S + '44', style: A('mv-pulse 1.2s ease-in-out infinite') })); }
    E.push(h2('path', { key: k + 'hh', d: `M${x - 1} ${y + 10} Q${x - 1} ${y - 6} ${cx} ${y - 7} Q${x + w + 1} ${y - 6} ${x + w + 1} ${y + 10} Z`, fill: '#F2F2EE', stroke: K, strokeWidth: 2.4 }));
    E.push(h2('rect', { key: k + 'hbr', x: x - 6, y: y + 7, width: w + 12, height: 5, rx: 2, fill: '#F2F2EE', stroke: K, strokeWidth: 2.4 }));
    if (o.beacon) { E.push(h2('rect', { key: k + 'bb', x: cx - 6, y: y - 10, width: 12, height: 4, fill: K })); E.push(h2('path', { key: k + 'bd2', d: `M${cx - 5} ${y - 10} A5 6 0 0 1 ${cx + 5} ${y - 10} Z`, fill: S, stroke: K, strokeWidth: 1.8 })); }
    else E.push(h2('line', { key: k + 'hr2', x1: cx, y1: y - 6, x2: cx, y2: y + 7, stroke: K, strokeWidth: 1.6 })); }
  if (o.hat === 'beanie') { E.push(h2('path', { key: k + 'bn', d: `M${x + 1} ${y + 9} Q${x + 1} ${y - 5} ${cx} ${y - 5} Q${x + w - 1} ${y - 5} ${x + w - 1} ${y + 9} Z`, fill: MET2, stroke: K, strokeWidth: 2.4 }));
    E.push(h2('rect', { key: k + 'bnb', x: x, y: y + 6, width: w, height: 6, rx: 2, fill: K })); E.push(h2('circle', { key: k + 'bnp', cx, cy: y - 7, r: 4, fill: MET, stroke: K, strokeWidth: 2 })); }
  if (o.tie && bibTop < ovTop - 2) E.push(h2('path', { key: k + 'ti', d: `M${cx - 3} ${bibTop - 6} H${cx + 3} L${cx + 2} ${bibTop - 2} L${cx + 4} ${bibTop + 9} L${cx} ${bibTop + 13} L${cx - 4} ${bibTop + 9} L${cx - 2} ${bibTop - 2} Z`, fill: K }));
  // arms
  const L = [x + 1.5, shY], Rr = [x + w - 1.5, shY];
  const P = { idle: [[x - 5, ovTop + 9, -6], [x + w + 5, ovTop + 9, 6]], working: [[cx - 15, ovTop + 1, -10], [cx + 15, ovTop + 1, 10]], thinking: [[x - 5, ovTop + 9, -6], [cx + 6, my + 5, 14]],
    blocked: [[x - 5, ovTop + 9, -6], [x + w + 9, y + 2, 10]], error: [[x - 3, eyeY - 12, -12], [x + w + 3, eyeY - 12, 12]], done: [[x - 12, y + 2, -4], [x + w + 12, y + 2, 4]] }[st];
  if (st === 'working' && !o.noArms) { E.push(h2('rect', { key: k + 'lp', x: cx - 16, y: ovTop - 11, width: 32, height: 21, rx: 2.5, fill: '#2A2D2B', stroke: K, strokeWidth: 2 }));
    E.push(h2('circle', { key: k + 'lpl', cx, cy: ovTop - .5, r: 3.4, fill: S, style: A('mv-pulse 1.1s ease-in-out infinite') })); E.push(h2('rect', { key: k + 'lpb', x: cx - 19, y: ovTop + 9, width: 38, height: 3.5, rx: 1.5, fill: MET2, stroke: K, strokeWidth: 1.6 })); }
  if (!o.noArms) E.push(...arm(k + 'aL', L[0], L[1], P[0][0], P[0][1], P[0][2], skin), ...arm(k + 'aR', Rr[0], Rr[1], P[1][0], P[1][1], P[1][2], skin));
  if (!o.noExtras) E.push(...extras(st, x, y - (o.hat ? 6 : 0), w, S, k));
  return E;
}

function vRobot(st, k) {
  const S = SH[st], E = [], cx = 50, sx = 31, sy = 46, sw = 38, sh = 30, ey = sy + 13;
  E.push(h2('ellipse', { key: k + 'fl', cx, cy: 113, rx: 34, ry: 4.5, fill: S + '55' }));
  E.push(h2('line', { key: k + 'an', x1: cx, y1: 38, x2: cx, y2: 24, stroke: K, strokeWidth: 2.4 }));
  E.push(h2('circle', { key: k + 'ab', cx, cy: 22, r: 5, fill: S, stroke: K, strokeWidth: 2, style: A(st === 'blocked' || st === 'error' ? 'mv-blink .8s steps(1,end) infinite' : 'mv-pulse 1.6s ease-in-out infinite') }));
  const P = { idle: [[16, 92, -4], [84, 92, 4]], working: [[34, 84, -8], [66, 84, 8]], thinking: [[16, 92, -4], [62, 80, 16]], blocked: [[16, 92, -4], [88, 30, 8]], error: [[14, 40, -10], [86, 40, 10]], done: [[12, 30, -4], [88, 30, 4]] }[st];
  [[24, 66, ...P[0]], [76, 66, ...P[1]]].forEach(([ax, ay, hx, hy, o], i) => { const d = `M${ax} ${ay} Q${ax + o} ${(ay + hy) / 2} ${hx} ${hy}`;
    E.push(h2('path', { key: k + 'ao' + i, d, stroke: K, strokeWidth: 8, fill: 'none', strokeLinecap: 'round' }), h2('path', { key: k + 'ai' + i, d, stroke: MET, strokeWidth: 4.6, fill: 'none', strokeLinecap: 'round' }), h2('circle', { key: k + 'ag' + i, cx: hx, cy: hy, r: 4.8, fill: K })); });
  E.push(h2('rect', { key: k + 'f1', x: 33, y: 100, width: 13, height: 8, rx: 3, fill: K }), h2('rect', { key: k + 'f2', x: 54, y: 100, width: 13, height: 8, rx: 3, fill: K }));
  E.push(h2('rect', { key: k + 'b', x: 24, y: 38, width: 52, height: 64, rx: 14, fill: MET, stroke: K, strokeWidth: 2.6 }));
  E.push(h2('rect', { key: k + 'bs', x: 58, y: 40, width: 16, height: 60, rx: 8, fill: 'rgba(17,19,18,.07)' }));
  E.push(h2('rect', { key: k + 'sc', x: sx - 2, y: sy - 2, width: sw + 4, height: sh + 4, rx: 8, fill: K }));
  E.push(h2('rect', { key: k + 'sg', x: sx, y: sy, width: sw, height: sh, rx: 6, fill: S }));
  const W2 = '#fff', L1 = cx - 8, R1 = cx + 8;
  const eye = { working: [L1, R1].map((ex, i) => h2('rect', { key: k + 'e' + i, x: ex - 3, y: ey - 3, width: 6, height: 8, rx: 2, fill: W2 })),
    thinking: [L1, R1].map((ex, i) => h2('rect', { key: k + 'e' + i, x: ex - 1, y: ey - 6, width: 6, height: 6, rx: 2, fill: W2 })),
    blocked: [L1, R1].map((ex, i) => h2('rect', { key: k + 'e' + i, x: ex - 3, y: ey, width: 7, height: 3.5, rx: 1.5, fill: W2 })),
    error: [L1, R1].map((ex, i) => h2('path', { key: k + 'e' + i, d: `M${ex - 3} ${ey - 3} l6 6 M${ex + 3} ${ey - 3} l-6 6`, stroke: W2, strokeWidth: 2.6, strokeLinecap: 'round' })),
    done: [L1, R1].map((ex, i) => h2('path', { key: k + 'e' + i, d: `M${ex - 4} ${ey + 2} Q${ex} ${ey - 5} ${ex + 4} ${ey + 2}`, stroke: W2, strokeWidth: 2.6, fill: 'none', strokeLinecap: 'round' })),
    idle: [L1, R1].map((ex, i) => h2('line', { key: k + 'e' + i, x1: ex - 3.5, y1: ey + 1, x2: ex + 3.5, y2: ey + 1, stroke: W2, strokeWidth: 2.4, strokeLinecap: 'round' })) }[st];
  E.push(...eye);
  const my = sy + 23, mo = { working: `M${cx - 5} ${my} Q${cx} ${my + 3} ${cx + 5} ${my}`, thinking: `M${cx + 1} ${my} h5`, blocked: `M${cx - 5} ${my} h10`, error: `M${cx - 7} ${my + 1} l3.5 -2.5 3.5 2.5 3.5 -2.5 3.5 2.5`, done: `M${cx - 7} ${my - 2} Q${cx} ${my + 5} ${cx + 7} ${my - 2}`, idle: `M${cx - 3} ${my} h6` }[st];
  E.push(h2('path', { key: k + 'm', d: mo, stroke: W2, strokeWidth: 2.4, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }));
  [0, 1, 2].forEach(i => E.push(h2('line', { key: k + 'g' + i, x1: 38, y1: 84 + i * 5, x2: 62, y2: 84 + i * 5, stroke: MET2, strokeWidth: 2, strokeLinecap: 'round' })));
  E.push(...extras(st, 24, 30, 52, S, k));
  return E;
}

const vsvg = (els, size) => h2('svg', { viewBox: '0 0 100 120', width: Math.round(size * 100 / 120), height: size, style: { display: 'block', overflow: 'visible', flexShrink: 0 } }, els);
const ZBASE = { w: 52, h: 62, eyes: 2, skin: VSKIN[1], stache: true, hair: 'tuft', tie: true };
const Z2 = [
  { id:'2a', name:'BEACON', o:{ hat:'hardhat', beacon:true },
    line:'Majáček na přilbě. Paprsky v barvě stavu se točí, kolem lampy je záře.', pro:'Stav je vidět i z druhého konce obrazovky. Přirozený „alarm“ pro needs you.', con:'Paprsky potřebují místo. V 16 px zbyde jen barevná tečka na přilbě.' },
  { id:'2b', name:'GLOW GOGGLES', o:{ lens:true },
    line:'Brýle svítí barvou stavu. Zibby se na svět dívá přes svůj stav.', pro:'Stav je přímo v obličeji, funguje i jako 24px avatar v chatu.', con:'Barevné obroučky jsou menší plocha než montérky nebo displej.' },
  { id:'2c', name:'STATUS SUIT', o:{ suit:'state' },
    line:'Montérky v barvě stavu. Celá spodní polovina postavy je signál.', pro:'Nejvíc barvy na postavě. Nejčitelnější z dálky i ve faviconu.', con:'Zibby nemá stálou uniformu — denim zůstává jen agentům.' },
  { id:'2d', name:'SCREEN FACE', robot:true,
    line:'Robot s displejem místo obličeje. Displej je celý v barvě stavu a k tomu ukazuje výraz.', pro:'Nejsilnější signál a zároveň emoce. Jasně odlišný od party.', con:'Opouští mimoňskou siluetu — je to spíš stroj, který parta postavila.' },
  { id:'2e', name:'STATUS RING', o:{ ring:true },
    line:'Zibby uvnitř silného prstence, jako status pod z design systému. Prstenec pulzuje.', pro:'Přímo navazuje na současné UI. Stejný rám jde dát i kolem agentů.', con:'Signál je rám, ne postava. Bez rámu je Zibby zase bez stavu.' },
  { id:'2f', name:'JETPACK', o:{ jet:true },
    line:'Zibby se vznáší na raketovém batohu. Plameny mají barvu stavu a mihotají se.', pro:'Hravé a okamžitě odliší šéfa od party, která chodí po zemi.', con:'Plameny jsou malá plocha — v 16 px se ztratí.' }
];
const CREW2 = [
  { name:'STUART', role:'Coder', o:{ w:44, h:54, eyes:2, hair:'spikes', hat:'headphones', skin:VSKIN[0] } },
  { name:'DAVE', role:'Reviewer', o:{ w:38, h:66, eyes:1, hair:'sprout', skin:VSKIN[2] } },
  { name:'KEVIN', role:'Architect', o:{ w:50, h:58, eyes:2, hat:'hardhat', skin:VSKIN[1] } },
  { name:'KEN', role:'Coder', o:{ w:42, h:50, eyes:1, hat:'beanie', skin:VSKIN[0] } }
];
const CUE = { working:'U notebooku, logo bliká', thinking:'Ruka u brady, bubliny', blocked:'Zvednutá ruka a „!“', error:'Bouchla mu mini atomovka', done:'Ruce nahoře a fajfka', idle:'Spí, zzz' };

// ---------- Turn 3 · animated scenes ----------
const AT = (type, values, dur, x = {}) => h2('animateTransform', { attributeName: 'transform', type, values, dur, repeatCount: 'indefinite', ...x });
const AN = (attr, values, dur, x = {}) => h2('animate', { attributeName: attr, values, dur, repeatCount: 'indefinite', ...x });
const rot = (vals, px, py) => vals.map(v => v + ' ' + px + ' ' + py).join(';');
function geo(o) { const w = o.w || 44, H = o.h || 56, cx = o.cx ?? 50, gy = o.gy ?? 104, x = cx - w / 2, y = gy - H, two = o.eyes === 2, R = two ? Math.min(11, w / 4.2) : Math.min(13, H * .22);
  const eyeY = y + Math.max(R + 4, H * .28), my = eyeY + R + 6, ovTop = gy - H * .26, bibTop = Math.max(my + 5, ovTop - 9), shY = bibTop - 1;
  return { w, H, cx, gy, x, y, eyeY, my, ovTop, shY, L: x + 1.5, R: x + w - 1.5, top: y - (o.hat ? 6 : 0) }; }
const armG = (k, g, side, hand, out, skin, anim, pre) => h2('g', { key: k }, ...(pre || []), ...arm(k, side === 'L' ? g.L : g.R, g.shY, hand[0], hand[1], out, skin), anim || null);
const DESK = '#E4E5E1', PANEL = '#D9DBD6', PEEL = '#F2C230', FLESH = '#FBF0C0';
function monitor(k, S, bn, broken) {
  const E = [h2('rect', { key: k + 'ms', x: 31, y: 80, width: 6, height: 6, fill: MET2, stroke: K, strokeWidth: 1.6 }), h2('rect', { key: k + 'mb', x: 24, y: 85, width: 20, height: 3, rx: 1, fill: MET2, stroke: K, strokeWidth: 1.6 }),
    h2('rect', { key: k + 'mf', x: 10, y: 50, width: 48, height: 32, rx: 3, fill: broken ? '#1A1C1B' : '#2A2D2B', stroke: K, strokeWidth: 2.2 })];
  if (!broken) [0, 1, 2, 3].forEach(i => { const W = [24, 14, 30, 18][i], t0 = i * .22;
    E.push(h2('rect', { key: k + 'cl' + i, x: 15, y: 56 + i * 6, height: 2.6, width: 0, rx: 1, fill: i % 2 ? '#7A7F78' : S }, AN('width', '0;0;' + W + ';' + W, '2.4s', { keyTimes: '0;' + t0 + ';' + (t0 + .2) + ';1', begin: bn + 's' }))); });
  else { E.push(h2('rect', { key: k + 'ct', x: 12, y: 52, width: 44, height: 28, fill: S, opacity: .3 })); E.push(h2('path', { key: k + 'cr', d: 'M22 52 L30 64 L26 69 L36 80 M30 64 L43 59 L50 66', stroke: '#fff', strokeWidth: 1.4, fill: 'none', strokeLinejoin: 'round' })); }
  return [h2('g', { key: k + 'mon', transform: 'translate(0 8)' }, ...E)];
}
const desk = k => [h2('rect', { key: k + 'dp', x: 12, y: 100, width: 136, height: 22, fill: PANEL, stroke: K, strokeWidth: 2 }), h2('rect', { key: k + 'dt', x: 6, y: 96, width: 148, height: 5, rx: 1, fill: DESK, stroke: K, strokeWidth: 2 })];
const kb = (k, g) => h2('rect', { key: k + 'kb', x: g.cx - 17, y: 92.5, width: 34, height: 4, rx: 1, fill: MET, stroke: K, strokeWidth: 1.6 });
const puff = (k, x, y, r, d, bn, rise) => h2('circle', { key: k, cx: x, cy: y, r, fill: '#8A8E88', stroke: K, strokeWidth: 1.2 },
  AT('translate', '0 0;' + (r * .4) + ' ' + (-rise), '1.8s', { begin: (bn - d) + 's' }), AN('opacity', '0;.9;0', '1.8s', { begin: (bn - d) + 's' }));

function sWork(c, k, S, bn) {
  const o = { ...c, cx: 100, key: k, noArms: true, noExtras: true, noFloor: true, state: 'working', look: [-5, 3] }; o.gy = 89 + (o.h || 56) * .26;
  const g = geo(o), sk = c.skin || VSKIN[0];
  return [...monitor(k, S, bn, false), ...vMinion(o), ...desk(k), kb(k, g),
    armG(k + 'aL', g, 'L', [g.cx - 8, 94], -8, sk, AT('rotate', rot([0, -10, 0], g.L, g.shY), '.3s', { begin: bn + 's' })),
    armG(k + 'aR', g, 'R', [g.cx + 8, 94], 8, sk, AT('rotate', rot([0, 10, 0], g.R, g.shY), '.3s', { begin: (bn + .15) + 's' }))];
}
function sThink(c, k, S, bn) {
  const b = bn + 's', step = '.8s', o = { ...c, cx: 80, gy: 101, key: k, noArms: true, noExtras: true, state: 'thinking', march: step, begin: b };
  const g = geo(o), sk = c.skin || VSKIN[0], bx = g.cx + g.w / 2 + 10, by = g.top - 10;
  const bubble = h2('g', { key: k + 'bu' }, h2('circle', { cx: bx - 7, cy: by + 12, r: 2.2, fill: S }), h2('circle', { cx: bx - 3, cy: by + 6, r: 3.2, fill: S }),
    h2('circle', { cx: bx + 4, cy: by - 4, r: 9, fill: S, stroke: K, strokeWidth: 2 }), h2('text', { x: bx + 4, y: by, textAnchor: 'middle', fontSize: 12, fontWeight: 700, fontFamily: 'Geist, sans-serif', fill: '#fff' }, '?'),
    AT('translate', '0 0;0 -2;0 0', '1.6s', { begin: b }));
  return [h2('g', { key: k + 'walk' },
    h2('g', null, ...vMinion(o),
      armG(k + 'aL', g, 'L', [g.x - 5, g.ovTop + 9], -6, sk, AT('rotate', rot([24, -24, 24], g.L, g.shY), step, { begin: b })),
      armG(k + 'aR', g, 'R', [g.x + g.w + 5, g.ovTop + 9], 6, sk, AT('rotate', rot([-24, 24, -24], g.R, g.shY), step, { begin: b })),
      AT('translate', '0 0;0 -2.5;0 0;0 -2.5;0 0', step, { begin: b })),
    bubble, AT('translate', '-24 0;20 0;-24 0', '6s', { begin: b }))];
}
function sBlock(c, k, S, bn) {
  const b = bn + 's', D = '3.2s', kt = '0;.1;.2;.3;.4;.5;.6;.85;1', o = { ...c, cx: 72, gy: 101, key: k, noArms: true, noExtras: true, state: 'blocked', eyeSt: 'working', look: [2, -4] };
  const g = geo(o), sk = c.skin || VSKIN[0], hx = g.x + g.w + 8, hy = g.top - 2;
  const bang = h2('g', { key: k + 'bang' }, h2('circle', { cx: hx + 13, cy: hy - 11, r: 8.5, fill: S, stroke: K, strokeWidth: 2 }), h2('rect', { x: hx + 11.8, y: hy - 16.5, width: 2.4, height: 6.5, rx: 1, fill: '#fff' }), h2('circle', { cx: hx + 13, cy: hy - 6.8, r: 1.4, fill: '#fff' }),
    AN('opacity', '0;1;1;1;1;1;1;1;0', D, { keyTimes: kt, begin: b }));
  return [h2('g', { key: k + 'body' }, ...vMinion(o),
    armG(k + 'aL', g, 'L', [g.x - 5, g.ovTop + 9], -6, sk),
    armG(k + 'aR', g, 'R', [hx, hy], 10, sk, AT('rotate', rot([150, 0, -12, 8, -12, 8, 0, 0, 150], g.R, g.shY), D, { keyTimes: kt, begin: b })),
    AT('translate', '0 0;0 0;0 -3;0 0;0 -3;0 0;0 0;0 0;0 0', D, { keyTimes: kt, begin: b })), bang];
}
function sError(c, k, S, bn) {
  const D = '5s', b = bn + 's';
  const A_ = h2('g', { key: k + 'A' }, ...sWork(c, k + 'w', SH.working, bn), AN('opacity', '1;0', D, { keyTimes: '0;.56', calcMode: 'discrete', begin: b }));
  const o = { ...c, cx: 100, key: k + 'e', noArms: true, noExtras: true, noFloor: true, state: 'error' }; o.gy = 89 + (o.h || 56) * .26; if (!o.hat) o.hair = 'spikes';
  const g = geo(o), sk = c.skin || VSKIN[0], SOOT = 'rgba(17,19,18,.55)';
  const soot = [[g.x + g.w * .18, g.my, 3.6], [g.x + g.w * .82, g.my - 2, 3], [g.cx + 7, g.y + 5, 3.2], [g.cx - 9, g.y + 8, 2.2], [g.cx, g.my + 6, 2.4]].map(([x, y, r], i) => h2('circle', { key: k + 'so' + i, cx: x, cy: y, r, fill: SOOT }));
  const B_ = h2('g', { key: k + 'B', opacity: 0 }, ...monitor(k + 'b', S, bn, true),
    h2('g', null, ...vMinion(o), ...soot,
      armG(k + 'eL', g, 'L', [g.x - 3, g.eyeY - 12], -12, sk), armG(k + 'eR', g, 'R', [g.x + g.w + 3, g.eyeY - 12], 12, sk),
      AT('translate', '0 0;0 0;-2 0;2 0;-2 0;2 0;0 0;0 0', D, { keyTimes: '0;.56;.58;.6;.62;.64;.66;1', begin: b })),
    ...desk(k + 'b'), kb(k + 'b', g),
    ...[[26, 56, 6, 0], [36, 54, 8, .6], [44, 57, 5, 1.2], [g.cx - 4, g.top - 1, 4, .3], [g.cx + 6, g.top - 2, 3, 1]].map(([x, y, r, d], i) => puff(k + 'pf' + i, x, y, r, d, bn, i < 3 ? 34 : 18)),
    AN('opacity', '0;1', D, { keyTimes: '0;.56', calcMode: 'discrete', begin: b }));
  const star = (R1, R2) => [...Array(18)].map((_, i) => { const a = i / 18 * Math.PI * 2, r = i % 2 ? R2 : R1; return (Math.cos(a) * r).toFixed(1) + ',' + (Math.sin(a) * r).toFixed(1); }).join(' ');
  const boom = h2('g', { key: k + 'boom', transform: 'translate(34 72)' }, h2('g', { transform: 'scale(0)' },
    h2('polygon', { points: star(30, 15), fill: '#F6D03C', stroke: K, strokeWidth: 2 }), h2('polygon', { points: star(17, 8), fill: S, stroke: K, strokeWidth: 1.6 }),
    AT('scale', '0;0;1.3;1;0;0', D, { keyTimes: '0;.54;.59;.66;.78;1', begin: b })));
  const flash = h2('rect', { key: k + 'fl', x: 0, y: 0, width: 160, height: 120, fill: '#fff', opacity: 0 }, AN('opacity', '0;0;.85;0;0', D, { keyTimes: '0;.55;.565;.64;1', begin: b }));
  return [A_, B_, boom, flash];
}
function sDone(c, k, S, bn) {
  const b = bn + 's', D = '.9s', o = { ...c, cx: 80, gy: 101, key: k, noArms: true, noExtras: true, noFloor: true, state: 'done' };
  const g = geo(o), sk = c.skin || VSKIN[0], fy = g.gy + 6;
  const conf = [...Array(10)].map((_, i) => { const x = 8 + i * 15.5, s = 4, d = 1.8 + (i % 3) * .5, bb = (bn - i * .33) + 's';
    return h2('rect', { key: k + 'cf' + i, x, y: -8, width: s, height: s * .7, fill: [S, K, DEN, '#F6D03C'][i % 4] },
      AT('translate', '0 0;' + (i % 2 ? 7 : -7) + ' 130', d + 's', { begin: bb }), AT('rotate', '0 ' + (x + 2) + ' -6;360 ' + (x + 2) + ' -6', '.9s', { begin: bb, additive: 'sum' })); });
  return [h2('ellipse', { key: k + 'fl', cx: g.cx, cy: g.gy + 9, rx: g.w * .7, ry: 4.5, fill: S + '55' }, AN('rx', g.w * .7 + ';' + g.w * .5 + ';' + g.w * .7, '.45s', { begin: b })), ...conf,
    h2('g', { key: k + 'dance' }, h2('g', null, ...vMinion(o),
      armG(k + 'aL', g, 'L', [g.x - 10, g.top - 2], -4, sk, AT('rotate', rot([-16, 16, -16], g.L, g.shY), D, { begin: b })),
      armG(k + 'aR', g, 'R', [g.x + g.w + 10, g.top - 2], 4, sk, AT('rotate', rot([-16, 16, -16], g.R, g.shY), D, { begin: b })),
      AT('rotate', rot([-9, 9, -9], g.cx, fy), D, { begin: b })), AT('translate', '0 0;0 -5;0 0', '.45s', { begin: b }))];
}
function sIdle(c, k, S, bn) {
  const b = bn + 's', o = { ...c, cx: 84, gy: 95, key: k, noArms: true, noExtras: true, noFloor: true, state: 'idle', eyeSt: 'done', mouthSt: 'none' };
  const g = geo(o), sk = c.skin || VSKIN[0], sl = g.cx - g.w / 2 - 5, sr = g.cx + g.w / 2 + 5, hx = g.cx + 11, hy = g.my + 10;
  const stool = [h2('ellipse', { key: k + 'sf', cx: g.cx, cy: 111, rx: g.w * .75, ry: 3.5, fill: 'rgba(17,19,18,.12)' }),
    h2('path', { key: k + 'sl', d: 'M' + (sl + 4) + ' ' + (g.gy - 5) + ' L' + (sl + 1) + ' 110 M' + (sr - 4) + ' ' + (g.gy - 5) + ' L' + (sr - 1) + ' 110 M' + (sl + 2.5) + ' 103 H' + (sr - 2.5), stroke: K, strokeWidth: 2.4, strokeLinecap: 'round' }),
    h2('rect', { key: k + 'ss', x: sl, y: g.gy - 9, width: sr - sl, height: 5, rx: 2, fill: MET2, stroke: K, strokeWidth: 2 })];
  const banana = [h2('path', { key: k + 'bf', d: 'M' + (hx - 2) + ' ' + (hy - 2) + ' Q' + (hx - 8) + ' ' + (hy - 11) + ' ' + (hx - 5) + ' ' + (hy - 17) + ' Q' + (hx + 1) + ' ' + (hy - 11) + ' ' + (hx + 2) + ' ' + (hy - 2) + ' Z', fill: FLESH, stroke: K, strokeWidth: 1.6, strokeLinejoin: 'round' }),
    h2('path', { key: k + 'p1', d: 'M' + (hx - 2) + ' ' + (hy - 3) + ' q-7 1 -8 8 q4 -1 7 -4 z', fill: PEEL, stroke: K, strokeWidth: 1.6, strokeLinejoin: 'round' }),
    h2('path', { key: k + 'p2', d: 'M' + (hx + 2) + ' ' + (hy - 3) + ' q7 1 8 8 q-4 -1 -7 -4 z', fill: PEEL, stroke: K, strokeWidth: 1.6, strokeLinejoin: 'round' })];
  const chew = h2('ellipse', { key: k + 'ch', cx: g.cx - 1, cy: g.my + 1, rx: 2.6, ry: 1, fill: K }, AN('ry', '1;2.6;1', '.45s', { begin: b }));
  const peel = h2('path', { key: k + 'pl', d: 'M24 109 q-2 -7 3 -9 q1 4 0 9 z M28 109 q4 -6 9 -5 q-3 4 -7 5 z', fill: PEEL, stroke: K, strokeWidth: 1.4, strokeLinejoin: 'round' });
  return [...stool, peel, ...vMinion(o), chew, armG(k + 'aL', g, 'L', [g.x - 2, g.ovTop + 9], -6, sk),
    armG(k + 'aR', g, 'R', [hx, hy], 14, sk, AT('rotate', rot([0, 0, 12, 12, 0], g.R, g.shY), '2.6s', { keyTimes: '0;.35;.45;.8;1', begin: b }), banana)];
}
const SCN3 = { working: sWork, thinking: sThink, blocked: sBlock, error: sError, done: sDone, idle: sIdle };
const scene3 = (st, c, k, bn, ng) => h2('svg', { viewBox: '0 0 160 120', width: '100%', style: { display: 'block', overflow: 'hidden', aspectRatio: '4 / 3' } },
  ng ? null : h2('line', { x1: 0, y1: 110.5, x2: 160, y2: 110.5, stroke: '#BFC2BC', strokeWidth: 1 }), ...SCN3[st](c, k, SH[st], bn));


// ---------- app integration ----------
const HATR = { Coder: 'headphones', Architect: 'hardhat', 'Incident Commander': 'hardhat', 'Release Manager': 'hardhat', Watcher: 'beanie', Scanner: 'beanie', Triager: 'beanie', Librarian: 'beanie', Distributor: 'beanie', 'Design Systems': 'hardhat' };
const NAMED = {}; CREW2.forEach(c => NAMED[c.name] = c.o); NAMED.MEL = { w: 56, h: 52, eyes: 2, hair: 'strands', skin: VSKIN[2] };
const hashS = s => { let h = 7; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
const SPC = {};
function specFor(name, role) {
  const key = name + '|' + (role || ''); if (SPC[key]) return SPC[key];
  const N = NAMED[String(name).toUpperCase()]; if (N) return (SPC[key] = N);
  const h = hashS(name);
  return (SPC[key] = { w: [40, 46, 52, 38, 56, 44][h % 6], h: [54, 62, 50, 66, 58][(h >>> 3) % 5], eyes: (h >>> 6) % 3 === 1 ? 1 : 2, hair: ['tuft', 'spikes', 'sprout', 'strands'][(h >>> 9) % 4],
    hat: role ? HATR[role] : undefined, skin: VSKIN[(h >>> 13) % 3], tie: ['Auditor', 'Accountant', 'Summarizer', 'Editor', 'Publisher'].includes(role) });
}
const fig = (name, role, state, size, k) => vsvg(vMinion(Object.assign({}, specFor(name, role), { state, key: (k || 'f') + hashS(name) + state })), size);
const zibby = (state, size) => vsvg(vMinion(Object.assign({}, ZBASE, Z2[1].o, { state, key: 'zb' + state })), size);
function walker(c, k, carry, bn, size) {
  const b = bn + 's', step = '.5s', o = Object.assign({}, c, { cx: 50, gy: 104, key: k, noArms: true, noExtras: true, noFloor: true, state: 'working', eyeSt: 'working', look: [0, -1], march: step, begin: b });
  const g = geo(o), sk = c.skin || VSKIN[0], E = [];
  if (carry) { const bx = g.cx, by = g.ovTop - 3;
    E.push(armG(k + 'aL', g, 'L', [bx - 12, by + 3], -8, sk), armG(k + 'aR', g, 'R', [bx + 12, by + 3], 8, sk));
    E.push(h2('g', { key: k + 'box' }, h2('rect', { x: bx - 14, y: by - 10, width: 28, height: 19, fill: '#F2F2EE', stroke: K, strokeWidth: 2.2 }), h2('path', { d: 'M' + (bx - 9) + ' ' + (by - 4) + ' h18 M' + (bx - 9) + ' ' + (by + 1) + ' h12', stroke: '#8A8E88', strokeWidth: 1.8 })));
    E.push(...arm(k + 'hL', bx - 12, by + 3, bx - 12, by + 3, 0, sk).slice(2), ...arm(k + 'hR', bx + 12, by + 3, bx + 12, by + 3, 0, sk).slice(2));
  } else {
    E.push(armG(k + 'aL', g, 'L', [g.x - 5, g.ovTop + 9], -6, sk, AT('rotate', rot([24, -24, 24], g.L, g.shY), step, { begin: b })),
      armG(k + 'aR', g, 'R', [g.x + g.w + 5, g.ovTop + 9], 6, sk, AT('rotate', rot([-24, 24, -24], g.R, g.shY), step, { begin: b })));
  }
  return h2('svg', { viewBox: '0 0 100 120', width: Math.round(size * 100 / 120), height: size, style: { display: 'block', overflow: 'visible' } },
    h2('ellipse', { cx: 50, cy: 113, rx: g.w * .6, ry: 3.5, fill: 'rgba(17,19,18,.14)' }),
    h2('g', null, ...vMinion(o), ...E, AT('translate', '0 0;0 -2.5;0 0;0 -2.5;0 0', step, { begin: b })));
}

// ---------- static serialization (React never reconciles SMIL nodes) ----------
const KEEP = { viewBox: 1, attributeName: 1, repeatCount: 1, keyTimes: 1, calcMode: 1, keySplines: 1, preserveAspectRatio: 1 };
const kebab = s => s.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
function toHTML(n) {
  if (n == null || n === false || n === true) return '';
  if (Array.isArray(n)) return n.map(toHTML).join('');
  if (typeof n !== 'object') return esc(n);
  const t = n.type, p = n.props || {}; let a = '';
  for (const k in p) { if (k === 'children' || k === 'key' || p[k] == null) continue;
    if (k === 'style') { const css = Object.entries(p.style).filter(([, v]) => v != null).map(([sk, v]) => kebab(sk) + ':' + v).join(';'); if (css) a += ' style="' + esc(css) + '"'; continue; }
    a += ' ' + (KEEP[k] ? k : k === 'className' ? 'class' : kebab(k)) + '="' + esc(p[k]) + '"'; }
  if (t === 'svg' && !p.xmlns) a += ' xmlns="http://www.w3.org/2000/svg"';
  return '<' + t + a + '>' + toHTML(p.children) + '</' + t + '>';
}
const HC = {};
const wrap = (key, build, block) => { const html = HC[key] || (HC[key] = toHTML(build()));
  return React.createElement('span', { key, style: block ? { display: 'block', width: '100%', lineHeight: 0 } : { display: 'inline-block', lineHeight: 0, verticalAlign: 'top', flexShrink: 0 }, dangerouslySetInnerHTML: { __html: html } }); };
const S_scene3 = (st, c, k, bn, ng) => wrap('s|' + k + '|' + bn + '|' + (ng ? 1 : 0), () => scene3(st, c, k, bn, ng), true);
const S_vsvg = (els, size) => React.createElement('span', { style: { display: 'inline-block', lineHeight: 0, verticalAlign: 'top', flexShrink: 0 }, dangerouslySetInnerHTML: { __html: toHTML(vsvg(els, size)) } });
const S_fig = (name, role, state, size, k) => wrap('f|' + name + '|' + role + '|' + state + '|' + size + '|' + (k || ''), () => fig(name, role, state, size, k));
const S_zibby = (state, size) => wrap('z|' + state + '|' + size, () => zibby(state, size));
const S_walker = (c, k, carry, bn, size) => wrap('w|' + k + '|' + (carry ? 1 : 0) + '|' + size, () => walker(c, k, carry, bn, size));

function install(ZB, roleOf) {
  if (!ZB || ZB.__minion) return; ZB.__minion = true; ZB.__pixelGlyph = ZB.glyph; ZB.__pixelZibby = ZB.zibby;
  ZB.glyph = (R, o) => S_fig(o.seed, roleOf ? roleOf(o.seed) : undefined, o.state || 'idle', o.size || 48, 'g');
  ZB.zibby = (R, o) => S_zibby(o.state || 'working', o.size || 32);
}

return { vMinion, vRobot, vsvg: S_vsvg, scene3: S_scene3, SH, VSKIN, ZBASE, Z2, CREW2, ORD, specFor, fig: S_fig, zibby: S_zibby, walker: S_walker, install, toHTML };
};
