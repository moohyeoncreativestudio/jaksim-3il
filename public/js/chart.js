// SVG 선그래프 (외부 라이브러리 없음)
// LineChart.render(container, { points, value, label, tooltip, peakText })
//  - points: [{ ..., inProgress }]  진행 중 구간은 마지막 점 하나라고 가정한다
//  - value(p) → 숫자, label(p) → x축 라벨, tooltip(p, i) → 말풍선 줄 배열, peakText(p) → 최고점 라벨
// 컨테이너 너비가 바뀌면 다시 그린다.
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const COLOR = { line: '#22e54e', grid: '#3c4b39', bg: '#111317', peakText: '#00390b' };
  const HEIGHT = 176;
  const PAD = { top: 30, bottom: 12 };
  let uid = 0;

  const svgEl = (tag, attrs = {}) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    return n;
  };

  function render(container, options) {
    const state = { options, open: null, id: `lc${++uid}` };
    container.classList.add('chart');
    container.replaceChildren();
    const plot = document.createElement('div');
    plot.className = 'chart__plot';
    const labels = document.createElement('div');
    labels.className = 'chart__labels';
    const tip = document.createElement('div');
    tip.className = 'chart__tip';
    tip.setAttribute('role', 'status');
    tip.hidden = true;
    plot.append(tip);
    container.append(plot, labels);

    const draw = () => {
      const width = Math.round(plot.clientWidth);
      if (!width) return;
      const { points, value, label, peakText } = state.options;
      const n = points.length;
      const values = points.map(value);
      const max = Math.max(...values, 0);
      const min = Math.min(...values, max);
      // Stitch 그래프처럼 값의 범위에 맞춰 세로축을 잡는다 (최저값 조금 아래 ~ 최고값 조금 위). 값이 모두 같으면 0부터.
      const span = max - min;
      const lo = span > 0 ? Math.max(0, min - span * 0.6) : 0;
      const hi = span > 0 ? max + span * 0.12 : max > 0 ? max * 1.12 : 1;
      const plotH = HEIGHT - PAD.top - PAD.bottom;
      const xs = points.map((_, i) => ((i + 0.5) * width) / n);
      const ys = values.map((v) => PAD.top + (1 - (v - lo) / (hi - lo)) * plotH);
      const base = PAD.top + plotH;
      const peak = max > 0 ? values.lastIndexOf(max) : -1;
      const progressIdx = points.findIndex((p) => p.inProgress);

      const svg = svgEl('svg', { class: 'chart__svg', width, height: HEIGHT, viewBox: `0 0 ${width} ${HEIGHT}`, 'aria-hidden': 'true' });
      const defs = svgEl('defs');
      const grad = svgEl('linearGradient', { id: `${state.id}-g`, x1: 0, x2: 0, y1: 0, y2: 1 });
      grad.append(svgEl('stop', { offset: '0%', 'stop-color': COLOR.line, 'stop-opacity': 0.38 }), svgEl('stop', { offset: '100%', 'stop-color': COLOR.line, 'stop-opacity': 0 }));
      const glow = svgEl('filter', { id: `${state.id}-f`, x: '-20%', y: '-20%', width: '140%', height: '140%' });
      glow.append(svgEl('feDropShadow', { dx: 0, dy: 0, stdDeviation: 3, 'flood-color': COLOR.line, 'flood-opacity': 0.6 }));
      defs.append(grad, glow);
      svg.append(defs);

      // 가로 보조선 3개
      for (const r of [0, 0.45, 0.9]) {
        const y = PAD.top + plotH * r;
        svg.append(svgEl('line', { x1: 0, x2: width, y1: y, y2: y, stroke: COLOR.grid, 'stroke-width': 0.75, 'stroke-dasharray': '3,3', opacity: 0.4 }));
      }

      if (n > 1) {
        // 선 아래 그라데이션
        const area = xs.map((x, i) => `${x},${ys[i]}`).concat(`${xs[n - 1]},${base}`, `${xs[0]},${base}`).join(' ');
        svg.append(svgEl('polygon', { points: area, fill: `url(#${state.id}-g)` }));
        // 완료 구간은 실선, 진행 중 구간으로 가는 마지막 선은 점선
        const solidEnd = progressIdx > 0 ? progressIdx - 1 : n - 1;
        if (solidEnd > 0) {
          const d = xs.slice(0, solidEnd + 1).map((x, i) => `${i ? 'L' : 'M'} ${x},${ys[i]}`).join(' ');
          svg.append(svgEl('path', { d, fill: 'none', stroke: COLOR.line, 'stroke-width': 2.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', filter: `url(#${state.id}-f)` }));
        }
        if (progressIdx > 0) {
          const a = progressIdx - 1;
          svg.append(svgEl('path', { class: 'chart__dashed', d: `M ${xs[a]},${ys[a]} L ${xs[progressIdx]},${ys[progressIdx]}`, fill: 'none', stroke: COLOR.line, 'stroke-width': 2.5, 'stroke-dasharray': '4,4', 'stroke-linecap': 'round', opacity: 0.85 }));
        }
      }

      // 점: 일반 / 최고점(채움) / 진행 중(속이 빈 점)
      points.forEach((p, i) => {
        if (i === peak && !p.inProgress) {
          svg.append(svgEl('circle', { class: 'chart__dot chart__dot--peak', cx: xs[i], cy: ys[i], r: 5, fill: COLOR.line, stroke: '#ffffff', 'stroke-width': 2 }));
        } else if (p.inProgress) {
          svg.append(svgEl('circle', { class: 'chart__dot chart__dot--progress', cx: xs[i], cy: ys[i], r: 4.5, fill: COLOR.bg, stroke: COLOR.line, 'stroke-width': 2.5 }));
        } else {
          svg.append(svgEl('circle', { class: 'chart__dot', cx: xs[i], cy: ys[i], r: 3.5, fill: COLOR.bg, stroke: COLOR.line, 'stroke-width': 2 }));
        }
      });

      // 최고점 라벨 (예: "312.6점")
      if (peak >= 0) {
        const text = peakText(points[peak]);
        const w = Math.max(40, text.length * 6 + 12);
        const x = Math.min(Math.max(xs[peak] - w / 2, 0), width - w);
        const y = Math.max(ys[peak] - 24, 2);
        const g = svgEl('g', { class: 'chart__peak', transform: `translate(${x}, ${y})` });
        const t = svgEl('text', { x: w / 2, y: 11.5, 'text-anchor': 'middle', fill: COLOR.peakText, 'font-family': 'Space Grotesk, sans-serif', 'font-size': 9, 'font-weight': 700 });
        t.textContent = text;
        g.append(svgEl('rect', { width: w, height: 16, rx: 4, fill: COLOR.line }), t);
        svg.append(g);
      }

      // 누르기 쉬운 넓은 영역 (점마다 세로 띠)
      points.forEach((p, i) => {
        const hit = svgEl('rect', { class: 'chart__hit', x: (i * width) / n, y: 0, width: width / n, height: HEIGHT, fill: 'transparent', tabindex: 0, role: 'button' });
        hit.setAttribute('aria-label', `${label(p)} 자세히`);
        hit.addEventListener('click', (e) => {
          e.stopPropagation();
          toggle(i);
        });
        hit.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle(i);
          }
        });
        svg.append(hit);
      });

      plot.querySelector('svg')?.remove();
      plot.prepend(svg);

      // x축 라벨: 칸이 좁으면 몇 개씩 건너뛰어 겹치지 않게 (마지막 라벨은 항상 표시)
      labels.replaceChildren();
      const texts = points.map(label);
      const longest = Math.max(...texts.map((s) => s.length));
      const need = longest * 6.5 + 8;
      const step = Math.max(1, Math.ceil(need / (width / n)));
      texts.forEach((s, i) => {
        const span = document.createElement('span');
        span.className = `chart__label${points[i].inProgress ? ' is-current' : ''}`;
        span.textContent = s;
        span.style.left = `${xs[i]}px`;
        const fromEnd = n - 1 - i;
        if (fromEnd % step !== 0) span.classList.add('is-skipped');
        labels.append(span);
        // 양 끝 라벨이 그래프 밖으로 나가지 않게 위치를 안쪽으로 당긴다
        const half = span.offsetWidth / 2;
        span.style.left = `${Math.min(Math.max(xs[i], half), width - half)}px`;
      });

      state.geom = { xs, ys, width };
      if (state.open != null) place(state.open);
    };

    function place(i) {
      const { xs, ys, width } = state.geom;
      const lines = state.options.tooltip(state.options.points[i], i);
      tip.replaceChildren(
        ...lines.map((line, k) => {
          const el = document.createElement(k === 0 ? 'strong' : 'span');
          el.textContent = line;
          return el;
        }),
      );
      tip.hidden = false;
      const w = tip.offsetWidth;
      const left = Math.min(Math.max(xs[i] - w / 2, 0), width - w);
      tip.style.left = `${left}px`;
      const above = ys[i] - tip.offsetHeight - 12;
      tip.style.top = `${above >= 0 ? above : ys[i] + 12}px`;
    }

    function toggle(i) {
      if (state.open === i) return close();
      state.open = i;
      place(i);
    }
    function close() {
      state.open = null;
      tip.hidden = true;
    }
    document.addEventListener('click', (e) => {
      if (!container.contains(e.target)) close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });

    const ro = new ResizeObserver(draw);
    ro.observe(plot);
    draw();

    return {
      update(next) {
        state.options = { ...state.options, ...next };
        close();
        draw();
      },
      close,
    };
  }

  window.LineChart = { render };
})();
