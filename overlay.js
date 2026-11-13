// notelayer — 웹페이지 위 표시 층. 북마클릿이 지금 보는 페이지에 templates.js·prompt.js 와 함께 이 파일을 불러온다.
// 원래 페이지의 글자와 디자인은 고치지 않는다.
// - 형광펜·물결: 브라우저의 글자 범위 칠하기(CSS Custom Highlight API). 페이지 구조를 건드리지 않는다
// - 동그라미·설명 배지·패널: 페이지 위에 겹친 별도 층. Shadow DOM 으로 감싸 페이지 CSS 와 섞이지 않게 한다
(() => {
  if (window.NL_OVERLAY) { window.NL_OVERLAY.toggle(); return; }
  const TEMPLATES = window.NL_TEMPLATES, PROMPT = window.NL_PROMPT;
  if (!TEMPLATES || !PROMPT) { alert("notelayer: templates.js 와 prompt.js 를 먼저 불러와야 합니다."); return; }

  // 표시 색. app.css 의 템플릿 변수와 같은 값이다(그쪽을 고치면 여기도 고친다)
  const MARK_COLORS = {
    exam: { circle: "#d9480f", hl: "rgba(255, 214, 10, .55)", wave: "#1c64f2" },
    tech: { circle: "#0f766e", hl: "rgba(56, 189, 248, .28)", wave: "#7c3aed" },
    contract: { circle: "#1d4ed8", hl: "rgba(250, 204, 21, .35)", wave: "#ea580c" },
    onboarding: { circle: "#4f46e5", hl: "rgba(129, 140, 248, .25)", wave: "#db2777" },
    review: { circle: "#15803d", hl: "rgba(134, 239, 172, .45)", wave: "#dc2626" },
  };
  const KINDS = ["circle", "highlight", "wave"];
  // 패널은 페이지를 밀지 않고 위에 겹쳐 띄운다. 페이지 오른쪽 여백을 늘려 밀면 화면에 고정된 사이트 메뉴 밑으로 본문이 깔린다(티스토리에서 확인)
  const SKIP = "nav,aside,footer,header,form,[role=navigation],[role=complementary],[aria-hidden=true],notelayer-overlay";
  const BLOCK = "p,div,li,ul,ol,dl,dt,dd,table,tr,td,th,pre,blockquote,h1,h2,h3,h4,h5,h6,section,article,figure,figcaption,main";
  const LEAF = "p,div,li,dt,dd,td,th,pre,blockquote,h1,h2,h3,h4,h5,h6,figcaption";
  const squash = (s) => String(s ?? "").replace(/\s+/g, "");
  const textLen = (el) => squash(el.textContent).length;
  const isLeaf = (el) => el.tagName === "PRE" || !el.querySelector(BLOCK);

  // ── 본문 고르기: 긴 문단이 몰려 있고 링크 비율이 낮은 영역 (브라우저 읽기 모드와 같은 생각) ──
  function findRoot() {
    const scores = new Map();
    const add = (node, v) => { if (node && node !== document.documentElement) scores.set(node, (scores.get(node) || 0) + v); };
    for (const el of document.body.querySelectorAll(LEAF)) {
      if (el.closest(SKIP) || !isLeaf(el)) continue;
      const len = textLen(el);
      if (len < 20) continue;
      add(el.parentElement, len);
      add(el.parentElement?.parentElement, len / 2);
    }
    let best = null, bestScore = 0;
    for (const [el, s] of scores) {
      const total = textLen(el) || 1;
      const linkLen = [...el.querySelectorAll("a")].reduce((n, a) => n + textLen(a), 0);
      const score = s * (1 - Math.min(1, linkLen / total));
      if (score > bestScore) { best = el; bestScore = score; }
    }
    if (!best) return document.querySelector("article,main") || document.body;
    // 본문을 감싼 얇은 껍데기는 함께 잡는다(글자가 거의 늘지 않는 부모까지만)
    while (best.parentElement && best.parentElement !== document.body && textLen(best.parentElement) <= textLen(best) * 1.15) best = best.parentElement;
    return best;
  }

  // 본문 안의 문단: 안에 다른 덩어리가 없는 가장 안쪽 덩어리. 코드(pre)는 통째로 한 문단
  function collectParagraphs(root) {
    const out = [];
    for (const el of root.querySelectorAll(LEAF)) {
      if (el.closest(SKIP) && !root.closest(SKIP)) continue;
      if (el.tagName !== "PRE" && el.closest("pre")) continue;
      if (!isLeaf(el) || !el.getClientRects().length) continue;
      const text = el.tagName === "PRE" ? el.innerText.trim() : el.innerText.replace(/\s+/g, " ").trim();
      if (text.length < 2) continue;
      out.push({ p: out.length + 1, el, text });
      if (out.length >= 500) break;
    }
    return out;
  }

  // ── 구절 찾기: 공백을 뺀 글자마다 (글자 조각, 위치) 를 기억한다.
  //    한 문장이 굵은 글씨·링크로 쪼개져 있어도, 띄어쓰기·줄바꿈이 AI 가 받은 글과 달라도 찾는다 ──
  const indexCache = new WeakMap();
  function textIndex(el) {
    let idx = indexCache.get(el);
    if (idx) return idx;
    const chars = [], map = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement?.closest("script,style,noscript,notelayer-overlay") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    for (let n; (n = walker.nextNode()); ) {
      const t = n.data;
      for (let i = 0; i < t.length; i++) if (!/\s/.test(t[i])) { chars.push(t[i]); map.push([n, i]); }
    }
    idx = { text: chars.join(""), map };
    indexCache.set(el, idx);
    return idx;
  }
  function rangeIn(el, quote) {
    const q = squash(quote), idx = textIndex(el);
    const at = q ? idx.text.indexOf(q) : -1;
    if (at < 0) return null;
    const [sn, so] = idx.map[at], [en, eo] = idx.map[at + q.length - 1];
    const r = document.createRange();
    r.setStart(sn, so); r.setEnd(en, eo + 1);
    return r;
  }

  // ── 상태 ──
  const state = {
    tpl: Object.keys(TEMPLATES)[0],
    root: null, paras: [],
    result: null,
    ranges: { circle: [], highlight: [], wave: [] },
    boxes: [],            // { box, el }
    lost: [],
    show: { circle: true, highlight: true, wave: true, boxes: true },
  };

  // AI 가 매긴 문단 번호(p)를 이 페이지 문단 자리로 옮긴다.
  // 이 층이 만든 요청문으로 받은 답이면 그대로 맞고, 다른 데서 뽑은 글로 만든 답이면 긴 인용으로 어긋난 정도를 배워 바로잡는다
  function anchor(result) {
    const P = state.paras, n = P.length;
    const clamp = (i) => Math.max(0, Math.min(n - 1, i));
    const findPara = (quote, hint, spread) => {
      const order = [hint];
      for (let d = 1; d <= spread; d++) order.push(hint - d, hint + d);
      for (const i of order) if (i >= 0 && i < n && rangeIn(P[i].el, quote)) return i;
      for (let i = 0; i < n; i++) if (rangeIn(P[i].el, quote)) return i;
      return -1;
    };
    const marks = (Array.isArray(result.marks) ? result.marks : [])
      .filter((m) => m && KINDS.includes(m.kind) && typeof m.quote === "string" && squash(m.quote) && Number.isFinite(Number(m.p)));
    const learned = [];
    for (const m of marks) {
      if (squash(m.quote).length < 12) continue;
      const i = findPara(m.quote, clamp(Number(m.p) - 1), 0);
      if (i >= 0) learned.push([Number(m.p), i]);
    }
    const guess = (p) => {
      if (!learned.length) return clamp(p - 1);
      let best = learned[0];
      for (const l of learned) if (Math.abs(l[0] - p) < Math.abs(best[0] - p)) best = l;
      return clamp(p - 1 + (best[1] - (best[0] - 1)));
    };
    const ranges = { circle: [], highlight: [], wave: [] }, lost = [];
    for (const m of marks) {
      const i = findPara(m.quote, guess(Number(m.p)), 3);
      const r = i >= 0 ? rangeIn(P[i].el, m.quote) : rangeIn(state.root, m.quote); // 문단 경계를 넘는 인용은 본문 전체에서
      if (r) ranges[m.kind].push(r); else lost.push(m.quote);
    }
    const labels = Object.keys(TEMPLATES[state.tpl].boxes);
    const boxes = (Array.isArray(result.boxes) ? result.boxes : [])
      .filter((b) => b && typeof b.text === "string" && b.text.trim() && Number.isFinite(Number(b.p)) && n)
      .map((b) => ({ box: { ...b, label: labels.includes(b.label) ? b.label : labels[0] }, el: P[guess(Number(b.p))].el }));
    return { ranges, lost, boxes, total: marks.length };
  }

  // ── 그리기 ──
  const pageStyle = document.createElement("style");
  pageStyle.id = "notelayer-overlay-style";
  document.head.appendChild(pageStyle);
  const host = document.createElement("notelayer-overlay");
  host.style.cssText = "all:initial;position:absolute;left:0;top:0;width:0;height:0;z-index:2147483000;";
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });
  const SVGNS = "http://www.w3.org/2000/svg";

  function h(tag, props = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "class") el.className = v;
      else if (k === "style") el.style.cssText = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
    return el;
  }

  shadow.append(h("style", {}, `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .layer { position: absolute; left: 0; top: 0; width: 1px; height: 1px; overflow: visible; pointer-events: none; }
    .badge { position: absolute; pointer-events: auto; cursor: pointer; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 999px;
      color: #fff; font: 600 11px/20px "Pretendard", "Malgun Gothic", sans-serif; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,.25); }
    .badge:hover { transform: scale(1.1); }
    .root-box { position: absolute; border: 2px dashed #f59e0b; border-radius: 6px; background: rgba(245, 158, 11, .06); }
    .panel { position: fixed; top: 12px; right: 12px; bottom: 12px; width: 330px; display: flex; flex-direction: column; pointer-events: auto;
      background: #fff; color: #1f2328; border: 1px solid #e5e7eb; border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,.18);
      font: 13px/1.6 "Pretendard", "IBM Plex Sans KR", "Malgun Gothic", sans-serif; overflow: hidden; }
    .panel[data-min] { display: none; }
    .pill { position: fixed; right: 16px; bottom: 16px; pointer-events: auto; cursor: pointer; padding: 8px 14px; border-radius: 999px; border: 0;
      background: #1f2328; color: #fff; font: 600 12px "Pretendard", "Malgun Gothic", sans-serif; box-shadow: 0 4px 14px rgba(0,0,0,.25); }
    .pill[hidden] { display: none; }
    header { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid #eef0f2; }
    header b { font-size: 14px; }
    header select { flex: 1; min-width: 0; }
    .body { overflow: auto; padding: 12px; flex: 1; }
    button, select, textarea { font: inherit; color: inherit; }
    button { cursor: pointer; border: 1px solid #d0d7de; background: #f6f8fa; border-radius: 8px; padding: 5px 10px; }
    button.primary { background: #1f2328; color: #fff; border-color: #1f2328; }
    button.icon { border: 0; background: none; padding: 2px 6px; font-size: 15px; color: #6b7280; }
    .row { display: flex; gap: 6px; flex-wrap: wrap; margin: 6px 0; }
    .muted { color: #6b7280; font-size: 12px; margin: 4px 0; }
    .msg { font-size: 12px; margin: 6px 0; color: #0f766e; white-space: pre-wrap; word-break: break-all; }
    .msg.err { color: #b42318; }
    h3 { font-size: 12px; margin: 12px 0 4px; color: #374151; }
    textarea { width: 100%; height: 90px; resize: vertical; border: 1px solid #d0d7de; border-radius: 8px; padding: 6px; font-size: 12px; }
    details.steps > summary { cursor: pointer; color: #6b7280; font-size: 12px; margin-bottom: 6px; }
    .legend { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
    .legend button { font-size: 12px; padding: 3px 8px; border-radius: 999px; }
    .legend button[aria-pressed="false"] { opacity: .4; }
    .sw { display: inline-block; vertical-align: middle; margin-right: 4px; }
    .sw-circle { width: 16px; height: 11px; border-radius: 50%; border: 2px solid var(--circle); }
    .sw-hl { width: 16px; height: 10px; background: var(--hl); }
    .sw-wave { width: 16px; height: 2px; border-bottom: 2px dotted var(--wave); }
    .tabs { display: flex; gap: 4px; border-bottom: 1px solid #eef0f2; margin: 8px 0; }
    .tabs button { border: 0; border-bottom: 2px solid transparent; border-radius: 0; background: none; padding: 6px 8px; color: #6b7280; }
    .tabs button[aria-selected="true"] { border-bottom-color: #1f2328; color: #1f2328; font-weight: 600; }
    .card { border: 1px solid #eef0f2; border-left: 3px solid var(--c); border-radius: 8px; padding: 8px 10px; margin: 8px 0; cursor: pointer; }
    .card:hover { background: #fafbfc; }
    .card.flash { animation: flash 1.2s; }
    @keyframes flash { from { background: rgba(245, 158, 11, .25); } to { background: transparent; } }
    .chip { display: inline-block; font-size: 11px; font-weight: 600; color: var(--c); margin-bottom: 2px; }
    .card pre { margin: 6px 0 0; padding: 6px 8px; background: #f6f8fa; border-radius: 6px; font: 11.5px/1.5 Consolas, "D2Coding", monospace; white-space: pre; overflow-x: auto; }
    .card details { margin-top: 6px; }
    .card summary { cursor: pointer; color: #9c36b5; font-size: 12px; }
    .tree, .tree ul { list-style: none; margin: 0; padding-left: 14px; }
    .tree { padding-left: 0; }
    .node { margin: 6px 0; }
    .node .term { cursor: pointer; font-weight: 600; }
    .node .role { color: #9ca3af; font-size: 11px; margin-left: 4px; font-weight: 400; }
    .node .gloss { color: #4b5563; font-size: 12px; }
    .node .points { margin: 4px 0 0; padding-left: 16px; font-size: 12px; color: #374151; }
    .node .link { font-size: 11px; color: #6b7280; }
  `));
  const svg = document.createElementNS(SVGNS, "svg");
  svg.setAttribute("class", "layer");
  const badgeLayer = h("div", { class: "layer" });
  shadow.append(svg, badgeLayer);

  function paint() {
    const c = MARK_COLORS[state.tpl] || MARK_COLORS.tech;
    pageStyle.textContent = `::highlight(nl-ov-hl){background-color:${c.hl}}
::highlight(nl-ov-wave){text-decoration:underline wavy ${c.wave};text-decoration-thickness:1.5px;text-underline-offset:4px}
::highlight(nl-ov-flash){background-color:rgba(245,158,11,.4)}`;
    panel.style.setProperty("--circle", c.circle); panel.style.setProperty("--hl", c.hl); panel.style.setProperty("--wave", c.wave);
    if (!window.CSS?.highlights) return;
    CSS.highlights.set("nl-ov-hl", new Highlight(...(state.show.highlight ? state.ranges.highlight : [])));
    CSS.highlights.set("nl-ov-wave", new Highlight(...(state.show.wave ? state.ranges.wave : [])));
  }

  // 동그라미와 배지는 문서 좌표에 그린다. 안쪽 스크롤 영역·글자 크기 변화에 맞춰 다시 그린다
  let raf = 0;
  const queueDraw = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(drawLayer); };
  function drawLayer() {
    svg.replaceChildren(); badgeLayer.replaceChildren();
    const sx = window.scrollX, sy = window.scrollY;
    const c = MARK_COLORS[state.tpl] || MARK_COLORS.tech;
    const hand = TEMPLATES[state.tpl].hand;
    if (state.show.circle) for (const r of state.ranges.circle) for (const rect of r.getClientRects()) {
      if (!rect.width) continue;
      const cx = rect.left + sx + rect.width / 2, cy = rect.top + sy + rect.height / 2;
      const e = document.createElementNS(SVGNS, "ellipse");
      e.setAttribute("cx", cx); e.setAttribute("cy", cy);
      e.setAttribute("rx", rect.width / 2 + 4); e.setAttribute("ry", rect.height / 2 + 1);
      e.setAttribute("fill", "none"); e.setAttribute("stroke", c.circle);
      e.setAttribute("stroke-width", hand ? "2.2" : "1.6");
      if (hand) e.setAttribute("transform", `rotate(-2 ${cx} ${cy})`);
      svg.append(e);
    }
    if (!state.show.boxes) return;
    const colors = TEMPLATES[state.tpl].boxes;
    const groups = new Map();
    state.boxes.forEach((b, i) => { if (!groups.has(b.el)) groups.set(b.el, []); groups.get(b.el).push(i); });
    for (const [el, idxs] of groups) {
      const r = el.getClientRects()[0];
      if (!r) continue;
      const first = state.boxes[idxs[0]].box;
      const left = r.left > 34 ? r.left - 28 : r.right + 6;
      badgeLayer.append(h("div", {
        class: "badge", title: idxs.map((i) => state.boxes[i].box.label).join(", "),
        style: `left:${left + sx}px;top:${r.top + sy}px;background:${colors[first.label] || "#6b7280"}`,
        onclick: () => openCard(idxs[0]),
      }, idxs.length > 1 ? String(idxs.length) : "i"));
    }
  }

  function flashElement(el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    if (!window.CSS?.highlights) return;
    const r = document.createRange();
    r.selectNodeContents(el);
    CSS.highlights.set("nl-ov-flash", new Highlight(r));
    clearTimeout(flashElement.t);
    flashElement.t = setTimeout(() => CSS.highlights.delete("nl-ov-flash"), 1300);
  }
  function showRoot() {
    if (!state.root) return;
    state.root.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => {
      const r = state.root.getBoundingClientRect();
      const box = h("div", { class: "root-box", style: `left:${r.left + scrollX - 4}px;top:${r.top + scrollY - 4}px;width:${r.width + 8}px;height:${r.height + 8}px` });
      badgeLayer.append(box);
      setTimeout(() => box.remove(), 2500);
    }, 400);
  }

  // ── 패널 ──
  const tplSelect = h("select", { onchange: (e) => { state.tpl = e.target.value; if (state.result) apply(state.result); else paint(); } },
    Object.entries(TEMPLATES).map(([id, t]) => h("option", { value: id }, t.name)));
  const pill = h("button", { class: "pill", hidden: true, onclick: () => setMin(false) }, "notelayer");
  const foundMsg = h("p", { class: "muted" });
  const preview = h("p", { class: "muted" });
  const copyMsg = h("p", { class: "msg" });
  const answer = h("textarea", { placeholder: "AI 가 돌려준 답(JSON)을 그대로 붙여 넣으세요" });
  const applyMsg = h("p", { class: "msg" });
  const steps = h("details", { class: "steps", open: true },
    h("summary", {}, "요청문 복사 · 답 붙여 넣기"),
    h("h3", {}, "1. 이 페이지 본문으로 요청문 만들기"), foundMsg, preview,
    h("div", { class: "row" },
      h("button", { class: "primary", onclick: copyPrompt }, "요청문 복사"),
      h("button", { onclick: showRoot }, "본문 영역 보기")),
    copyMsg,
    h("h3", {}, "2. 쓰는 AI 에 붙여 넣고, 받은 답을 여기에"), answer,
    h("div", { class: "row" }, h("button", { class: "primary", onclick: () => applyText(answer.value) }, "적용")),
    applyMsg);
  const legend = h("div", { class: "legend" });
  const tabs = h("div", { class: "tabs" });
  const list = h("div");
  const resultBox = h("div", { hidden: true }, legend, tabs, list);
  const panel = h("aside", { class: "panel" },
    h("header", {}, h("b", {}, "notelayer"), tplSelect,
      h("button", { class: "icon", title: "접기", onclick: () => setMin(true) }, "—"),
      h("button", { class: "icon", title: "닫고 표시 지우기", onclick: destroy }, "✕")),
    h("div", { class: "body" }, steps, resultBox));
  shadow.append(panel, pill);

  function setMin(min) {
    if (min) panel.setAttribute("data-min", ""); else panel.removeAttribute("data-min");
    pill.hidden = !min;
  }

  async function copyPrompt() {
    const text = PROMPT.build({ title: document.title, paragraphs: state.paras, templateId: state.tpl, template: TEMPLATES[state.tpl] });
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = h("textarea", { style: "position:fixed;left:-9999px" }, text);
      shadow.append(ta); ta.select(); document.execCommand("copy"); ta.remove();
    }
    copyMsg.className = "msg";
    copyMsg.textContent = `복사했습니다(${text.length.toLocaleString()}자). 쓰는 AI 에 붙여 넣으세요.`;
  }

  function applyText(text) {
    let result;
    try { result = PROMPT.parseAnswer(text, state.tpl); }
    catch (err) { applyMsg.className = "msg err"; applyMsg.textContent = `읽지 못했습니다: ${err.message}`; return null; }
    return apply(result);
  }

  function apply(result) {
    state.result = result;
    const a = anchor(result);
    state.ranges = a.ranges; state.boxes = a.boxes; state.lost = a.lost;
    paint(); drawLayer(); renderResult();
    const placed = KINDS.reduce((n, k) => n + a.ranges[k].length, 0);
    const parts = [`표시 ${placed}/${a.total}개, 설명 ${a.boxes.length}개를 얹었습니다`];
    const nodes = result.concepts?.nodes?.length;
    if (nodes) parts.push(`개념 ${nodes}개`);
    if (a.lost.length) parts.push(`\n원문에서 찾지 못한 표시 ${a.lost.length}개: ${a.lost.slice(0, 4).map((q) => `「${q}」`).join(", ")}${a.lost.length > 4 ? " …" : ""}`);
    if (!window.CSS?.highlights) parts.push("\n이 브라우저는 형광펜·물결 칠하기를 지원하지 않습니다(크롬 계열 권장).");
    applyMsg.className = "msg";
    applyMsg.textContent = parts.join(" · ");
    steps.open = false;
    return { placed, total: a.total, boxes: a.boxes.length, lost: a.lost };
  }

  let tab = "boxes";
  function renderResult() {
    resultBox.hidden = false;
    const t = TEMPLATES[state.tpl];
    const count = (k) => state.ranges[k].length;
    const toggle = (key, ...label) => h("button", { "aria-pressed": String(state.show[key]),
      onclick: () => { state.show[key] = !state.show[key]; paint(); drawLayer(); renderResult(); } }, ...label);
    legend.replaceChildren(
      toggle("circle", h("span", { class: "sw sw-circle" }), `${t.marks.circle} ${count("circle")}`),
      toggle("highlight", h("span", { class: "sw sw-hl" }), `${t.marks.highlight} ${count("highlight")}`),
      toggle("wave", h("span", { class: "sw sw-wave" }), `${t.marks.wave} ${count("wave")}`),
      toggle("boxes", `설명 배지 ${state.boxes.length}`));
    const nodes = state.result?.concepts?.nodes || [];
    tabs.replaceChildren(
      h("button", { "aria-selected": String(tab === "boxes"), onclick: () => { tab = "boxes"; renderResult(); } }, `설명 ${state.boxes.length}`),
      h("button", { "aria-selected": String(tab === "concepts"), onclick: () => { tab = "concepts"; renderResult(); } }, `요약 ${nodes.length ? `(개념 ${nodes.length})` : ""}`));
    list.replaceChildren(tab === "boxes" ? renderBoxes() : renderConcepts());
  }

  function renderBoxes() {
    const colors = TEMPLATES[state.tpl].boxes;
    const frag = document.createDocumentFragment();
    state.boxes.forEach(({ box, el }, i) => {
      frag.append(h("div", { class: "card", "data-i": i, style: `--c:${colors[box.label] || "#6b7280"}`,
        onclick: (e) => { if (!e.target.closest("details")) flashElement(el); } },
        h("div", { class: "chip" }, box.label),
        h("div", {}, box.text),
        typeof box.pre === "string" && box.pre.trim() ? h("pre", {}, box.pre) : null,
        typeof box.answer === "string" && box.answer.trim() ? h("details", {}, h("summary", {}, "답 보기"), h("div", {}, box.answer)) : null));
    });
    if (!state.boxes.length) frag.append(h("p", { class: "muted" }, "설명이 없습니다."));
    return frag;
  }

  function renderConcepts() {
    const c = state.result?.concepts;
    const nodes = (c?.nodes || []).filter((n) => n && n.id != null && typeof n.term === "string");
    if (!nodes.length) return h("p", { class: "muted" }, "개념 구조도가 없습니다.");
    const byId = new Map(nodes.map((n) => [String(n.id), n]));
    const kids = new Map();
    for (const n of nodes) {
      const p = n.parent != null && byId.has(String(n.parent)) && String(n.parent) !== String(n.id) ? String(n.parent) : null;
      if (!kids.has(p)) kids.set(p, []);
      kids.get(p).push(n);
    }
    const links = Array.isArray(c.links) ? c.links : [];
    const seen = new Set();
    const branch = (parent) => h("ul", { class: parent == null ? "tree" : "" }, (kids.get(parent) || []).filter((n) => !seen.has(n.id) && seen.add(n.id)).map((n) => {
      const pts = (Array.isArray(n.points) ? n.points : []).filter((x) => typeof x === "string");
      const ptsList = h("ul", { class: "points", hidden: true }, pts.map((x) => h("li", {}, x)));
      const out = links.filter((l) => String(l.from) === String(n.id) && byId.has(String(l.to)));
      return h("li", { class: "node" },
        h("div", { class: "term", onclick: () => (ptsList.hidden = !ptsList.hidden) }, n.term, n.role ? h("span", { class: "role" }, n.role) : null),
        n.gloss ? h("div", { class: "gloss" }, n.gloss) : null,
        out.map((l) => h("div", { class: "link" }, `→ ${l.label} → ${byId.get(String(l.to)).term}`)),
        ptsList,
        kids.has(String(n.id)) ? branch(String(n.id)) : null);
    }));
    return h("div", {}, c.topic ? h("p", { class: "muted" }, c.topic) : null, branch(null));
  }

  function openCard(i) {
    setMin(false);
    if (tab !== "boxes") { tab = "boxes"; renderResult(); }
    const card = list.querySelector(`[data-i="${i}"]`);
    if (!card) return;
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.classList.remove("flash"); void card.offsetWidth; card.classList.add("flash");
  }

  function destroy() {
    removeEventListener("scroll", queueDraw, true);
    removeEventListener("resize", queueDraw);
    ro.disconnect();
    if (window.CSS?.highlights) for (const k of ["nl-ov-hl", "nl-ov-wave", "nl-ov-flash"]) CSS.highlights.delete(k);
    host.remove(); pageStyle.remove();
    delete window.NL_OVERLAY;
  }

  // ── 시작 ──
  state.root = findRoot();
  state.paras = collectParagraphs(state.root);
  const cut = (s) => (s.length > 36 ? `${s.slice(0, 36)}…` : s);
  foundMsg.textContent = state.paras.length
    ? `본문 문단 ${state.paras.length}개를 찾았습니다. 블로그 옆 메뉴·댓글은 뺐습니다.`
    : "본문을 찾지 못했습니다.";
  if (state.paras.length) preview.textContent = `첫 문단: ${cut(state.paras[0].text)}\n끝 문단: ${cut(state.paras[state.paras.length - 1].text)}`;
  preview.style.whiteSpace = "pre-wrap";
  paint();
  addEventListener("scroll", queueDraw, { capture: true, passive: true });
  addEventListener("resize", queueDraw);
  const ro = new ResizeObserver(queueDraw);
  ro.observe(document.body);

  window.NL_OVERLAY = {
    toggle: () => setMin(!panel.hasAttribute("data-min")),
    apply: applyText,
    info: () => ({ root: state.root.tagName + (state.root.id ? `#${state.root.id}` : "") + (state.root.className ? `.${String(state.root.className).trim().split(/\s+/).join(".")}` : ""),
      paragraphs: state.paras.length, first: state.paras[0]?.text, last: state.paras.at(-1)?.text }),
    destroy,
  };
})();
