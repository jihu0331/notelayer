// notelayer — 웹페이지 위 표시 층. 북마클릿이 지금 보는 페이지에 templates.js·prompt.js 와 함께 이 파일을 불러온다.
// 원래 페이지의 글자와 디자인은 고치지 않는다.
// - 핵심어(색 글자+밑줄)·형광펜·물결: 브라우저의 글자 범위 칠하기(CSS Custom Highlight API). 페이지 구조를 건드리지 않는다.
//   핵심어는 데이터에서는 circle 이지만 여기서는 동그라미를 그리지 않는다. 원문 위에 테두리를 덧그리면 옆 글자·줄과 겹쳐 읽기 어려웠다
// - 설명 배지·패널: 페이지 위에 겹친 별도 층. Shadow DOM 으로 감싸 페이지 CSS 와 섞이지 않게 한다
// - 패널은 페이지를 밀지 않는다. 오른쪽 여백을 늘려 밀면 화면에 고정된 사이트 메뉴 밑으로 본문이 깔린다(티스토리에서 확인).
//   대신 본문 옆 빈자리에 맞춰 놓고, 자리가 모자라면 별도 창으로 떼어 낸다
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
  const SKIP = "nav,aside,footer,header,form,[role=navigation],[role=complementary],[aria-hidden=true],notelayer-overlay,notelayer-note";
  const BLOCK = "p,div,li,ul,ol,dl,dt,dd,table,tr,td,th,pre,blockquote,h1,h2,h3,h4,h5,h6,section,article,figure,figcaption,main";
  const LEAF = "p,div,li,dt,dd,td,th,pre,blockquote,h1,h2,h3,h4,h5,h6,figcaption";
  // 표시·메모는 notelayer 주소의 저장 창(store.html)이 이 PC 에 저장한다.
  // 이 사이트의 저장 공간에는 넣지 않는다 — 사이트와 그 페이지에 실린 광고·분석 스크립트가 읽을 수 있다
  const SCRIPT_SRC = document.currentScript?.src || window.NL_BASE || "";
  const BASE = SCRIPT_SRC ? SCRIPT_SRC.replace(/[?#].*$/, "").replace(/[^/]*$/, "") : "";
  const NL_ORIGIN = BASE ? new URL(BASE).origin : "";
  // 같은 페이지 알아보기: 페이지가 밝힌 대표 주소(같은 사이트일 때만)에서 #뒤, 광고 추적 꼬리, 열쇠처럼 보이는 꼬리를 뗀다.
  // 물음표 뒤 글 구분(?id=3 같은 것)은 남긴다. 저장 기록·폴더 파일에는 이 정리한 주소만 남는다(비밀번호 재설정 링크의 열쇠 값 같은 것이 남지 않게)
  function pageKey() {
    let u = new URL(location.href);
    try { const c = new URL(document.querySelector('link[rel="canonical"]')?.href || "", location.href); if (c.origin === u.origin) u = c; } catch {}
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) {
      if (/^(utm_|mc_)|^(fbclid|gclid|igshid|ref_src)$/i.test(k) || /token|code|key|sig|session|sid|auth|pass|secret|credential|ticket|otp|nonce|state|jwt/i.test(k)) u.searchParams.delete(k);
    }
    const q = u.searchParams.toString();
    return u.origin + u.pathname + (q ? `?${q}` : "");
  }
  const UI_KEY = "notelayer:ui";
  const PANEL_MIN = 280, PANEL_MAX = 720;
  const SVGNS = "http://www.w3.org/2000/svg";
  const squash = (s) => String(s ?? "").replace(/\s+/g, "");
  const tidy = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
  const textLen = (el) => squash(el.textContent).length;
  const isLeaf = (el) => el.tagName === "PRE" || !el.querySelector(BLOCK);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  let uidN = 0;
  const uid = () => `o${Date.now().toString(36)}${(uidN++).toString(36)}`;
  const store = {
    get(key) { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; } },
    set(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch { return false; } },
    del(key) { try { localStorage.removeItem(key); } catch {} },
  };

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
      const text = el.tagName === "PRE" ? el.innerText.trim() : tidy(el.innerText);
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
      acceptNode: (n) => (n.parentElement?.closest("script,style,noscript,notelayer-overlay,notelayer-note") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    for (let n; (n = walker.nextNode()); ) {
      const t = n.data;
      for (let i = 0; i < t.length; i++) if (!/\s/.test(t[i])) { chars.push(t[i]); map.push([n, i]); }
    }
    idx = { text: chars.join(""), map };
    indexCache.set(el, idx);
    return idx;
  }
  // 표시마다 앞뒤 글자(공백 뺀 32자)를 함께 저장한다(웹 주석 표준의 「인용 + 앞뒤 글자」 방식)
  const CTX = 32;
  function occurrences(text, q) {
    const out = [];
    for (let i = q ? text.indexOf(q) : -1; i >= 0; i = text.indexOf(q, i + 1)) out.push(i);
    return out;
  }
  const tailMatch = (a, b) => { let n = 0; while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++; return n; };
  const headMatch = (a, b) => { let n = 0; while (n < a.length && n < b.length && a[n] === b[n]) n++; return n; };
  function spanRange(idx, at, len) {
    const [sn, so] = idx.map[at], [en, eo] = idx.map[at + len - 1];
    const r = document.createRange();
    r.setStart(sn, so); r.setEnd(en, eo + 1);
    return r;
  }
  // 구절 찾기. 앞뒤 글자(ctx)가 있으면
  // - 같은 구절이 여러 번 나올 때 앞뒤가 가장 잘 맞는 자리를 고르고
  // - 구절이 고쳐져 그대로는 없으면(fuzzy) 앞뒤 글자 사이를 새 자리로 잡는다(moved)
  function locate(el, quote, ctx = null, fuzzy = true) {
    const idx = textIndex(el), q = squash(quote);
    const hits = occurrences(idx.text, q);
    if (hits.length) {
      let best = hits[0];
      if (ctx && hits.length > 1) {
        let top = -1;
        for (const at of hits) {
          const score = tailMatch(idx.text.slice(Math.max(0, at - CTX), at), ctx.prefix || "") + headMatch(idx.text.slice(at + q.length, at + q.length + CTX), ctx.suffix || "");
          if (score > top) { top = score; best = at; }
        }
      }
      return { range: spanRange(idx, best, q.length), moved: false };
    }
    const pre = (ctx?.prefix || "").slice(-10), suf = (ctx?.suffix || "").slice(0, 10);
    if (fuzzy && pre.length >= 6 && suf.length >= 6) {
      const maxLen = Math.max(q.length * 2, q.length + 30);
      for (const p of occurrences(idx.text, pre)) {
        const start = p + pre.length, end = idx.text.indexOf(suf, start);
        if (end > start && end - start <= maxLen) return { range: spanRange(idx, start, end - start), moved: true };
      }
    }
    return null;
  }
  // 저장할 때 표시의 앞뒤 글자를 뽑는다
  function contextOf(range) {
    const i = paraIndexOf(range.startContainer);
    const idx = textIndex(i >= 0 ? state.paras[i].el : state.root);
    let first = -1, last = -1;
    for (let k = 0; k < idx.map.length; k++) {
      const [node, off] = idx.map[k];
      let inside = false;
      try { inside = range.isPointInRange(node, off) && !(node === range.endContainer && off === range.endOffset); } catch {}
      if (inside) { if (first < 0) first = k; last = k; } else if (first >= 0) break;
    }
    return first < 0 ? {} : { prefix: idx.text.slice(Math.max(0, first - CTX), first), suffix: idx.text.slice(last + 1, last + 1 + CTX) };
  }

  // ── 상태 ──
  const ui = store.get(UI_KEY) || {};
  const state = {
    tpl: Object.keys(TEMPLATES)[0],
    root: null, paras: [],
    marks: [],            // { id, kind, quote, range, mine }
    orphans: [],          // 제자리를 잃은 표시 { kind, quote, p, prefix, suffix, mine } — 버리지 않고 저장해 두었다가 다시 붙인다
    attaching: null,      // 다시 붙이는 중인 orphan
    boxes: [],            // { id, label, text, pre, answer, el, mine }
    concepts: null,
    show: { circle: true, highlight: true, wave: true, boxes: true },
    editing: false,
    side: ui.side || null, width: ui.width || null,
    // 설명 카드 위치: inline = 해당 문단 바로 아래 본문 속(기본), side = 옆 패널 + 문단 옆 배지
    boxMode: ui.boxMode === "side" ? "side" : "inline",
    popup: null,
  };
  const paraIndexOf = (node) => {
    const el = node?.nodeType === 1 ? node : node?.parentElement;
    return el ? state.paras.findIndex((x) => x.el === el || x.el.contains(el)) : -1;
  };
  const boxOrder = (b) => state.paras.findIndex((x) => x.el === b.el);
  const sortedBoxes = () => [...state.boxes].sort((a, b) => boxOrder(a) - boxOrder(b));

  // AI 가 매긴 문단 번호(p)를 이 페이지 문단 자리로 옮긴다.
  // 이 층이 만든 요청문으로 받은 답이면 그대로 맞고, 다른 데서 뽑은 글로 만든 답이면 긴 인용으로 어긋난 정도를 배워 바로잡는다
  function anchor(result) {
    const P = state.paras, n = P.length;
    const at = (i) => clamp(i, 0, n - 1);
    const everywhere = Array.from({ length: n }, (_, i) => i);
    // 가까운 문단에서 그대로 → 가까운 문단에서 앞뒤 글자로 → 전체에서 그대로 → 전체에서 앞뒤 글자로
    const findPara = (quote, hint, spread, ctx = null) => {
      const near = [hint];
      for (let d = 1; d <= spread; d++) near.push(hint - d, hint + d);
      for (const scope of [near.filter((i) => i >= 0 && i < n), everywhere]) {
        for (const fuzzy of ctx ? [false, true] : [false]) {
          for (const i of scope) { const hit = locate(P[i].el, quote, ctx, fuzzy); if (hit) return { i, hit }; }
        }
      }
      return null;
    };
    const ctxOf = (m) => (typeof m.prefix === "string" || typeof m.suffix === "string" ? { prefix: String(m.prefix || ""), suffix: String(m.suffix || "") } : null);
    const raw = (Array.isArray(result.marks) ? result.marks : [])
      .filter((m) => m && KINDS.includes(m.kind) && typeof m.quote === "string" && squash(m.quote));
    const pOf = (m) => (Number.isFinite(Number(m.p)) ? Number(m.p) : 1);
    const learned = [];
    for (const m of raw) {
      if (squash(m.quote).length < 12) continue;
      const f = findPara(m.quote, at(pOf(m) - 1), 0, ctxOf(m));
      if (f && !f.hit.moved) learned.push([pOf(m), f.i]);
    }
    const guess = (p) => {
      if (!learned.length) return at(p - 1);
      let best = learned[0];
      for (const l of learned) if (Math.abs(l[0] - p) < Math.abs(best[0] - p)) best = l;
      return at(p - 1 + (best[1] - (best[0] - 1)));
    };
    const marks = [], lost = [];
    let moved = 0;
    for (const m of raw) {
      const ctx = ctxOf(m);
      const hit = findPara(m.quote, guess(pOf(m)), 3, ctx)?.hit || locate(state.root, m.quote, ctx); // 문단 경계를 넘는 인용은 본문 전체에서
      if (hit) {
        if (hit.moved) moved++;
        marks.push({ id: uid(), kind: m.kind, quote: hit.moved ? tidy(hit.range.toString()) : m.quote, range: hit.range, mine: !!m.mine });
      } else lost.push({ kind: m.kind, quote: m.quote, p: pOf(m), ...(ctx || {}), mine: !!m.mine });
    }
    const labels = Object.keys(TEMPLATES[state.tpl].boxes);
    const boxes = (Array.isArray(result.boxes) ? result.boxes : [])
      .filter((b) => b && typeof b.text === "string" && (b.text.trim() || b.mine) && n)
      .map((b) => ({
        id: uid(), label: typeof b.label === "string" && b.label ? b.label : labels[0], text: b.text.trim(),
        pre: typeof b.pre === "string" && b.pre.trim() ? b.pre : "", answer: typeof b.answer === "string" ? b.answer.trim() : "",
        el: P[guess(Number.isFinite(Number(b.p)) ? Number(b.p) : 1)].el, mine: !!b.mine,
      }));
    return { marks, boxes, lost, moved, total: raw.length };
  }

  function cleanConcepts(c) {
    if (!c || !Array.isArray(c.nodes)) return null;
    const nodes = c.nodes.filter((n) => n && n.id != null && typeof n.term === "string" && n.term.trim())
      .map((n) => ({ ...n, id: String(n.id), parent: n.parent == null || n.parent === "" ? null : String(n.parent) }));
    const ids = new Set(nodes.map((n) => n.id));
    for (const n of nodes) if (n.parent && (!ids.has(n.parent) || n.parent === n.id)) n.parent = null;
    // 상위 개념이 돌고 도는 관계는 끊는다
    for (const n of nodes) { const seen = new Set([n.id]); let p = n.parent; while (p) { if (seen.has(p)) { n.parent = null; break; } seen.add(p); p = nodes.find((x) => x.id === p)?.parent; } }
    const links = (Array.isArray(c.links) ? c.links : []).map((l) => ({ from: String(l?.from), to: String(l?.to), label: tidy(l?.label).slice(0, 24) }))
      .filter((l) => ids.has(l.from) && ids.has(l.to) && l.from !== l.to && l.label);
    return nodes.length ? { topic: tidy(c.topic) || document.title, nodes, links } : null;
  }

  // ── 저장: 고친 결과까지 페이지 주소별로 남긴다. p 는 이 페이지 문단 번호라 다시 열면 그대로 맞는다 ──
  function serialize({ exporting = false } = {}) {
    return {
      marks: [
        ...state.marks.map((m) => ({ p: paraIndexOf(m.range.startContainer) + 1 || 1, kind: m.kind, quote: m.quote, ...contextOf(m.range), ...(m.mine ? { mine: true } : {}) })),
        ...(exporting ? [] : state.orphans.map(({ mine, ...o }) => ({ ...o, ...(mine ? { mine: true } : {}), orphan: true }))),
      ],
      boxes: sortedBoxes().map((b) => ({ p: boxOrder(b) + 1 || 1, label: b.label, text: b.text, ...(b.pre ? { pre: b.pre } : {}), ...(b.answer ? { answer: b.answer } : {}), ...(b.mine ? { mine: true } : {}) })),
      ...(state.concepts ? { concepts: state.concepts } : {}),
    };
  }
  const hasData = () => !!(state.marks.length || state.orphans.length || state.boxes.length || state.concepts);
  let saveTimer = 0;
  // 고칠 때마다 저장 창에 보낸다. 저장 창이 닫혀 있으면 「저장하지 않은 변경」으로 남겨 두었다가 다시 연결되면 보낸다
  function save() {
    conn.dirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      if (!conn.ready) { renderStore(); return; }
      try {
        if (!hasData()) { await send("delete"); setSaved("이 페이지에 저장한 표시를 지웠습니다."); }
        else {
          const r = await send("save", { data: { v: 1, tpl: state.tpl, ...serialize() }, paragraphs: state.paras.map((x) => x.text) });
          setSaved(`저장했습니다 · ${fmtTime(r.at)}${r.file ? " · 폴더에도 파일로 저장" : ""}`);
        }
        conn.dirty = false;
      } catch (err) {
        if (!conn.win || conn.win.closed) conn.ready = false;
        setSaved(`저장하지 못했습니다: ${err.message}`, true);
      }
      renderStore();
    }, 400);
  }

  // ── 그리기 ──
  const pageStyle = document.createElement("style");
  pageStyle.id = "notelayer-overlay-style";
  document.head.appendChild(pageStyle);
  const host = document.createElement("notelayer-overlay");
  host.style.cssText = "all:initial;position:absolute;left:0;top:0;width:0;height:0;z-index:2147483000;";
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });

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
  const svgEl = (tag, attrs = {}) => {
    const e = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  };

  // 패널 CSS 는 페이지 안(Shadow DOM)과 떼어 낸 창이 함께 쓴다
  const PANEL_CSS = `
    * { box-sizing: border-box; }
    .panel { position: fixed; top: 12px; bottom: 12px; display: flex; flex-direction: column; pointer-events: auto;
      background: #fff; color: #1f2328; border: 1px solid #e5e7eb; border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,.18);
      font: 13px/1.6 "Pretendard", "IBM Plex Sans KR", "Malgun Gothic", sans-serif; overflow: hidden; }
    .panel[data-min] { display: none; }
    .panel.popped { position: static; width: auto !important; height: 100vh; border: 0; border-radius: 0; box-shadow: none; }
    .panel.popped .grip, .panel.popped .dock-only { display: none; }
    .grip { position: absolute; top: 0; bottom: 0; width: 8px; cursor: ew-resize; z-index: 3; }
    .grip:hover { background: rgba(99, 102, 241, .15); }
    header { display: flex; align-items: center; gap: 4px; padding: 8px 10px; border-bottom: 1px solid #eef0f2; }
    header b { font-size: 14px; margin-right: 2px; }
    header select { flex: 1; min-width: 0; }
    .edit-bar { display: none; padding: 6px 12px; background: #fff7ed; color: #9a3412; font-size: 12px; border-bottom: 1px solid #fde4c8; }
    .panel[data-editing] .edit-bar { display: block; }
    .body { overflow: auto; padding: 12px; flex: 1; }
    button, select, textarea { font: inherit; color: inherit; }
    button { cursor: pointer; border: 1px solid #d0d7de; background: #f6f8fa; border-radius: 8px; padding: 5px 10px; }
    button.primary { background: #1f2328; color: #fff; border-color: #1f2328; }
    button.icon { border: 0; background: none; padding: 2px 6px; font-size: 14px; color: #6b7280; border-radius: 6px; }
    button.icon:hover { background: #f3f4f6; }
    button.toggle[aria-pressed="true"] { background: #fff7ed; color: #c2410c; }
    .row { display: flex; gap: 6px; flex-wrap: wrap; margin: 6px 0; }
    .muted { color: #6b7280; font-size: 12px; margin: 4px 0; white-space: pre-wrap; }
    .msg { font-size: 12px; margin: 6px 0; color: #0f766e; white-space: pre-wrap; word-break: break-all; }
    .msg.err { color: #b42318; }
    h3 { font-size: 12px; margin: 12px 0 4px; color: #374151; }
    textarea { width: 100%; height: 90px; resize: vertical; border: 1px solid #d0d7de; border-radius: 8px; padding: 6px; font-size: 12px; }
    details.steps > summary { cursor: pointer; color: #6b7280; font-size: 12px; margin-bottom: 6px; }
    .savebar { margin: 0 0 8px; padding: 6px 10px; border-radius: 8px; background: #f6f8fa; }
    .savebar .msg { margin: 2px 0; }
    .savebar .msg:empty { display: none; }
    .savebar button[hidden] { display: none; }
    .savebar button { margin: 4px 0 2px; }
    .orphans { border: 1px solid #fde68a; background: #fffbeb; border-radius: 8px; padding: 8px 10px; margin-bottom: 8px; font-size: 12px; }
    .o-head { font-weight: 600; color: #92400e; }
    .o-sub { font-weight: 400; color: #78716c; }
    .o-attach { margin: 6px 0; color: #9a3412; }
    .o-item { display: flex; align-items: center; gap: 6px; margin-top: 6px; }
    .o-item.on { background: #fef3c7; border-radius: 6px; }
    .o-q { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .o-item button { font-size: 11px; padding: 2px 8px; }
    .legend { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
    .legend button { font-size: 12px; padding: 3px 8px; border-radius: 999px; }
    .legend button[aria-pressed="false"] { opacity: .4; }
    .sw { display: inline-block; vertical-align: middle; margin-right: 4px; }
    .sw-key { color: var(--circle); font-weight: 700; text-decoration: underline solid var(--circle); text-decoration-thickness: 2px; text-underline-offset: 2px; }
    .sw-hl { width: 16px; height: 10px; background: var(--hl); }
    .sw-wave { width: 16px; height: 2px; border-bottom: 2px dotted var(--wave); }
    .tabs { display: flex; gap: 4px; border-bottom: 1px solid #eef0f2; margin: 8px 0; }
    .tabs button { border: 0; border-bottom: 2px solid transparent; border-radius: 0; background: none; padding: 6px 8px; color: #6b7280; }
    .tabs button[aria-selected="true"] { border-bottom-color: #1f2328; color: #1f2328; font-weight: 600; }
    .card { border: 1px solid #eef0f2; border-left: 3px solid var(--c); border-radius: 8px; padding: 8px 10px; margin: 8px 0; cursor: pointer; }
    .card:hover { background: #fafbfc; }
    .panel[data-editing] .card { cursor: default; }
    .card.flash { animation: flash 1.2s; }
    @keyframes flash { from { background: rgba(245, 158, 11, .25); } to { background: transparent; } }
    .card-head { display: flex; align-items: center; gap: 6px; margin-bottom: 2px; }
    .chip { display: inline-block; font-size: 11px; font-weight: 600; color: var(--c); }
    .card-head select { font-size: 11px; font-weight: 600; color: var(--c); border: 1px solid #e5e7eb; border-radius: 6px; padding: 1px 4px; }
    .card-head .grow { flex: 1; }
    .card pre { margin: 6px 0 0; padding: 6px 8px; background: #f6f8fa; border-radius: 6px; font: 11.5px/1.5 Consolas, "D2Coding", monospace; white-space: pre; overflow-x: auto; }
    .card details { margin-top: 6px; }
    .card summary { cursor: pointer; color: #9c36b5; font-size: 12px; }
    [contenteditable] { outline: none; border-radius: 4px; }
    [contenteditable]:focus { box-shadow: 0 0 0 2px rgba(234, 88, 12, .35); }
    [contenteditable]:empty::before { content: attr(data-ph); color: #9ca3af; }
    .ans-ed { margin-top: 6px; font-size: 12px; color: #6b21a8; }
    .map { position: relative; }
    .map-lines { position: absolute; left: 0; top: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; z-index: 0; }
    .map-lines .tree { fill: none; stroke: #cbd5e1; stroke-width: 1.5; }
    .map-lines .rel { fill: none; stroke: #6366f1; stroke-width: 1.4; stroke-dasharray: 4 3; }
    .map-lines .rel.on { stroke-width: 2.4; stroke-dasharray: none; }
    .map-lines .arrow { fill: #6366f1; }
    .mnode { position: relative; z-index: 1; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 5px 8px; margin: 10px 0; }
    .mnode.topic { display: inline-block; background: #1f2328; color: #fff; border-color: #1f2328; font-weight: 600; font-size: 12px; margin-top: 2px; }
    .mnode.on { border-color: #6366f1; box-shadow: 0 0 0 2px rgba(99, 102, 241, .2); }
    .mnode .term { cursor: pointer; font-weight: 600; }
    .mnode .role { color: #9ca3af; font-size: 11px; margin-left: 4px; font-weight: 400; }
    .mnode .gloss { color: #4b5563; font-size: 12px; line-height: 1.5; }
    .mnode .points { margin: 4px 0 0; padding-left: 16px; font-size: 12px; color: #374151; }
    .rel-label { position: absolute; z-index: 2; font-size: 10.5px; line-height: 1.35; color: #4338ca; background: #eef2ff; border-radius: 6px; padding: 1px 5px; cursor: default; }
    .rel-label.on { background: #6366f1; color: #fff; }
  `;
  shadow.append(h("style", {}, `
    :host { all: initial; }
    .layer { position: absolute; left: 0; top: 0; width: 1px; height: 1px; overflow: visible; pointer-events: none; }
    .badge { position: absolute; pointer-events: auto; cursor: pointer; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 999px;
      color: #fff; font: 600 11px/20px "Pretendard", "Malgun Gothic", sans-serif; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,.25); }
    .badge:hover { transform: scale(1.1); }
    .root-box { position: absolute; border: 2px dashed #f59e0b; border-radius: 6px; background: rgba(245, 158, 11, .06); }
    .pill { position: fixed; right: 16px; bottom: 16px; pointer-events: auto; cursor: pointer; padding: 8px 14px; border-radius: 999px; border: 0;
      background: #1f2328; color: #fff; font: 600 12px "Pretendard", "Malgun Gothic", sans-serif; box-shadow: 0 4px 14px rgba(0,0,0,.25); }
    .pill[hidden] { display: none; }
    .pop { position: absolute; z-index: 5; pointer-events: auto; display: flex; gap: 2px; padding: 4px; border-radius: 9px; background: #1f2328; color: #fff;
      font: 12px/1.4 "Pretendard", "Malgun Gothic", sans-serif; box-shadow: 0 6px 18px rgba(0,0,0,.3); white-space: nowrap; }
    .pop[hidden] { display: none; }
    .pop button { border: 0; background: none; color: #fff; padding: 4px 8px; border-radius: 6px; cursor: pointer; font: inherit; }
    .pop button:hover { background: rgba(255,255,255,.15); }
    .pop button[aria-pressed="true"] { background: rgba(255,255,255,.28); }
    .pop .sep { width: 1px; background: rgba(255,255,255,.2); margin: 2px 2px; }
  ` + PANEL_CSS));
  const badgeLayer = h("div", { class: "layer" });
  const pop = h("div", { class: "pop", hidden: true, onmousedown: (e) => e.preventDefault() });
  shadow.append(badgeLayer);

  const colors = () => MARK_COLORS[state.tpl] || MARK_COLORS.tech;
  function paint() {
    const c = colors();
    pageStyle.textContent = `::highlight(nl-ov-key){color:${c.circle};text-decoration:underline solid ${c.circle};text-decoration-thickness:2px;text-underline-offset:3px}
::highlight(nl-ov-hl){background-color:${c.hl}}
::highlight(nl-ov-wave){text-decoration:underline wavy ${c.wave};text-decoration-thickness:1.5px;text-underline-offset:4px}
::highlight(nl-ov-flash){background-color:rgba(245,158,11,.4)}`;
    panel.style.setProperty("--circle", c.circle); panel.style.setProperty("--hl", c.hl); panel.style.setProperty("--wave", c.wave);
    if (!window.CSS?.highlights) return;
    const of = (k) => (state.show[k] ? state.marks.filter((m) => m.kind === k).map((m) => m.range) : []);
    CSS.highlights.set("nl-ov-key", new Highlight(...of("circle")));
    CSS.highlights.set("nl-ov-hl", new Highlight(...of("highlight")));
    CSS.highlights.set("nl-ov-wave", new Highlight(...of("wave")));
  }

  // 한 표시가 굵은 글씨·링크처럼 여러 조각에 걸치면 조각마다 네모가 나온다. 같은 줄의 조각은 하나로 합친다
  function lineRects(range) {
    const rects = [...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5).sort((a, b) => a.top - b.top || a.left - b.left);
    const lines = [];
    for (const r of rects) {
      const line = lines.find((l) => Math.min(l.bottom, r.bottom) - Math.max(l.top, r.top) > Math.min(l.bottom - l.top, r.height) * 0.5);
      if (line) Object.assign(line, { left: Math.min(line.left, r.left), right: Math.max(line.right, r.right), top: Math.min(line.top, r.top), bottom: Math.max(line.bottom, r.bottom) });
      else lines.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
    }
    return lines;
  }

  const panelDocked = () => !state.popup;
  // 설명 배지는 문서 좌표에 그린다. 안쪽 스크롤 영역·글자 크기 변화에 맞춰 다시 그린다
  let raf = 0;
  const queueDraw = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(drawLayer); };
  function drawLayer() {
    for (const b of badgeLayer.querySelectorAll(".badge")) b.remove();
    const sx = window.scrollX, sy = window.scrollY;
    renderInline();
    if (!state.show.boxes || state.boxMode === "inline") return;
    const boxColors = TEMPLATES[state.tpl].boxes;
    const groups = new Map();
    for (const b of sortedBoxes()) { if (!groups.has(b.el)) groups.set(b.el, []); groups.get(b.el).push(b); }
    // 배지는 패널 반대쪽 여백에 단다
    const onRight = panelDocked() && state.side === "left";
    for (const [el, list] of groups) {
      const r = el.getClientRects()[0];
      if (!r) continue;
      const left = onRight ? r.right + 8 : r.left > 34 ? r.left - 28 : r.right + 8;
      badgeLayer.append(h("div", {
        class: "badge", title: list.map((b) => b.label).join(", "),
        style: `left:${left + sx}px;top:${r.top + sy}px;background:${boxColors[list[0].label] || "#6b7280"}`,
        onclick: () => openCard(list[0].id),
      }, list.length > 1 ? String(list.length) : "i"));
    }
  }

  // ── 본문 속 설명 카드: 해당 문단 바로 아래에 끼운다. 원문 글자는 건드리지 않고, 카드는 Shadow DOM 으로 감싸 페이지 CSS 와 섞이지 않게 한다 ──
  const INLINE_CSS = `
    :host { all: initial; display: block; margin: 8px 0 14px; }
    .card { border: 1px solid #e5e7eb; border-left: 3px solid var(--c); border-radius: 8px; background: #f8fafc; color: #1f2328;
      padding: 8px 12px; margin: 6px 0; font: 14px/1.65 "Pretendard", "IBM Plex Sans KR", "Malgun Gothic", sans-serif; text-align: left; }
    .head { display: flex; align-items: center; gap: 6px; margin-bottom: 2px; }
    .chip { font-size: 12px; font-weight: 700; color: var(--c); }
    .grow { flex: 1; }
    .edit { border: 0; background: none; color: #9ca3af; cursor: pointer; font-size: 12px; padding: 0 4px; visibility: hidden; }
    .card:hover .edit { visibility: visible; }
    pre { margin: 6px 0 0; padding: 6px 8px; background: #eef2f6; border-radius: 6px; font: 12.5px/1.5 Consolas, "D2Coding", monospace; white-space: pre; overflow-x: auto; }
    details { margin-top: 6px; }
    summary { cursor: pointer; color: #9c36b5; font-size: 13px; }
  `;
  const inlineHosts = [];
  let inlineSig = "";
  function renderInline() {
    const on = state.boxMode === "inline" && state.show.boxes;
    const list = on ? sortedBoxes() : [];
    const sig = JSON.stringify([state.tpl, list.map((b) => [boxOrder(b), b.id, b.label, b.text, b.pre, b.answer])]);
    if (sig === inlineSig) return; // 내용이 그대로면 손대지 않는다(끼우면 페이지 높이가 바뀌어 다시 그리기가 돌아오므로)
    inlineSig = sig;
    for (const x of inlineHosts.splice(0)) x.remove();
    const colors = TEMPLATES[state.tpl].boxes;
    const groups = new Map();
    for (const b of list) { if (!groups.has(b.el)) groups.set(b.el, []); groups.get(b.el).push(b); }
    for (const [el, items] of groups) {
      if (!el.isConnected) continue;
      const box = document.createElement("notelayer-note");
      const sr = box.attachShadow({ mode: "open" });
      sr.append(h("style", {}, INLINE_CSS), ...items.map((b) => h("div", { class: "card", style: `--c:${colors[b.label] || "#6b7280"}` },
        h("div", { class: "head" }, h("span", { class: "chip" }, b.label), h("span", { class: "grow" }),
          h("button", { class: "edit", title: "패널에서 고치기", onclick: () => { if (!state.editing) setEditing(true); openCard(b.id); } }, "✎ 고치기")),
        h("div", {}, b.text),
        b.pre ? h("pre", {}, b.pre) : null,
        b.answer ? h("details", {}, h("summary", {}, "답 보기"), h("div", {}, b.answer)) : null)));
      // 목록 칸·표 칸 안의 문단이면 그 칸 안에, 아니면 문단 바로 뒤에 끼운다(표·목록 모양을 깨지 않게)
      if (/^(LI|TD|TH|DT|DD)$/.test(el.tagName)) el.append(box); else el.after(box);
      inlineHosts.push(box);
    }
  }
  // 본문 속 카드 모드에서 패널이 본문을 가리면(반화면 등) 작은 버튼으로 접는다
  function tuckIfCovering() {
    if (state.boxMode !== "inline" || !panelDocked() || panel.hasAttribute("data-min")) return;
    const p = panel.getBoundingClientRect(), r = state.root.getBoundingClientRect();
    if (p.left < r.right - 40 && p.right > r.left + 40) setMin(true);
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
  const tplSelect = h("select", { onchange: (e) => { state.tpl = e.target.value; paint(); drawLayer(); renderResult(); save(); } },
    Object.entries(TEMPLATES).map(([id, t]) => h("option", { value: id }, t.name)));
  const pill = h("button", { class: "pill", hidden: true, onclick: () => setMin(false) }, "notelayer");
  const foundMsg = h("p", { class: "muted" });
  const copyMsg = h("p", { class: "msg" });
  const answer = h("textarea", { placeholder: "AI 가 돌려준 답(JSON)을 그대로 붙여 넣으세요" });
  const applyMsg = h("p", { class: "msg" });
  const storeState = h("div", { class: "msg" });
  const savedMsg = h("div", { class: "msg" });
  const storeOpenBtn = h("button", { class: "primary", hidden: true, onclick: () => openStore() }, "저장 창 열기");
  const saveBar = h("div", { class: "savebar" }, storeState, savedMsg, storeOpenBtn);
  const setMsg = (el, text, err = false) => { el.className = err ? "msg err" : "msg"; el.textContent = text; };
  const steps = h("details", { class: "steps", open: true },
    h("summary", {}, "요청문 복사 · 답 붙여 넣기 · 내보내기"),
    h("h3", {}, "1. 이 페이지 본문으로 요청문 만들기"), foundMsg,
    h("div", { class: "row" },
      h("button", { class: "primary", onclick: copyPrompt }, "요청문 복사"),
      h("button", { onclick: showRoot }, "본문 영역 보기")),
    copyMsg,
    h("h3", {}, "2. 쓰는 AI 에 붙여 넣고, 받은 답을 여기에"), answer,
    h("div", { class: "row" }, h("button", { class: "primary", onclick: () => applyText(answer.value) }, "적용")),
    applyMsg,
    h("h3", {}, "3. 내보내기 · 지우기"),
    h("div", { class: "row" },
      h("button", { onclick: copyResult }, "지금 표시를 JSON 으로 복사"),
      h("button", { onclick: clearSaved }, "표시 모두 지우기")));
  const legend = h("div", { class: "legend" });
  const tabs = h("div", { class: "tabs" });
  const list = h("div");
  const orphanBox = h("div");
  const resultBox = h("div", { hidden: true }, orphanBox, legend, tabs, list);
  const editBtn = h("button", { class: "icon toggle", title: "수정 모드", "aria-pressed": "false", onclick: () => setEditing(!state.editing) }, "✎ 수정");
  const sideBtn = h("button", { class: "icon dock-only", title: "패널을 반대쪽으로", onclick: () => { state.side = state.side === "left" ? "right" : "left"; saveUi(); placePanel(); } }, "⇆");
  const popBtn = h("button", { class: "icon", title: "별도 창으로 떼어 내기", onclick: () => (state.popup ? dockBack(true) : popOut()) }, "⧉");
  const grip = h("div", { class: "grip", onpointerdown: startResize });
  const panel = h("aside", { class: "panel" },
    grip,
    h("header", {}, h("b", {}, "notelayer"), tplSelect, editBtn, sideBtn, popBtn,
      h("button", { class: "icon dock-only", title: "접기", onclick: () => setMin(true) }, "—"),
      h("button", { class: "icon", title: "닫기(저장한 표시는 남는다)", onclick: destroy }, "✕")),
    h("div", { class: "edit-bar" }, "수정 모드 — 본문 글자를 끌어 골라 표시·설명을 달고, 표시를 눌러 종류를 바꾸거나 지웁니다. 설명 카드는 글을 눌러 바로 고칩니다."),
    h("div", { class: "body" }, saveBar, steps, resultBox));
  // 도구 막대는 패널보다 위에 그려야 패널 옆 글자를 골라도 눌린다
  shadow.append(panel, pill, pop);

  function setMin(min) {
    if (min) panel.setAttribute("data-min", ""); else panel.removeAttribute("data-min");
    pill.hidden = !min;
  }
  const saveUi = () => store.set(UI_KEY, { side: state.side, width: state.width, boxMode: state.boxMode });

  // 본문 양옆 빈자리 중 넓은 쪽에, 그 폭에 맞춰 둔다. 자리가 모자라면 기본 폭으로 겹쳐 두고 별도 창을 권한다
  function autoPlace() {
    const r = state.root.getBoundingClientRect();
    const left = r.left, right = innerWidth - r.right;
    state.side ??= right >= left ? "right" : "left";
    const gap = state.side === "right" ? right : left;
    state.width ??= gap >= PANEL_MIN + 20 ? Math.min(560, gap - 20) : 360;
  }
  function placePanel() {
    if (!panelDocked()) return;
    state.width = clamp(state.width, PANEL_MIN, Math.min(PANEL_MAX, innerWidth - 40));
    Object.assign(panel.style, state.side === "left"
      ? { left: "12px", right: "auto", width: `${state.width}px` }
      : { right: "12px", left: "auto", width: `${state.width}px` });
    Object.assign(grip.style, state.side === "left" ? { right: "-4px", left: "auto" } : { left: "-4px", right: "auto" });
    queueDraw();
    if (tab === "concepts") renderResult();
  }
  function startResize(e) {
    e.preventDefault();
    const x0 = e.clientX, w0 = state.width;
    const move = (ev) => { state.width = w0 + (state.side === "left" ? ev.clientX - x0 : x0 - ev.clientX); placePanel(); };
    const up = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); saveUi(); };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
  }

  // 별도 창: 같은 출처의 빈 창을 열고 패널을 통째로 옮긴다. 창을 닫으면 페이지로 돌아온다
  function popOut() {
    const w = Math.max(380, state.width || 380);
    const win = window.open("", "notelayer-panel", `popup=yes,width=${w},height=${Math.max(500, screen.availHeight - 80)},left=${Math.max(0, screen.availWidth - w)},top=0`);
    if (!win) { setMsg(applyMsg, "팝업이 막혀 창을 띄우지 못했습니다. 주소창 오른쪽에서 이 사이트의 팝업을 허용해 주세요.", true); steps.open = true; return; }
    const doc = win.document;
    doc.open(); doc.write("<!doctype html><html lang=\"ko\"><head><meta charset=\"utf-8\"><title>notelayer</title></head><body style=\"margin:0\"></body></html>"); doc.close();
    doc.title = `notelayer — ${document.title}`;
    doc.head.append(Object.assign(doc.createElement("style"), { textContent: PANEL_CSS }));
    state.popup = win;
    panel.classList.add("popped");
    doc.body.append(doc.adoptNode(panel));
    pill.hidden = true;
    popBtn.title = "창을 닫고 페이지로 붙이기";
    win.addEventListener("pagehide", () => dockBack(false));
    queueDraw();
    renderResult();
  }
  function dockBack(closeWin) {
    const win = state.popup;
    if (!win) return;
    state.popup = null;
    panel.classList.remove("popped");
    panel.removeAttribute("data-min");
    shadow.append(document.adoptNode(panel));
    popBtn.title = "별도 창으로 떼어 내기";
    if (closeWin) try { win.close(); } catch {}
    placePanel();
    renderResult();
  }

  async function copyText(text) {
    const doc = panel.ownerDocument, win = doc.defaultView;
    try { await win.navigator.clipboard.writeText(text); return true; }
    catch {
      const ta = doc.createElement("textarea");
      ta.value = text; ta.style.cssText = "position:fixed;left:-9999px";
      doc.body.append(ta); ta.select();
      const ok = doc.execCommand("copy"); ta.remove();
      return ok;
    }
  }
  async function copyPrompt() {
    const text = PROMPT.build({ title: document.title, paragraphs: state.paras, templateId: state.tpl, template: TEMPLATES[state.tpl] });
    const ok = await copyText(text);
    setMsg(copyMsg, ok ? `복사했습니다(${text.length.toLocaleString()}자). 쓰는 AI 에 붙여 넣으세요.` : "복사하지 못했습니다.", !ok);
  }
  async function copyResult() {
    const ok = await copyText(JSON.stringify(serialize({ exporting: true })));
    setMsg(applyMsg, ok ? "지금 표시·설명을 JSON 으로 복사했습니다. notelayer 화면의 「AI 표시 만들기」 답 칸에 붙여 넣어도 됩니다." : "복사하지 못했습니다.", !ok);
  }
  function clearSaved() {
    if (!confirm("이 페이지의 표시·설명을 모두 지울까요? 저장한 것도 지워집니다.")) return;
    state.marks = []; state.orphans = []; state.attaching = null; state.boxes = []; state.concepts = null;
    paint(); drawLayer(); renderResult(); save();
    setMsg(applyMsg, "모두 지웠습니다.");
  }

  function applyText(text) {
    let result;
    try { result = PROMPT.parseAnswer(text, state.tpl); }
    catch (err) { setMsg(applyMsg, `읽지 못했습니다: ${err.message}`, true); return null; }
    return apply(result);
  }

  // 새 AI 답은 AI 것만 바꾸고 내가 단 표시·설명은 남긴다(notelayer 화면과 같은 규칙). 저장본을 열 때는 그대로 되살린다
  function apply(result, { restored = false } = {}) {
    if (!restored && (state.marks.some((m) => !m.mine) || state.boxes.some((b) => !b.mine))
      && !confirm("지금 있는 AI 표시·설명을 이 답으로 바꿀까요? 내가 단 표시와 설명은 남습니다.")) return null;
    const a = anchor(result);
    state.marks = restored ? a.marks : [...state.marks.filter((m) => m.mine), ...a.marks];
    state.orphans = restored ? a.lost : state.orphans.filter((o) => o.mine);
    state.attaching = null;
    state.boxes = restored ? a.boxes : [...state.boxes.filter((b) => b.mine), ...a.boxes];
    const c = cleanConcepts(result.concepts);
    if (c || restored) state.concepts = c;
    paint(); drawLayer(); renderResult();
    if (!restored || a.moved) save(); // 자리를 다시 잡은 표시는 새 구절·앞뒤 글자로 저장해 둔다
    tuckIfCovering();
    const placed = a.marks.length;
    const parts = [`${restored ? "저장한 " : ""}표시 ${placed}/${a.total}개, 설명 ${a.boxes.length}개를 얹었습니다`];
    if (state.concepts) parts.push(`개념 ${state.concepts.nodes.length}개`);
    if (a.moved) parts.push(`글이 바뀌어 자리를 다시 잡은 표시 ${a.moved}개`);
    if (a.lost.length) parts.push(restored
      ? `\n제자리를 잃은 표시 ${a.lost.length}개 — 원문이 바뀌어 찾지 못했습니다. 패널 위쪽 목록에서 다시 붙이거나 지울 수 있습니다`
      : `\n원문에서 찾지 못한 표시 ${a.lost.length}개: ${a.lost.slice(0, 4).map((x) => `「${x.quote}」`).join(", ")}${a.lost.length > 4 ? " …" : ""}`);
    if (!window.CSS?.highlights) parts.push("\n이 브라우저는 형광펜·물결 칠하기를 지원하지 않습니다(크롬 계열 권장).");
    setMsg(applyMsg, parts.join(" · "));
    steps.open = false;
    return { placed, total: a.total, boxes: a.boxes.length, lost: a.lost.map((x) => x.quote), moved: a.moved, orphans: state.orphans.length };
  }

  let tab = "boxes";
  function renderResult() {
    const has = hasData();
    resultBox.hidden = !has;
    if (!has) return;
    renderOrphans();
    const t = TEMPLATES[state.tpl];
    const count = (k) => state.marks.filter((m) => m.kind === k).length;
    const toggle = (key, ...label) => h("button", { "aria-pressed": String(state.show[key]),
      onclick: () => { state.show[key] = !state.show[key]; paint(); drawLayer(); renderResult(); } }, ...label);
    legend.replaceChildren(
      toggle("circle", h("span", { class: "sw sw-key" }, "가"), `${t.marks.circle} ${count("circle")}`),
      toggle("highlight", h("span", { class: "sw sw-hl" }), `${t.marks.highlight} ${count("highlight")}`),
      toggle("wave", h("span", { class: "sw sw-wave" }), `${t.marks.wave} ${count("wave")}`),
      toggle("boxes", `설명 ${state.boxes.length}`),
      h("button", { title: "설명 카드를 문단 아래(본문 속)에 둘지, 옆 패널과 배지로 볼지", onclick: () => {
        state.boxMode = state.boxMode === "inline" ? "side" : "inline"; saveUi(); drawLayer(); renderResult(); tuckIfCovering();
      } }, state.boxMode === "inline" ? "설명 위치: 본문 속 ⇄" : "설명 위치: 옆 패널 ⇄"));
    const nodes = state.concepts?.nodes || [];
    tabs.replaceChildren(
      h("button", { "aria-selected": String(tab === "boxes"), onclick: () => { tab = "boxes"; renderResult(); } }, `설명 ${state.boxes.length}`),
      h("button", { "aria-selected": String(tab === "concepts"), onclick: () => { tab = "concepts"; renderResult(); } }, `요약${nodes.length ? ` (개념 ${nodes.length})` : ""}`));
    list.replaceChildren(tab === "boxes" ? renderBoxes() : renderConcepts());
  }

  const SW = { circle: "sw-key", highlight: "sw-hl", wave: "sw-wave" };
  const short = (q) => (q.length > 30 ? `${q.slice(0, 30)}…` : q);
  function renderOrphans() {
    if (!state.orphans.length) { orphanBox.replaceChildren(); return; }
    const t = TEMPLATES[state.tpl];
    orphanBox.replaceChildren(h("div", { class: "orphans" },
      h("div", { class: "o-head" }, `제자리를 잃은 표시 ${state.orphans.length}개`,
        h("span", { class: "o-sub" }, " — 원문이 바뀌어 찾지 못했습니다. 지우지 않고 보관하고 있으니, 본문에서 글자를 골라 다시 붙이거나 지우세요.")),
      state.attaching ? h("div", { class: "o-attach" }, `본문에서 「${short(state.attaching.quote)}」 를 붙일 글자를 끌어 고르세요. `,
        h("button", { onclick: () => { state.attaching = null; renderResult(); } }, "취소")) : null,
      state.orphans.map((o) => h("div", { class: "o-item" + (state.attaching === o ? " on" : "") },
        h("span", { class: `sw ${SW[o.kind]}`, title: t.marks[o.kind] }, o.kind === "circle" ? "가" : null),
        h("span", { class: "o-q", title: o.quote }, o.quote),
        h("button", { onclick: () => { state.attaching = o; renderResult(); } }, "다시 붙이기"),
        h("button", { class: "icon", title: "이 표시 지우기", onclick: () => {
          state.orphans = state.orphans.filter((x) => x !== o);
          if (state.attaching === o) state.attaching = null;
          renderResult(); save();
        } }, "✕")))));
  }
  function attach(range) {
    const o = state.attaching;
    state.attaching = null;
    state.orphans = state.orphans.filter((x) => x !== o);
    state.marks.push({ id: uid(), kind: o.kind, quote: tidy(range.toString()), range, mine: true });
    getSelection()?.removeAllRanges();
    afterChange();
    setMsg(applyMsg, "표시를 다시 붙였습니다.");
  }

  function renderBoxes() {
    const boxColors = TEMPLATES[state.tpl].boxes, labels = Object.keys(boxColors);
    const frag = document.createDocumentFragment();
    const edit = state.editing;
    // 고칠 때는 화면을 다시 그리지 않고 값만 바꾼다(그리면 입력 중인 칸의 커서가 날아간다)
    const editable = (b, key, cls, ph, tag = "div") => h(tag, { class: cls, contenteditable: "plaintext-only", "data-ph": ph,
      oninput: (e) => { b[key] = key === "pre" ? e.target.innerText.replace(/\n$/, "") : tidy(e.target.innerText); b.mine = true; save(); queueDraw(); } }, b[key] || "");
    for (const b of sortedBoxes()) {
      const c = boxColors[b.label] || "#6b7280";
      const head = edit
        ? h("div", { class: "card-head" },
          h("select", { onchange: (e) => { b.label = e.target.value; b.mine = true; save(); renderResult(); queueDraw(); } },
            [...new Set([...labels, b.label])].map((l) => h("option", { value: l, selected: l === b.label }, l))),
          h("span", { class: "grow" }),
          h("button", { class: "icon", title: "본문 위치로", onclick: () => flashElement(b.el) }, "↗"),
          h("button", { class: "icon", title: "이 설명 지우기", onclick: () => { state.boxes = state.boxes.filter((x) => x !== b); save(); renderResult(); queueDraw(); } }, "✕"))
        : h("div", { class: "card-head" }, h("span", { class: "chip" }, b.label));
      frag.append(h("div", { class: "card", "data-id": b.id, style: `--c:${c}`,
        onclick: (e) => { if (!edit && !e.target.closest("details")) flashElement(b.el); } },
        head,
        edit ? editable(b, "text", "txt", "설명을 쓰세요") : h("div", {}, b.text),
        edit ? editable(b, "pre", "", "(선택) 글자 그림·비교", "pre") : b.pre ? h("pre", {}, b.pre) : null,
        edit ? editable(b, "answer", "ans-ed", "(선택) 답 — 처음에 접혀 보입니다")
          : b.answer ? h("details", {}, h("summary", {}, "답 보기"), h("div", {}, b.answer)) : null));
    }
    if (!state.boxes.length) frag.append(h("p", { class: "muted" }, edit ? "본문 글자를 끌어 고른 다음 「+ 설명」을 누르면 설명을 달 수 있습니다." : "설명이 없습니다."));
    return frag;
  }

  // ── 요약: 개념 구조도. 위아래 관계는 실선(꺾인 줄), 위아래가 아닌 관계는 점선 화살표 + 이름표 ──
  let mapObserver = null;
  function renderConcepts() {
    mapObserver?.disconnect();
    const c = state.concepts;
    if (!c?.nodes?.length) return h("p", { class: "muted" }, "개념 구조도가 없습니다.");
    const byId = new Map(c.nodes.map((n) => [n.id, n]));
    const kids = new Map();
    for (const n of c.nodes) { if (!kids.has(n.parent)) kids.set(n.parent, []); kids.get(n.parent).push(n); }
    const INDENT = 20;
    const width = list.clientWidth || 300;
    const gutter = c.links.length ? clamp(Math.round(width * 0.3), 76, 150) : 0;
    const wrap = h("div", { class: "map", style: `padding-right:${gutter}px` });
    const lines = svgEl("svg", { class: "map-lines" });
    const labels = h("div");
    const topic = h("div", { class: "mnode topic" }, c.topic);
    wrap.append(lines, topic);
    const rows = [], seen = new Set();
    const walk = (parent, depth) => {
      for (const n of kids.get(parent) || []) {
        if (seen.has(n.id)) continue;
        seen.add(n.id);
        const pts = (Array.isArray(n.points) ? n.points : []).filter((x) => typeof x === "string" && x.trim());
        const ptsList = h("ul", { class: "points", hidden: true }, pts.map((x) => h("li", {}, x)));
        const card = h("div", { class: "mnode", "data-id": n.id, style: `margin-left:${depth * INDENT}px` },
          h("div", { class: "term", title: pts.length ? "눌러서 핵심 내용 펼치기" : "", onclick: () => (ptsList.hidden = !ptsList.hidden) },
            n.term, n.role ? h("span", { class: "role" }, n.role) : null),
          n.gloss ? h("div", { class: "gloss" }, n.gloss) : null,
          ptsList);
        rows.push({ id: n.id, parent, el: card });
        wrap.append(card);
        walk(n.id, depth + 1);
      }
    };
    walk(null, 1);
    wrap.append(labels);
    const draw = () => drawMap({ wrap, lines, labels, topic, rows, links: c.links, gutter, byId });
    const win = list.ownerDocument.defaultView;
    win.requestAnimationFrame(draw);
    mapObserver = new win.ResizeObserver(() => win.requestAnimationFrame(draw));
    mapObserver.observe(wrap);
    return wrap;
  }

  function drawMap({ wrap, lines, labels, topic, rows, links, gutter }) {
    if (!wrap.isConnected) return;
    lines.replaceChildren(); labels.replaceChildren();
    const base = wrap.getBoundingClientRect();
    const box = (el) => { const r = el.getBoundingClientRect(); return { l: r.left - base.left, r: r.right - base.left, t: r.top - base.top, b: r.bottom - base.top, m: (r.top + r.bottom) / 2 - base.top }; };
    const pos = new Map(rows.map((x) => [x.id, box(x.el)]));
    const topicBox = box(topic);
    const path = (d, cls) => { const p = svgEl("path", { d, class: cls }); lines.append(p); return p; };
    const defs = svgEl("defs");
    const marker = svgEl("marker", { id: "nl-arrow", viewBox: "0 0 8 8", refX: "7", refY: "4", markerWidth: "7", markerHeight: "7", orient: "auto-start-reverse" });
    marker.append(svgEl("path", { d: "M0,0 L8,4 L0,8 z", class: "arrow" }));
    defs.append(marker); lines.append(defs);
    // 위아래 관계: 상위 개념 왼쪽 아래에서 내려와 하위 개념 왼쪽으로 꺾어 들어간다
    for (const x of rows) {
      const pb = x.parent == null ? topicBox : pos.get(x.parent), cb = pos.get(x.id);
      if (!pb || !cb) continue;
      const vx = pb.l + 10;
      path(`M${vx} ${pb.b} V${cb.m - 6} Q${vx} ${cb.m} ${vx + 6} ${cb.m} H${cb.l}`, "tree");
    }
    if (!links.length) return;
    // 위아래가 아닌 관계: 카드 오른쪽 여백에서 활처럼 잇는다. 겹치는 구간은 다른 줄(lane)로 비켜 간다
    const right = Math.max(...[...pos.values()].map((b) => b.r));
    const items = links.filter((l) => pos.has(l.from) && pos.has(l.to)).map((l) => {
      const a = pos.get(l.from), b = pos.get(l.to);
      return { l, y1: a.m, y2: b.m, top: Math.min(a.m, b.m), bot: Math.max(a.m, b.m) };
    }).sort((p, q) => (p.bot - p.top) - (q.bot - q.top));
    const lanes = [];
    for (const it of items) {
      let k = 0;
      while (lanes[k]?.some((o) => o.top - 6 < it.bot && it.top < o.bot + 6)) k++;
      (lanes[k] ||= []).push(it);
      it.lane = k;
    }
    const placed = [];
    for (const it of [...items].sort((p, q) => p.y1 - q.y1)) {
      const bx = right + 12 + Math.min(it.lane, 3) * 9;
      const p = path(`M${right} ${it.y1} C${bx} ${it.y1} ${bx} ${it.y2} ${right + 1} ${it.y2}`, "rel");
      p.setAttribute("marker-end", "url(#nl-arrow)");
      const lab = h("div", { class: "rel-label", style: `left:${bx + 4}px;max-width:${Math.max(40, gutter - (bx - right) - 8)}px` }, it.l.label);
      labels.append(lab);
      // 이름표는 화살표가 출발하는 개념 옆에 둔다. 가운데에 두면 긴 화살표의 이름표가 엉뚱한 개념 옆에 몰렸다
      let top = it.y1 - lab.offsetHeight / 2;
      for (const q of placed) if (top < q.b + 3 && top + lab.offsetHeight > q.t - 3) top = q.b + 3;
      lab.style.top = `${top}px`;
      placed.push({ t: top, b: top + lab.offsetHeight });
      // 이름표에 올리면 잇는 두 개념과 선을 강조한다
      const cards = [it.l.from, it.l.to].map((id) => rows.find((r) => r.id === id)?.el).filter(Boolean);
      const on = (v) => { lab.classList.toggle("on", v); p.classList.toggle("on", v); cards.forEach((c) => c.classList.toggle("on", v)); };
      lab.addEventListener("mouseenter", () => on(true));
      lab.addEventListener("mouseleave", () => on(false));
    }
  }

  function openCard(id) {
    if (state.popup) state.popup.focus(); else setMin(false);
    if (tab !== "boxes") { tab = "boxes"; renderResult(); }
    const card = list.querySelector(`[data-id="${id}"]`);
    if (!card) return null;
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.classList.remove("flash"); void card.offsetWidth; card.classList.add("flash");
    return card;
  }

  // ── 수정 모드: 글자를 골라 표시·설명 달기, 표시를 눌러 바꾸기·지우기 ──
  function setEditing(on) {
    state.editing = on;
    editBtn.setAttribute("aria-pressed", String(on));
    if (on) panel.setAttribute("data-editing", ""); else panel.removeAttribute("data-editing");
    hidePop();
    renderResult();
  }
  function hidePop() { pop.hidden = true; pop.replaceChildren(); }
  function showPop(x, y, buttons) {
    pop.replaceChildren(...buttons);
    pop.hidden = false;
    const w = pop.offsetWidth;
    pop.style.left = `${clamp(x - w / 2, 8, innerWidth - w - 8) + scrollX}px`;
    pop.style.top = `${y + scrollY}px`;
  }
  const kindName = (k) => TEMPLATES[state.tpl].marks[k];
  const SHAPE = { circle: "가", highlight: "▬", wave: "〰" };

  function afterChange() { paint(); drawLayer(); renderResult(); save(); }

  function showSelectionTools(range) {
    const r = range.getBoundingClientRect();
    const quote = tidy(range.toString());
    showPop(r.left + r.width / 2, r.bottom + 6, [
      ...KINDS.map((k) => h("button", { title: kindName(k), onclick: () => {
        state.marks.push({ id: uid(), kind: k, quote, range, mine: true });
        getSelection()?.removeAllRanges(); hidePop(); afterChange();
      } }, `${SHAPE[k]} ${kindName(k)}`)),
      h("span", { class: "sep" }),
      h("button", { onclick: () => {
        const i = paraIndexOf(range.startContainer);
        const el = i >= 0 ? state.paras[i].el : range.startContainer.parentElement;
        const b = { id: uid(), label: Object.keys(TEMPLATES[state.tpl].boxes)[0], text: "", pre: "", answer: "", el, mine: true };
        state.boxes.push(b);
        getSelection()?.removeAllRanges(); hidePop();
        tab = "boxes"; afterChange();
        openCard(b.id)?.querySelector(".txt")?.focus();
      } }, "+ 설명"),
    ]);
  }
  function showMarkTools(m, x, y) {
    const lines = lineRects(m.range);
    const lastLine = lines[lines.length - 1];
    showPop(x, (lastLine ? lastLine.bottom : y) + 6, [
      ...KINDS.map((k) => h("button", { title: kindName(k), "aria-pressed": String(m.kind === k), onclick: () => { m.kind = k; m.mine = true; hidePop(); afterChange(); } }, `${SHAPE[k]} ${kindName(k)}`)),
      h("span", { class: "sep" }),
      h("button", { onclick: () => { state.marks = state.marks.filter((x) => x !== m); hidePop(); afterChange(); } }, "지우기"),
    ]);
  }
  function caretAt(x, y) {
    if (document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(x, y); return p && { node: p.offsetNode, offset: p.offset }; }
    const r = document.caretRangeFromPoint?.(x, y);
    return r && { node: r.startContainer, offset: r.startOffset };
  }
  // 누른 자리의 표시. 여러 개가 겹치면 가장 짧은 것
  function markAt(x, y) {
    const c = caretAt(x, y), hits = [];
    for (const m of state.marks) {
      if (!state.show[m.kind]) continue;
      let hit = false;
      if (c) try { hit = m.range.isPointInRange(c.node, c.offset) && !(m.range.endContainer === c.node && m.range.endOffset === c.offset); } catch {}
      if (hit) hits.push(m);
    }
    return hits.sort((a, b) => a.quote.length - b.quote.length)[0] || null;
  }
  function onMouseUp(e) {
    if ((!state.editing && !state.attaching) || e.composedPath().includes(host)) return;
    setTimeout(() => {
      const sel = getSelection();
      if (!sel?.rangeCount || sel.isCollapsed) return;
      const r = sel.getRangeAt(0);
      if (!state.root.contains(r.commonAncestorContainer) || !squash(r.toString())) return;
      if (state.attaching) { attach(r.cloneRange()); return; }
      showSelectionTools(r.cloneRange());
    }, 0);
  }
  function onClick(e) {
    if (!state.editing || e.composedPath().includes(host)) return;
    const sel = getSelection();
    if (sel && !sel.isCollapsed) return;
    const m = markAt(e.clientX, e.clientY);
    if (!m) { hidePop(); return; }
    e.preventDefault(); e.stopPropagation(); // 표시가 링크 위에 있어도 페이지를 옮기지 않는다
    showMarkTools(m, e.clientX, e.clientY);
  }
  function onKey(e) { if (e.key === "Escape") hidePop(); }
  function onScroll() { queueDraw(); if (!pop.hidden && pop.dataset.keep !== "1") hidePop(); }

  // ── 저장 창과 주고받기 ──
  // 저장 창은 다른 출처(notelayer 주소)의 창이라 postMessage 로만 이야기한다.
  // 받는 쪽은 출처와 보낸 창을 둘 다 확인한다(이 사이트의 다른 창이 흉내 내지 못하게)
  const KEY = pageKey();
  const conn = { win: null, ready: false, seq: 0, pending: new Map(), helloT: 0, watchT: 0, folder: false, dirty: false };
  const fmtTime = (t) => new Date(t).toLocaleString();
  // 주소는 정리한 KEY 만 보낸다(지금 주소창의 전체 주소는 보내지 않는다)
  const msgFor = (type, id, extra = {}) => ({ nl: "page", type, id, key: KEY, title: document.title, ...extra });
  function setSaved(text, err = false) { savedMsg.className = err ? "msg err" : "msg"; savedMsg.textContent = text; }
  function openStore() {
    if (!BASE) return null;
    // 로컬 시험 서버에서 불렀으면 시험용 저장 창 이름을 따로 써서 공개용 저장 창을 덮지 않는다
    const storeName = /^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(BASE) ? "notelayer-store-dev" : "notelayer-store";
    try { conn.win = window.open(`${BASE}store.html`, storeName, `popup=yes,width=380,height=560,left=${Math.max(0, screen.availWidth - 400)},top=60`); } catch { conn.win = null; }
    if (!conn.win) setSaved("팝업이 막혀 저장 창을 열지 못했습니다. 주소창 오른쪽에서 이 사이트의 팝업을 허용해 주세요.", true);
    connect();
    return conn.win;
  }
  // 저장 창이 다 뜰 때까지 인사를 되풀이한다(뜨기 전에 보낸 메시지는 버려진다)
  function connect() {
    conn.ready = false;
    clearInterval(conn.helloT);
    renderStore();
    if (!conn.win) return;
    let n = 0;
    conn.helloT = setInterval(() => {
      if (conn.ready || !conn.win || conn.win.closed || ++n > 80) { clearInterval(conn.helloT); renderStore(); return; }
      try { conn.win.postMessage(msgFor("hello", 0), NL_ORIGIN); } catch {}
    }, 250);
  }
  function send(type, extra) {
    return new Promise((ok, no) => {
      if (!conn.ready || !conn.win || conn.win.closed) { no(new Error("저장 창이 닫혀 있습니다")); return; }
      const id = ++conn.seq;
      const t = setTimeout(() => { conn.pending.delete(id); no(new Error("저장 창이 답하지 않습니다")); }, 8000);
      conn.pending.set(id, { ok, no, t });
      conn.win.postMessage(msgFor(type, id, extra), NL_ORIGIN);
    });
  }
  function onStoreMessage(e) {
    if (!NL_ORIGIN || e.origin !== NL_ORIGIN || !conn.win || e.source !== conn.win) return;
    const d = e.data;
    if (!d || d.nl !== "store") return;
    if (d.type === "ready") {
      if (conn.ready) return;
      conn.ready = true; conn.folder = !!d.folder;
      clearInterval(conn.helloT);
      renderStore();
      onStoreReady();
      return;
    }
    const p = conn.pending.get(d.id);
    if (!p) return;
    conn.pending.delete(d.id); clearTimeout(p.t);
    if (d.type === "error") p.no(new Error(d.message)); else p.ok(d);
  }
  // 연결되면: 저장하지 않은 변경이 있으면 보내고, 아직 아무 표시도 없으면 저장본을 꺼내 칠한다
  async function onStoreReady() {
    if (conn.dirty) { save(); return; }
    if (hasData()) return;
    try {
      const r = await send("load");
      if (r.record?.data && !hasData()) {
        const data = r.record.data;
        if (TEMPLATES[data.tpl]) { state.tpl = data.tpl; tplSelect.value = data.tpl; }
        const res = apply(data, { restored: true });
        setSaved(`저장해 둔 표시를 불러왔습니다 · ${fmtTime(r.record.savedAt)}${r.from === "folder" ? " · 폴더의 파일에서" : ""}`
          + `${res?.moved ? ` · 글이 바뀌어 자리를 다시 잡은 표시 ${res.moved}개` : ""}${res?.orphans ? ` · 제자리를 잃은 표시 ${res.orphans}개` : ""}`);
      } else if (!r.record) setSaved("이 페이지에 저장한 표시가 아직 없습니다. 답을 적용하거나 고치면 자동으로 저장됩니다.");
    } catch (err) {
      setSaved(`불러오지 못했습니다: ${err.message}`, true);
    }
  }
  function renderStore() {
    const live = conn.win && !conn.win.closed;
    storeOpenBtn.hidden = !BASE || !!(conn.ready && live);
    storeState.className = conn.ready && live ? "msg" : "msg err";
    storeState.textContent = !BASE ? "저장 창 주소를 알 수 없어 저장할 수 없습니다. 즐겨찾기 버튼으로 다시 열어 주세요."
      : conn.ready && live ? `● 저장 창과 연결됨 — 이 PC 에 저장합니다${conn.folder ? "(고른 폴더에도 파일로)" : ""}. 서버로 보내지 않고, 다른 사이트는 이 메모를 볼 수 없습니다.`
      : live ? "○ 저장 창과 연결하는 중…"
      : `○ 저장 창이 닫혀 있어 저장되지 않습니다${conn.dirty ? "(저장하지 않은 변경이 있습니다)" : ""}.`;
  }

  function destroy() {
    removeEventListener("message", onStoreMessage);
    clearInterval(conn.helloT); clearInterval(conn.watchT); clearTimeout(saveTimer);
    removeEventListener("scroll", onScroll, true);
    removeEventListener("resize", onResize);
    removeEventListener("pagehide", onPageHide);
    document.removeEventListener("mouseup", onMouseUp, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKey, true);
    ro.disconnect(); mapObserver?.disconnect();
    if (state.popup) try { state.popup.close(); } catch {}
    if (window.CSS?.highlights) for (const k of ["nl-ov-key", "nl-ov-hl", "nl-ov-wave", "nl-ov-flash"]) CSS.highlights.delete(k);
    for (const x of inlineHosts.splice(0)) x.remove();
    host.remove(); pageStyle.remove();
    delete window.NL_OVERLAY;
  }
  function onResize() { placePanel(); queueDraw(); }
  function onPageHide() { if (state.popup) try { state.popup.close(); } catch {} }

  // ── 시작 ──
  state.root = findRoot();
  state.paras = collectParagraphs(state.root);
  const cut = (s) => (s.length > 36 ? `${s.slice(0, 36)}…` : s);
  foundMsg.textContent = state.paras.length
    ? `본문 문단 ${state.paras.length}개를 찾았습니다. 블로그 옆 메뉴·댓글은 뺐습니다.\n첫 문단: ${cut(state.paras[0].text)}\n끝 문단: ${cut(state.paras[state.paras.length - 1].text)}`
    : "본문을 찾지 못했습니다.";
  autoPlace();
  placePanel();
  addEventListener("scroll", onScroll, { capture: true, passive: true });
  addEventListener("resize", onResize);
  addEventListener("pagehide", onPageHide);
  document.addEventListener("mouseup", onMouseUp, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKey, true);
  const ro = new ResizeObserver(queueDraw);
  ro.observe(document.body);

  paint();
  // 즐겨찾기 버튼이 누르는 순간 저장 창을 먼저 열어 둔다(파일을 다 받은 뒤에 열면 팝업 차단에 걸린다)
  addEventListener("message", onStoreMessage);
  conn.win = window.__NL_STORE_WIN || null;
  try { delete window.__NL_STORE_WIN; } catch {}
  conn.watchT = setInterval(() => { if (conn.ready && (!conn.win || conn.win.closed)) { conn.ready = false; renderStore(); } }, 2000);
  // 저장 창을 먼저 열지 않는 예전 즐겨찾기로 불렀으면 여기서 연다. 누른 지 몇 초 안이라 대개 팝업 차단에 걸리지 않는다.
  // 막히면 openStore 가 「저장 창 열기」를 누르라고 알린다
  if (!conn.win && BASE) openStore(); else connect();

  window.NL_OVERLAY = {
    // 버튼을 다시 누르면: 저장 창이 닫혀 있으면 다시 열고 패널을 보이고, 아니면 패널을 접고 편다
    toggle: () => {
      if (BASE && (!conn.win || conn.win.closed)) { openStore(); setMin(false); return; }
      if (state.popup) state.popup.focus(); else setMin(!panel.hasAttribute("data-min"));
    },
    apply: applyText,
    info: () => ({ root: state.root.tagName + (state.root.id ? `#${state.root.id}` : ""), paragraphs: state.paras.length,
      first: state.paras[0]?.text, last: state.paras.at(-1)?.text, side: state.side, width: state.width,
      marks: state.marks.length, boxes: state.boxes.length, orphans: state.orphans.length, editing: state.editing, popped: !!state.popup, key: KEY, store: conn.ready }),
    snapshot: () => serialize(),
    restore: (data) => { state.marks = []; state.orphans = []; state.boxes = []; state.concepts = null; return apply(data, { restored: true }); },
    destroy,
  };
})();
