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
  // 이 층을 품는 notelayer 화면(예: PDF 노트)이 있으면 그 화면이 본문·문단·주소·저장을 직접 넘겨준다.
  // { kind, key, root, paragraphs: [{ p, el, text }], request(msg) → 답, inline: false(본문 속 설명 카드를 끼울 수 없는 화면) }
  // 웹페이지에서 즐겨찾기로 부를 때는 없다
  const HOST = window.NL_HOST || null;
  const PDF = HOST?.kind === "pdf"; // 글자 층이 투명한 화면: 글자색을 바꾸지 않고 바탕색·밑줄로만 칠한다
  const LOCAL = typeof HOST?.request === "function"; // 저장 창 대신 같은 주소의 저장 코드를 바로 부른다
  // 작은 창이 기본인 화면(PDF 노트): 큰 패널을 띄우지 않고 작은 창에서 요약 보기·수정 켜고 끄기를 한다.
  // 설명·번역은 문단 바로 아래에 보이고, 수정 모드에서는 그 자리에서 바로 고친다
  // 웹페이지(즐겨찾기)도 PDF 노트와 같이 작은 창이 기본이다. 품는 화면이 compact 를 따로 정하면 그에 따른다
  const COMPACT = HOST ? !!HOST.compact : true;
  // 설명 위치를 화면이 정했으면 바꾸는 단추를 숨긴다. 웹페이지는 사이트에 따라 카드를 끼우면 모양이 깨질 수 있어 「옆 패널」 로 바꿀 길을 남긴다
  const INLINE_ONLY = HOST?.inline === false ? "side" : HOST?.compact ? "inline" : null;

  // 표시 색. app.css 의 템플릿 변수와 같은 값이다(그쪽을 고치면 여기도 고친다)
  const MARK_COLORS = {
    exam: { circle: "#d9480f", hl: "rgba(255, 214, 10, .55)", wave: "#1c64f2" },
    tech: { circle: "#0f766e", hl: "rgba(56, 189, 248, .28)", wave: "#7c3aed" },
    contract: { circle: "#1d4ed8", hl: "rgba(250, 204, 21, .35)", wave: "#ea580c" },
    onboarding: { circle: "#4f46e5", hl: "rgba(129, 140, 248, .25)", wave: "#db2777" },
    review: { circle: "#15803d", hl: "rgba(134, 239, 172, .45)", wave: "#dc2626" },
  };
  const KINDS = ["circle", "highlight", "wave"];
  const LEVELS = ["core", "some", "rare"]; // 중요도 음영 단계: 진한 음영 · 옅은 음영 · 흐리게
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
    if (HOST?.key) return HOST.key;
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
  // 본문 고르기는 세 겹이다. 어떤 추측도 100% 는 아니라, 틀리면 사용자가 「본문 다시 고르기」로 직접 고르고 그 사이트에 기억한다
  //  ① 이 사이트(호스트)에서 사용자가 직접 고른 상자
  //  ② 사이트가 붙여 둔 본문 표시: 검색 엔진용 articleBody 표시, 흔한 블로그 도구의 본문 상자 이름, 페이지에 하나뿐인 <article>
  //  ③ 점수(아래 scoreRoot) — 표시가 없을 때만
  const ROOT_KEY = `notelayer:root:${location.host}`;
  const SITE_ROOTS = [
    '[itemprop="articleBody"]',
    "#article-view", ".tt_article_useless_p_margin", ".article_view", // 티스토리
    ".entry-content", // 워드프레스 등
    ".post-content", ".markdown-body", // 지킬(GitHub 블로그)·GitHub 문서
    ".mw-parser-output", // 위키백과
    ".se-main-container", // 네이버 스마트에디터
    ".wrap_body", // 브런치
    ".prose", // 테일윈드 글 서식을 쓰는 사이트
  ];
  // 본문 후보가 될 만한가: 글자가 충분하고 문단이 세 개 이상
  function rootOk(el) {
    if (!el || el.closest(SKIP) || textLen(el) < 300) return false;
    let n = 0;
    for (const q of el.querySelectorAll(LEAF)) if (isLeaf(q) && textLen(q) >= 20 && ++n >= 3) return true;
    return false;
  }
  function savedRoot() {
    let sel = null;
    try { sel = localStorage.getItem(ROOT_KEY); } catch {}
    if (!sel) return null;
    try { const el = document.querySelector(sel); return el && textLen(el) >= 50 ? el : null; } catch { return null; }
  }
  function siteRoot() {
    for (const sel of SITE_ROOTS) {
      const els = [...document.querySelectorAll(sel)].filter(rootOk);
      if (els.length === 1) return els[0];
    }
    const arts = [...document.querySelectorAll("article")].filter(rootOk);
    return arts.length === 1 ? arts[0] : null; // 글 목록 페이지처럼 여러 개면 판단하지 않는다
  }
  let rootHow = "score"; // saved | site | score — 어떻게 골랐는지(패널 안내용)
  function findRoot() {
    const a = savedRoot();
    if (a) { rootHow = "saved"; return a; }
    const b = siteRoot();
    if (b) { rootHow = "site"; return b; }
    rootHow = "score";
    return scoreRoot();
  }
  function scoreRoot() {
    const scores = new Map();
    const add = (node, v) => { if (node && node !== document.documentElement) scores.set(node, (scores.get(node) || 0) + v); };
    // 점수는 네 단계 위 상자까지, 위로 갈수록 줄여서 올린다(1 → 1/2 → 1/3 → 1/4).
    // 두 단계까지만 올리면 여러 겹 목록으로 된 글(항목이 ul>li>ul>li…)은 점수가 작은 목록들에 흩어져,
    // 혼자 긴 코드 블록 하나가 본문으로 뽑혔다(gmlwjd9405.github.io 의 HTTP 헤더 글에서 확인).
    // 코드(pre)는 설명하는 글이 아니라 예시라 점수를 낮게 친다
    for (const el of document.body.querySelectorAll(LEAF)) {
      if (el.closest(SKIP) || !isLeaf(el)) continue;
      const len = textLen(el) * (el.tagName === "PRE" ? 0.3 : 1);
      if (len < 20) continue;
      let node = el.parentElement;
      for (let d = 1; d <= 4 && node; d++, node = node.parentElement) add(node, len / d);
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
    // 문단 하나를 본문으로 직접 고른 경우: 그 문단 자체가 유일한 문단이다
    if (root.matches?.(LEAF) && isLeaf(root)) {
      const text = root.tagName === "PRE" ? root.innerText.trim() : tidy(root.innerText);
      return text.length >= 2 ? [{ p: 1, el: root, text }] : [];
    }
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
    trs: new Map(),       // 번역: 문단 번호(0부터) → { text, mine }
    concepts: null,
    imps: [],             // 중요도 음영 { i, j, level, why, mine } — 문단 i..j(0부터) 묶음. level = core | some | rare
    show: { circle: true, highlight: true, wave: true, boxes: true, tr: true, imp: true },
    focus: null, // 「이것만 또렷하게」: circle | highlight | wave | boxes — 본문의 나머지 글자를 흐리게 하고 이 종류만 남긴다
    editing: false,
    side: ui.side || null, width: ui.width || null,
    // 설명 카드 위치: inline = 해당 문단 바로 아래 본문 속(기본), side = 옆 패널 + 문단 옆 배지
    boxMode: INLINE_ONLY || (ui.boxMode === "side" ? "side" : "inline"),
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
    const trs = (Array.isArray(result.translations) ? result.translations : [])
      .filter((t) => t && typeof t.text === "string" && t.text.trim() && n)
      .map((t) => ({ i: guess(Number.isFinite(Number(t.p)) ? Number(t.p) : 1), text: t.text.trim(), mine: !!t.mine }));
    // 중요도: AI 가 매긴 문단 범위를 이 페이지 문단 자리로 옮긴다. 겹치면 나중 것이 이긴다
    let imps = [];
    for (const x of Array.isArray(result.importance) ? result.importance : []) {
      if (!x || !LEVELS.includes(x.level) || !Number.isFinite(Number(x.p)) || !n) continue;
      const a = guess(Number(x.p)), b = guess(Number.isFinite(Number(x.to)) ? Number(x.to) : Number(x.p));
      const i = Math.min(a, b), j = Math.max(a, b);
      imps = [...carve(imps, i, j), { i, j, level: x.level, why: typeof x.why === "string" ? tidy(x.why).slice(0, 80) : "", mine: !!x.mine }];
    }
    imps.sort((p, q) => p.i - q.i);
    return { marks, boxes, trs, imps, lost, moved, total: raw.length };
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
    return nodes.length ? { topic: tidy(c.topic) || document.title, nodes, links, ...(c.mine ? { mine: true } : {}) } : null;
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
      ...(state.imps.length ? { importance: state.imps.map((x) => ({ p: x.i + 1, to: x.j + 1, level: x.level, ...(x.why ? { why: x.why } : {}), ...(x.mine ? { mine: true } : {}) })) } : {}),
      ...(state.trs.size ? { translations: [...state.trs].sort((a, b) => a[0] - b[0])
        .map(([i, t]) => ({ p: i + 1, text: t.text, ...(t.mine ? { mine: true } : {}) })) } : {}),
      ...(HOST?.extraData?.() || {}), // 품는 화면의 층(PDF 노트의 손글씨 ink)
    };
  }
  const hasData = () => !!(state.marks.length || state.orphans.length || state.boxes.length || state.concepts || state.imps.length || state.trs.size || HOST?.hasExtra?.());
  let saveTimer = 0;
  // 고칠 때마다 저장 창에 보낸다. 저장 창이 닫혀 있으면 「저장하지 않은 변경」으로 남겨 두었다가 다시 연결되면 보낸다
  function save() {
    if (HOST?.ephemeral) return; // 예시 화면: 고친 내용을 저장하지 않는다(새로고침하면 처음 상태)
    // 저장 창은 저장이 필요한 순간에 연다. 누름(적용·수정) 안에서 불리므로 대개 팝업 차단에 걸리지 않는다.
    // 막혀도 조용히 넘어가고, 저장 상태 줄의 「저장 창 열기」·작은 상자의 「저장 창」 버튼으로 열면 그때 저장한다
    if (!LOCAL && BASE && (!conn.win || conn.win.closed)) openStore({ quiet: true });
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
      font: 13px/1.6 "Pretendard Variable", "Pretendard", "IBM Plex Sans KR", "Malgun Gothic", sans-serif; overflow: hidden; }
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
    .mnode { position: relative; z-index: 1; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 5px 8px; margin: 13px 0; }
    .mnode.root { margin-top: 20px; }
    .mnode.lone { border-style: dashed; }
    .map-sub { margin: 24px 0 4px; font-size: 11px; color: #6b7280; border-top: 1px dashed #e5e7eb; padding-top: 8px; }
    .tree-label { position: absolute; z-index: 2; transform: translate(-50%, -50%); font-size: 10px; line-height: 13px; padding: 0 5px; white-space: nowrap;
      color: #475569; background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 999px; pointer-events: none; }
    .mnode.topic { display: inline-block; background: #1f2328; color: #fff; border-color: #1f2328; font-weight: 600; font-size: 12px; margin-top: 2px; }
    .mnode.on { border-color: #6366f1; box-shadow: 0 0 0 2px rgba(99, 102, 241, .2); }
    .mnode .term { cursor: pointer; font-weight: 600; }
    .mnode .role { color: #9ca3af; font-size: 11px; margin-left: 4px; font-weight: 400; }
    .mnode .gloss { color: #4b5563; font-size: 12px; line-height: 1.5; }
    .mnode .points { margin: 4px 0 0; padding-left: 16px; font-size: 12px; color: #374151; }
    .rel-label { position: absolute; z-index: 2; font-size: 10.5px; line-height: 1.35; color: #4338ca; background: #eef2ff; border-radius: 6px; padding: 1px 5px; cursor: default; }
    .rel-label.on { background: #6366f1; color: #fff; }
    /* 다크 테마: 품는 화면이 notelayer-overlay 에 data-theme="dark" 를 달면 패널에 dark 가 붙는다(따로 떼어 낸 창에서도 유지) */
    .panel.dark { background: #1b1e24; color: #e5e7eb; border-color: #2f343c; box-shadow: 0 8px 30px rgba(0,0,0,.6); color-scheme: dark; }
    .panel.dark header, .panel.dark .tabs { border-color: #2b2f36; }
    .panel.dark .edit-bar { background: #3b2a12; color: #fbbf24; border-color: #5b3d15; }
    .panel.dark button { background: #2a2f37; border-color: #3d434d; }
    .panel.dark button.primary { background: #e5e7eb; color: #111827; border-color: #e5e7eb; }
    .panel.dark button.icon { background: none; color: #9ca3af; }
    .panel.dark button.icon:hover { background: #2a2f37; color: #e5e7eb; }
    .panel.dark button.toggle[aria-pressed="true"] { background: #3b2a12; color: #fbbf24; }
    .panel.dark select, .panel.dark textarea { background: #14161a; border: 1px solid #3d434d; color: #e5e7eb; }
    .panel.dark .muted, .panel.dark details.steps > summary, .panel.dark .tabs button { color: #9ca3af; }
    .panel.dark .msg { color: #34d399; }
    .panel.dark .msg.err { color: #f87171; }
    .panel.dark h3 { color: #d1d5db; }
    .panel.dark .savebar { background: #22262d; }
    .panel.dark .orphans { background: #2a2414; border-color: #5b4a17; }
    .panel.dark .o-head { color: #fbbf24; }
    .panel.dark .o-sub { color: #a8a29e; }
    .panel.dark .o-attach { color: #fdba74; }
    .panel.dark .o-item.on { background: #3b2f12; }
    .panel.dark .tabs button[aria-selected="true"] { border-bottom-color: #e5e7eb; color: #e5e7eb; }
    .panel.dark .card { border-color: #2f343c; }
    .panel.dark .card:hover { background: #22262d; }
    .panel.dark .card-head select { background: #14161a; border-color: #3d434d; }
    .panel.dark .chip, .panel.dark .card-head select { color: color-mix(in srgb, var(--c), white 40%); }
    .panel.dark .card pre { background: #14161a; }
    .panel.dark .card summary, .panel.dark .ans-ed { color: #d8b4fe; }
    .panel.dark .map-lines .tree { stroke: #4b5563; }
    .panel.dark .mnode { background: #22262d; border-color: #343a43; }
    .panel.dark .mnode.topic { background: #e5e7eb; color: #111827; border-color: #e5e7eb; }
    .panel.dark .mnode .gloss { color: #9ca3af; }
    .panel.dark .mnode .points { color: #d1d5db; }
    .panel.dark .map-sub { color: #9ca3af; border-color: #343a43; }
    .panel.dark .tree-label { background: #2a2f37; color: #cbd5e1; border-color: #3d434d; }
    .panel.dark .rel-label { background: #262a4a; color: #c7d2fe; }
  `;
  shadow.append(h("style", {}, `
    :host { all: initial; }
    .layer { position: absolute; left: 0; top: 0; width: 1px; height: 1px; overflow: visible; pointer-events: none; }
    .badge { position: absolute; pointer-events: auto; cursor: pointer; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 999px;
      color: #fff; font: 600 11px/20px "Pretendard Variable", "Pretendard", "Malgun Gothic", sans-serif; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,.25); }
    .badge:hover { transform: scale(1.1); }
    .root-box { position: absolute; border: 2px dashed #f59e0b; border-radius: 6px; background: rgba(245, 158, 11, .06); }
    .pick-box { position: absolute; pointer-events: none; border: 2px solid #6366f1; border-radius: 6px; background: rgba(99, 102, 241, .08); box-shadow: 0 0 0 9999px rgba(15, 23, 42, .18); }
    .pick-box[hidden], .pick-bar[hidden] { display: none; }
    .pick-bar { position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); display: flex; gap: 6px; align-items: center; flex-wrap: wrap; pointer-events: auto;
      background: #1f2328; color: #fff; padding: 8px 10px; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,.35); font: 13px/1.4 "Pretendard Variable", "Pretendard", "Malgun Gothic", sans-serif; max-width: calc(100vw - 24px); }
    .pick-bar span { color: #cbd5e1; margin-right: 4px; }
    .pick-bar button { border: 1px solid #4b5563; background: #2a2f37; color: #fff; border-radius: 8px; padding: 4px 10px; cursor: pointer; font: inherit; }
    .pick-bar button.primary { background: #6366f1; border-color: #6366f1; }
    /* 접힌 패널 = 오른쪽 위 작은 요약 상자. 누르면 전체 패널이 펼쳐진다 */
    .mini { position: fixed; top: 12px; right: 12px; pointer-events: auto; cursor: pointer; max-width: min(360px, calc(100vw - 24px));
      background: #fff; color: #1f2328; border: 1px solid #e5e7eb; border-radius: 10px; box-shadow: 0 4px 16px rgba(0,0,0,.15);
      padding: 7px 10px; font: 12px/1.5 "Pretendard Variable", "Pretendard", "IBM Plex Sans KR", "Malgun Gothic", sans-serif; }
    .mini[hidden] { display: none; }
    .mini:hover { box-shadow: 0 6px 22px rgba(0,0,0,.22); }
    .mini:focus-visible { outline: 2px solid #6366f1; }
    .overview { position: fixed; left: 12px; top: 12px; pointer-events: auto; z-index: 3; padding: 8px 10px 9px; border-radius: 10px;
      background: #fff; color: #1f2328; border: 1px solid #e5e7eb; box-shadow: 0 6px 22px rgba(0,0,0,.18);
      font: 12px/1.5 "Pretendard Variable", "Pretendard", "IBM Plex Sans KR", "Malgun Gothic", sans-serif; }
    .overview[hidden] { display: none; }
    .ov-head { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
    .ov-head .grow { flex: 1; }
    .ov-head .x { border: 0; background: none; color: #6b7280; cursor: pointer; font: inherit; padding: 0 2px; }
    .ov-map { position: relative; overflow: hidden; border: 1px solid #d1d5db; border-radius: 4px; background: #f9fafb; cursor: pointer; }
    .ov-part { position: absolute; background: #e5e7eb; border-radius: 2px; }
    .ov-root { position: absolute; background: rgba(245, 158, 11, .22); outline: 1.5px solid #f59e0b; border-radius: 2px; }
    .ov-line { position: absolute; background: rgba(180, 83, 9, .45); border-radius: 1px; }
    .ov-view { position: absolute; border: 1.5px dashed #2563eb; border-radius: 2px; pointer-events: none; }
    .ov-legend { display: flex; align-items: center; gap: 4px; margin-top: 6px; color: #6b7280; font-size: 11px; }
    .ov-legend .sw { display: inline-block; width: 10px; height: 8px; border-radius: 2px; margin-left: 4px; }
    .ov-legend .sw:first-child { margin-left: 0; }
    .ov-legend .sw-root { background: rgba(245, 158, 11, .35); outline: 1px solid #f59e0b; }
    .ov-legend .sw-view { border: 1.5px dashed #2563eb; }
    .overview.dark { background: #1f2329; color: #e5e7eb; border-color: #374151; }
    .overview.dark .ov-map { background: #111418; border-color: #374151; }
    .overview.dark .ov-part { background: #2d333b; }
    .detail-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; margin: 6px 0 8px; }
    .detail-label { font-size: 12px; color: #6b7280; }
    .segs { display: inline-flex; border: 1px solid #d1d5db; border-radius: 8px; overflow: hidden; }
    .segs .seg { border: 0; border-radius: 0; margin: 0; padding: 3px 10px; background: #fff; color: #374151; font: inherit; font-size: 12px; cursor: pointer; }
    .segs .seg + .seg { border-left: 1px solid #d1d5db; }
    .segs .seg[aria-pressed="true"] { background: #111827; color: #fff; }
    .detail-hint { flex-basis: 100%; font-size: 11.5px; color: #6b7280; }
    .panel.dark .segs { border-color: #374151; }
    .panel.dark .segs .seg { background: #1f2329; color: #d1d5db; }
    .panel.dark .segs .seg + .seg { border-left-color: #374151; }
    .panel.dark .segs .seg[aria-pressed="true"] { background: #e5e7eb; color: #111827; }
    .mini-head { display: flex; align-items: center; gap: 6px; cursor: grab; touch-action: none; }
    .mini-head:active { cursor: grabbing; }
    .mini-head b { font-size: 13px; }
    .mini .dot { width: 7px; height: 7px; border-radius: 50%; background: #d1d5db; }
    .mini .dot.on { background: #10b981; }
    .mini .grow { flex: 1; }
    .mini .open { color: #6b7280; }
    .mini-items { display: flex; flex-wrap: wrap; gap: 2px 10px; margin-top: 3px; color: #374151; }
    .mini-items span { white-space: nowrap; }
    .mini .it { display: inline-flex; align-items: center; border-radius: 6px; }
    .mini .it button { border: 0; background: none; font: inherit; color: inherit; cursor: pointer; padding: 1px 3px; border-radius: 5px; }
    .mini .it button:hover { background: #f3f4f6; }
    .mini .it .eye { color: #6b7280; display: inline-flex; }
    .mini .it.off { opacity: .45; }
    .mini .it.on .lab { background: #fef3c7; box-shadow: inset 0 0 0 1px #f59e0b; }
    .mini-items b { font-weight: 700; }
    .mini.compact { cursor: default; }
    .mini .x { border: 0; background: none; color: #9ca3af; cursor: pointer; font-size: 13px; padding: 0 2px 0 6px; }
    .mini .x:hover { color: #111827; }
    .mini.compact:hover { box-shadow: 0 4px 16px rgba(0,0,0,.15); }
    .mini-acts { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; padding-top: 6px; border-top: 1px solid #f1f2f4; }
    .mini .act { border: 1px solid #d0d7de; background: #f6f8fa; border-radius: 7px; padding: 2px 9px; font: inherit; cursor: pointer; color: #1f2328; }
    .mini .act:hover:not(:disabled) { background: #eef1f4; }
    .mini .act:disabled { opacity: .45; cursor: default; }
    .mini .act.sw.on { background: #fff7ed; border-color: #f59e0b; color: #b45309; font-weight: 600; }
    @media (pointer: coarse) {
      .mini { font-size: 13px; padding: 9px 12px; }
      .mini .act { padding: 6px 12px; }
      .mini .it button { padding: 4px 6px; }
      .pop button { padding: 8px 12px; }
      .sheet-btn, .sheet-close { padding: 6px 12px; }
      .sheet .hint { display: none; }
    }
    /* 요약 크게 보기: 페이지 전체를 덮고 위에서 아래로 내려가는 구조도 */
    .sheet { position: fixed; inset: 0; z-index: 10; pointer-events: auto; display: flex; flex-direction: column; background: #f8fafc;
      color: #1f2328; font: 13px/1.55 "Pretendard Variable", "Pretendard", "IBM Plex Sans KR", "Malgun Gothic", sans-serif; }
    .sheet-head { display: flex; align-items: center; gap: 10px; padding: 12px 18px; border-bottom: 1px solid #e5e7eb; background: #fff; }
    .sheet-head b { font-size: 15px; }
    .sheet-topic { color: #374151; font-weight: 600; }
    .sheet .grow { flex: 1; }
    .sheet .muted { color: #6b7280; font-size: 12px; }
    .sheet-close { border: 0; background: none; font-size: 16px; cursor: pointer; color: #6b7280; padding: 2px 8px; border-radius: 6px; }
    .sheet-close:hover { background: #f3f4f6; color: #111827; }
    .sheet-main { flex: 1; display: flex; min-height: 0; position: relative; }
    .sheet-btn { border: 1px solid #d0d7de; background: #f6f8fa; border-radius: 8px; padding: 3px 10px; cursor: pointer; font: inherit; font-size: 12px; color: #1f2328; }
    .sheet-btn:hover { background: #eef1f4; }
    .sheet-body { flex: 1; overflow: hidden; position: relative; touch-action: none; }
    .td-tree { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
    .sheet .zoom { display: inline-flex; gap: 2px; align-items: center; }
    .sheet .zoom .sheet-btn { padding: 3px 8px; }
    .sheet .zoom-val { min-width: 54px; }
    .td-lines { position: absolute; left: 0; top: 0; overflow: visible; pointer-events: none; }
    .td-edge { fill: none; stroke: #9ca3af; stroke-width: 1.4; }
    .td-link { fill: none; stroke: #6366f1; stroke-width: 1.3; stroke-dasharray: 4 3; }
    .td-arrow { fill: #6366f1; }
    .td-node { position: absolute; background: #fff; border: 1px solid #d9dde3; border-radius: 10px; padding: 8px 11px; cursor: pointer;
      box-shadow: 0 1px 2px rgba(0,0,0,.05); }
    .td-node:hover { border-color: #6366f1; }
    .td-node.root { border: 1.5px solid #111827; }
    .td-node.sel { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,.2); }
    .td-term { font-weight: 700; font-size: 13.5px; }
    .td-gloss { color: #4b5563; font-size: 12px; margin-top: 2px; }
    .td-points { margin: 6px 0 0; padding: 6px 0 0 16px; border-top: 1px dashed #e5e7eb; color: #374151; font-size: 12px; line-height: 1.5; }
    .td-points li { margin: 2px 0; }
    .sheet-body { cursor: default; }
    .sheet-body.panning { cursor: grabbing; user-select: none; }
    .td-rel { position: absolute; transform: translate(-50%, -50%); background: #f8fafc; color: #4b5563; font-size: 11px; padding: 0 5px; border-radius: 4px; white-space: nowrap; }
    .td-lab { position: absolute; transform: translate(-50%, -50%); background: #eef2ff; color: #4338ca; font-size: 11px; padding: 1px 7px; border-radius: 999px; white-space: nowrap; }
    .td-sub { position: absolute; left: 0; color: #6b7280; font-size: 12px; white-space: nowrap; }
    .sheet-detail { position: absolute; right: 16px; bottom: 16px; width: min(340px, calc(100% - 32px)); max-height: calc(100% - 32px); overflow: auto;
      background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px 18px; box-shadow: 0 10px 30px rgba(0,0,0,.18); }
    .sheet-detail[hidden] { display: none; }
    .detail-close { float: right; border: 0; background: none; color: #6b7280; cursor: pointer; font-size: 14px; padding: 0 2px 4px 8px; }
    .detail-close:hover { color: #111827; }
    .sheet-detail h3 { margin: 0 0 2px; font-size: 16px; }
    .sheet-detail .role { color: #6b7280; font-size: 12px; }
    .sheet-detail .gloss { margin: 8px 0; color: #374151; }
    .sheet-detail ul { margin: 8px 0 12px; padding-left: 18px; }
    .sheet-detail li { margin: 3px 0; }
    .sheet-detail .go { border: 1px solid #d0d7de; background: #f6f8fa; border-radius: 8px; padding: 4px 10px; cursor: pointer; font: inherit; }

    /* 다크 테마(품는 화면이 notelayer-overlay 에 data-theme="dark" 를 단다) */
    :host([data-theme="dark"]) .mini { background: #1f232a; color: #e5e7eb; border-color: #343a43; box-shadow: 0 4px 16px rgba(0,0,0,.5); }
    :host([data-theme="dark"]) .mini-items { color: #d1d5db; }
    :host([data-theme="dark"]) .mini .it button:hover { background: #2b3038; }
    :host([data-theme="dark"]) .mini .it .eye { color: #9ca3af; }
    :host([data-theme="dark"]) .mini .it.on .lab { background: #3b2f12; box-shadow: inset 0 0 0 1px #b45309; }
    :host([data-theme="dark"]) .mini-acts { border-top-color: #343a43; }
    :host([data-theme="dark"]) .mini .act { background: #2a2f37; border-color: #3d434d; color: #e5e7eb; }
    :host([data-theme="dark"]) .mini .act:hover:not(:disabled) { background: #333943; }
    :host([data-theme="dark"]) .mini .act.sw.on { background: #3b2f12; border-color: #b45309; color: #fbbf24; }
    :host([data-theme="dark"]) .sheet { background: #14161a; color: #e5e7eb; }
    :host([data-theme="dark"]) .sheet-head, :host([data-theme="dark"]) .sheet-detail { background: #1b1e24; border-color: #2b2f36; }
    :host([data-theme="dark"]) .sheet-topic, :host([data-theme="dark"]) .sheet-detail .gloss { color: #d1d5db; }
    :host([data-theme="dark"]) .sheet-close:hover { background: #2a2f37; color: #fff; }
    :host([data-theme="dark"]) .td-node { background: #1f232a; border-color: #343a43; box-shadow: none; }
    :host([data-theme="dark"]) .td-node.root { border-color: #e5e7eb; }
    :host([data-theme="dark"]) .td-gloss { color: #9ca3af; }
    :host([data-theme="dark"]) .td-points { color: #d1d5db; border-top-color: #343a43; }
    :host([data-theme="dark"]) .td-edge { stroke: #4b5563; }
    :host([data-theme="dark"]) .td-rel { background: #14161a; color: #9ca3af; }
    :host([data-theme="dark"]) .td-lab { background: #262a4a; color: #c7d2fe; }
    :host([data-theme="dark"]) .sheet-detail .go, :host([data-theme="dark"]) .sheet-btn { background: #2a2f37; border-color: #3d434d; color: #e5e7eb; }
    :host([data-theme="dark"]) .sheet-detail { box-shadow: 0 10px 30px rgba(0,0,0,.6); }
    :host([data-theme="dark"]) .detail-close:hover { color: #fff; }
    .mk { display: inline-block; vertical-align: middle; margin-right: 4px; }
    .mk-key { color: var(--circle); font-weight: 700; text-decoration: underline solid var(--circle); text-decoration-thickness: 2px; text-underline-offset: 2px; }
    .mk-hl { width: 12px; height: 9px; background: var(--hl); }
    .mk-wave { width: 12px; height: 2px; border-bottom: 2px dotted var(--wave); }
    .pop { position: absolute; z-index: 5; pointer-events: auto; display: flex; gap: 2px; padding: 4px; border-radius: 9px; background: #1f2328; color: #fff;
      font: 12px/1.4 "Pretendard Variable", "Pretendard", "Malgun Gothic", sans-serif; box-shadow: 0 6px 18px rgba(0,0,0,.3); white-space: nowrap; }
    .pop[hidden] { display: none; }
    .pop button { border: 0; background: none; color: #fff; padding: 4px 8px; border-radius: 6px; cursor: pointer; font: inherit; }
    .pop button:hover { background: rgba(255,255,255,.15); }
    .pop button[aria-pressed="true"] { background: rgba(255,255,255,.28); }
    .pop .sep { width: 1px; background: rgba(255,255,255,.2); margin: 2px 2px; }
    /* 수정 모드: 설명 옮기기(놓을 자리 줄·끌리는 꼬리표), 표시 범위 손잡이 */
    .drop-line { position: fixed; height: 3px; border-radius: 2px; background: #6366f1; box-shadow: 0 0 0 2px rgba(99,102,241,.25); pointer-events: none; z-index: 9; }
    .drag-ghost { position: fixed; max-width: 240px; padding: 5px 10px; border-radius: 8px; background: #1f2328; color: #fff; pointer-events: none; z-index: 9;
      font: 12px/1.4 "Pretendard Variable", "Pretendard", "Malgun Gothic", sans-serif; box-shadow: 0 6px 18px rgba(0,0,0,.3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .knob { position: fixed; width: 22px; pointer-events: none; z-index: 6; }
    .knob::before { content: ""; position: absolute; left: 10px; width: 2px; top: 0; bottom: 0; background: #6366f1; }
    .knob.start::before { top: 10px; }
    .knob.end::before { bottom: 10px; }
    .knob i { position: absolute; left: 5px; width: 12px; height: 12px; border-radius: 50%; background: #6366f1; box-shadow: 0 0 0 2px #fff;
      pointer-events: auto; cursor: ew-resize; touch-action: none; user-select: none; -webkit-user-select: none; }
    .knob.start i { top: 0; }
    .knob.end i { bottom: 0; }
    @media (pointer: coarse) { .knob i { left: 2px; width: 18px; height: 18px; } }
    .drop-line[hidden], .drag-ghost[hidden], .knob[hidden] { display: none; }
    /* 중요도 음영: 문단 묶음마다 옅은 바탕 + 왼쪽 막대 + 꼬리표. 거의 안 쓰는 곳은 흐린 막을 덮는다 */
    .imp-tint, .imp-bar { position: absolute; pointer-events: none; }
    .imp-tint { border-radius: 4px; }
    .imp-bar { width: 3px; border-radius: 2px; }
    .imp-chip { position: absolute; pointer-events: auto; cursor: pointer; padding: 0 7px; height: 18px; border-radius: 999px; white-space: nowrap;
      font: 600 11px/18px "Pretendard Variable", "Pretendard", "Malgun Gothic", sans-serif; box-shadow: 0 0 0 1px rgba(0,0,0,.06); }
    .imp-chip.left { transform: translateX(-100%); }
    .imp-why { position: absolute; transform: translateX(-100%); pointer-events: auto; cursor: pointer; white-space: nowrap; overflow: hidden;
      text-overflow: ellipsis; text-align: right; font: 400 11px/16px "Pretendard Variable", "Pretendard", "Malgun Gothic", sans-serif; opacity: .9; }
    .imp-why.wrap { white-space: normal; word-break: keep-all; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
    .pop .why { white-space: normal; max-width: 300px; padding: 4px 8px; line-height: 1.5; }
    /* 요약 고치기: 상자 끌어 옮기기, 오른쪽 아래 칸에서 글 고치기 */
    .td-node.editable { cursor: grab; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
    .td-node.dragging { z-index: 3; opacity: .92; cursor: grabbing; box-shadow: 0 10px 28px rgba(0,0,0,.25); }
    .td-node.drop { border-color: #6366f1; background: #eef2ff; box-shadow: 0 0 0 3px rgba(99,102,241,.35); }
    .sheet-btn.sw-on { background: #fef3c7; border-color: #f59e0b; color: #92400e; }
    .sheet-detail .ed-row { margin: 8px 0; }
    .sheet-detail .ed-row > span { display: block; font-size: 11px; font-weight: 700; color: #6b7280; margin-bottom: 2px; }
    .sheet-detail .ed { border: 1px dashed #cbd5e1; border-radius: 6px; padding: 3px 7px; min-height: 1.6em; cursor: text; outline: none; }
    .sheet-detail .ed:focus { border: 1px solid #6366f1; box-shadow: 0 0 0 2px rgba(99,102,241,.2); }
    .sheet-detail .ed.multi { white-space: pre-wrap; }
    .sheet-detail .ed:empty::before { content: attr(data-ph); color: #9ca3af; }
    .sheet-detail .ed-acts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
    .sheet-detail .danger { color: #b42318; }
    :host([data-theme="dark"]) .td-node.drop { background: #262a4a; border-color: #818cf8; }
    :host([data-theme="dark"]) .sheet-detail .ed { border-color: #3d434d; }
    :host([data-theme="dark"]) .sheet-detail .danger { color: #f87171; }
    :host([data-theme="dark"]) .sheet-btn.sw-on { background: #3b2f12; border-color: #b45309; color: #fbbf24; }
  ` + PANEL_CSS));
  const impLayer = h("div", { class: "layer" }); // 중요도 음영(설명 배지·손잡이보다 아래)
  const badgeLayer = h("div", { class: "layer" });
  const pop = h("div", { class: "pop", hidden: true, onmousedown: (e) => e.preventDefault() });
  shadow.append(impLayer, badgeLayer);
  // 수정 모드에서 끌어 고치기에 쓰는 화면 조각과 상태(그리기 함수가 먼저 부를 수 있어 여기서 만든다)
  const dragLine = h("div", { class: "drop-line", hidden: true });
  const dragGhost = h("div", { class: "drag-ghost", hidden: true });
  const knobs = ["start", "end"].map((side) => h("div", { class: `knob ${side}`, hidden: true },
    h("i", { title: side === "start" ? "끌어서 표시가 시작하는 자리 옮기기" : "끌어서 표시가 끝나는 자리 옮기기", onpointerdown: (e) => startKnob(e, side) })));
  shadow.append(dragLine, dragGhost, ...knobs);
  let boxDrag = null, knobFor = null, knobDrag = null;
  let impSig = ""; // 중요도 음영을 마지막으로 그린 자리(같으면 다시 만들지 않는다)
  let dragEndAt = 0; // 끌기를 막 끝낸 손가락·마우스의 「누르기」 는 무시한다(놓자마자 다른 것이 열리지 않게)

  const colors = () => MARK_COLORS[state.tpl] || MARK_COLORS.tech;
  function paint() {
    const c = colors(), f = state.focus;
    // 또렷하게 할 때: 본문 글자 전체를 흐리게(nl-ov-dim) 칠하고, 고른 종류만 그 위에 진한 글자색으로 다시 칠한다(우선순위가 높은 칠이 이긴다)
    const ink = "#111827";
    pageStyle.textContent = PDF ? pdfMarkCss(c, f) : `::highlight(nl-ov-dim){color:rgba(120,124,132,.42)}
::highlight(nl-ov-key){color:${c.circle};text-decoration:underline solid ${c.circle};text-decoration-thickness:2px;text-underline-offset:3px}
::highlight(nl-ov-hl){background-color:${c.hl}${f === "highlight" ? `;color:${ink}` : ""}}
::highlight(nl-ov-wave){text-decoration:underline wavy ${c.wave};text-decoration-thickness:1.5px;text-underline-offset:4px${f === "wave" ? `;color:${ink}` : ""}}
::highlight(nl-ov-flash){background-color:rgba(245,158,11,.4)}`;
    panel.style.setProperty("--circle", c.circle); panel.style.setProperty("--hl", c.hl); panel.style.setProperty("--wave", c.wave);
    if (!window.CSS?.highlights) return;
    const visible = (k) => state.show[k] && (!f || f === k);
    const of = (k) => (visible(k) ? state.marks.filter((m) => m.kind === k).map((m) => m.range) : []);
    const set = (name, ranges, priority) => { const x = new Highlight(...ranges); x.priority = priority; CSS.highlights.set(name, x); };
    const all = f && state.root ? (() => { const r = document.createRange(); r.selectNodeContents(state.root); return [r]; })() : [];
    set("nl-ov-dim", all, 0);
    set("nl-ov-key", of("circle"), 2);
    set("nl-ov-hl", of("highlight"), 1);
    set("nl-ov-wave", of("wave"), 1);
  }
  // PDF 처럼 글자 층이 투명한 화면: 글자색을 바꾸면 원본 그림 위에 다른 글꼴의 글자가 겹쳐 보인다. 그래서 바탕색과 밑줄로만 칠하고,
  // 흐리게 하기는 글자 위에 흰 막을 덮는 방식으로 한다(또렷하게 할 종류는 제 색 바탕을 한 겹 더 깐다)
  const tint = (hex, a) => { const n = parseInt(String(hex).slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
  function pdfMarkCss(c, f) {
    return `::highlight(nl-ov-dim){background-color:rgba(255,255,255,.66)}
::highlight(nl-ov-key){background-color:${tint(c.circle, f === "circle" ? 0.3 : 0.14)};text-decoration:underline solid ${c.circle};text-decoration-thickness:2px;text-underline-offset:2px}
::highlight(nl-ov-hl){background-color:${c.hl}}
::highlight(nl-ov-wave){${f === "wave" ? `background-color:${tint(c.wave, 0.16)};` : ""}text-decoration:underline wavy ${c.wave};text-decoration-thickness:1.5px;text-underline-offset:2px}
::highlight(nl-ov-flash){background-color:rgba(245,158,11,.4)}`;
  }
  // 작은 상자·패널에서 보이기/숨기기, 또렷하게를 바꾼 다음 다시 그린다
  function setShow(k, on) { state.show[k] = on; if (!on && state.focus === k) state.focus = null; refreshMarks(); }
  function setFocus(k) { state.focus = state.focus === k ? null : k; if (state.focus) state.show[k] = true; refreshMarks(); }
  function refreshMarks() { paint(); drawLayer(); renderResult(); }

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
    drawKnobs();
    drawImp();
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
    /* 색은 품는 화면(PDF 노트)이 종이 색에 맞춰 --nl-* 변수로 넘긴다. 반투명 층이라 어떤 바탕에서도 어울린다. 없으면 밝은 기본값 */
    .card { border: 1px solid var(--nl-line, #e5e7eb); border-left: 3px solid var(--c); border-radius: 8px; background: var(--nl-card, #f8fafc); color: var(--nl-ink, #1f2328);
      padding: 8px 12px; margin: 6px 0; font: 14px/1.65 "Pretendard Variable", "Pretendard", "IBM Plex Sans KR", "Malgun Gothic", sans-serif; text-align: left; }
    .head { display: flex; align-items: center; gap: 6px; margin-bottom: 2px; }
    .chip { font-size: 12px; font-weight: 700; color: color-mix(in srgb, var(--c), white var(--nl-lift, 0%)); }
    .grow { flex: 1; }
    .edit { border: 0; background: none; color: var(--nl-muted, #9ca3af); cursor: pointer; font-size: 12px; padding: 0 4px; visibility: hidden; }
    .card:hover .edit { visibility: visible; }
    pre { margin: 6px 0 0; padding: 6px 8px; background: var(--nl-pre, #eef2f6); border-radius: 6px; font: 12.5px/1.5 "D2Coding", "NanumGothicCoding", Consolas, "Pretendard Variable", monospace; white-space: pre; overflow-x: auto; }
    details { margin-top: 6px; }
    summary { cursor: pointer; color: color-mix(in srgb, #9c36b5, white var(--nl-lift, 0%)); font-size: 13px; }
    .tr { border-left: 3px solid var(--nl-tr-bar, #94a3b8); border-radius: 8px; background: var(--nl-card, #f8fafc); color: var(--nl-ink, #334155); padding: 6px 12px; margin: 6px 0;
      font: 14px/1.7 "Pretendard Variable", "Pretendard", "IBM Plex Sans KR", "Malgun Gothic", sans-serif; text-align: left; }
    .tr-label { font-size: 11px; font-weight: 700; color: var(--nl-muted, #64748b); margin-bottom: 1px; }
    [contenteditable] { outline: 1px dashed var(--nl-line, #cbd5e1); border-radius: 4px; padding: 1px 3px; min-height: 1.5em; cursor: text; }
    [contenteditable]:focus { outline: 2px solid #6366f1; background: var(--nl-focus, #fff); }
    [contenteditable]:empty::before { content: attr(data-ph); color: #9ca3af; }
    pre[contenteditable] { white-space: pre; margin-top: 6px; }
    .lab-sel { font: 700 12px "Pretendard Variable", "Pretendard", "Malgun Gothic", sans-serif; color: var(--c); border: 1px solid var(--nl-line, #e5e7eb); border-radius: 6px; background: var(--nl-focus, #fff); padding: 1px 4px; }
    .del { border: 0; background: none; color: #9ca3af; cursor: pointer; font-size: 12px; padding: 0 4px; }
    .del:hover { color: #b42318; }
    .grip { border: 0; background: none; color: var(--nl-muted, #9ca3af); cursor: grab; font-size: 14px; line-height: 1; padding: 2px 4px; margin-left: -6px;
      touch-action: none; user-select: none; -webkit-user-select: none; }
    .grip:hover { color: #6366f1; }
    .card.dragging { opacity: .35; }
    @media (pointer: coarse) { .grip { padding: 6px 8px; font-size: 16px; } }
    @media (hover: none) { .edit { visibility: visible; } }
    @media (pointer: coarse) { .edit, .del { padding: 4px 8px; font-size: 13px; } }
  `;
  const inlineHosts = [];
  const inlineEls = new Map(); // 설명 id → 본문 속 카드(수정 중이면 글 칸). 새 설명을 달면 여기로 커서를 옮긴다
  const cardEls = new Map();   // 설명 id → 본문 속 카드 전체(설명을 끌어 옮길 때 놓을 자리를 잰다)
  let inlineSig = "";
  // 그릴 내용 — 설명 카드와 번역. 글자를 고치는 동안에는 이 값을 같이 갱신해 다시 그리지 않는다(다시 그리면 커서가 날아간다)
  function inlineParts() {
    const on = state.boxMode === "inline" && (!state.focus || state.focus === "boxes"); // 표시 한 종류만 또렷하게 할 때는 잠시 감춘다
    const list = on && state.show.boxes ? sortedBoxes() : [];
    const trs = on && state.show.tr ? [...state.trs].filter(([i, t]) => state.paras[i] && t.text).sort((a, b) => a[0] - b[0]) : [];
    const edit = COMPACT && state.editing;
    return { list, trs, edit, sig: JSON.stringify([state.tpl, edit, list.map((b) => [boxOrder(b), b.id, b.label, b.text, b.pre, b.answer]), trs.map(([i, t]) => [i, t.text, t.mine])]) };
  }
  // 고칠 수 있는 글 칸. 입력할 때마다 값만 바꾸고 저장한다
  function editField(text, ph, onText, tag = "div", cls = "") {
    return h(tag, { class: cls, contenteditable: "plaintext-only", "data-ph": ph,
      oninput: (e) => { onText(tag === "pre" ? e.target.innerText.replace(/\n$/, "") : tidy(e.target.innerText)); inlineSig = inlineParts().sig; save(); queueDraw(); } }, text || "");
  }
  function inlineCard(b, colors, edit) {
    const c = colors[b.label] || "#6b7280";
    if (edit) {
      const labels = [...new Set([...Object.keys(colors), b.label])];
      const txt = editField(b.text, "설명을 쓰세요", (v) => { b.text = v; b.mine = true; });
      inlineEls.set(b.id, txt);
      let card = null;
      card = h("div", { class: "card", style: `--c:${c}` },
        h("div", { class: "head" },
          h("button", { class: "grip", title: "끌어서 다른 문단 아래나 다른 설명 앞뒤로 옮깁니다", "aria-label": "설명 옮기기", onpointerdown: (e) => startBoxDrag(e, b, card) }, "⋮⋮"),
          h("select", { class: "lab-sel", onchange: (e) => { b.label = e.target.value; b.mine = true; afterChange(); } },
            labels.map((l) => h("option", { value: l, selected: l === b.label }, l))),
          h("span", { class: "grow" }),
          h("button", { class: "del", title: "이 설명 지우기", onclick: () => { state.boxes = state.boxes.filter((x) => x !== b); afterChange(); } }, "✕ 지우기")),
        txt,
        editField(b.pre, "(선택) 글자 그림·비교", (v) => { b.pre = v; b.mine = true; }, "pre"),
        b.answer || state.tpl === "exam" ? editField(b.answer, "(선택) 답 — 처음에 접혀 보입니다", (v) => { b.answer = v; b.mine = true; }) : null);
      cardEls.set(b.id, card);
      return card;
    }
    const card = h("div", { class: "card", style: `--c:${c}` },
      h("div", { class: "head" }, h("span", { class: "chip" }, b.label), h("span", { class: "grow" }),
        h("button", { class: "edit", title: COMPACT ? "수정 모드로 바꿔 이 자리에서 고치기" : "패널에서 고치기",
          onclick: () => { if (!state.editing) setEditing(true); openCard(b.id); } }, "✎ 고치기")),
      h("div", {}, b.text),
      b.pre ? h("pre", {}, b.pre) : null,
      b.answer ? h("details", {}, h("summary", {}, "답 보기"), h("div", {}, b.answer)) : null);
    inlineEls.set(b.id, card); cardEls.set(b.id, card);
    return card;
  }
  function inlineTr(i, t, edit) {
    return h("div", { class: "tr" },
      h("div", { class: "tr-label" }, t.mine ? "번역 · 내가 고침" : "번역"),
      edit ? h("div", { onfocusout: (e) => { if (!tidy(e.target.innerText)) { state.trs.delete(i); afterChange(); } } },
        editField(t.text, "번역을 쓰세요", (v) => state.trs.set(i, { text: v, mine: true })))
        : h("div", {}, t.text));
  }
  // 웹페이지의 바탕색: 문단에서 위로 올라가며 처음 칠해진 바탕(거의 투명한 것은 건너뛴다). 끝까지 없으면 흰색
  function bgOf(node) {
    for (let n = node; n && n.nodeType === 1; n = n.parentElement) {
      const m = /rgba?\(([^)]+)\)/.exec(getComputedStyle(n).backgroundColor || "");
      if (!m) continue;
      const [r, g, b, a = 1] = m[1].split(",").map(Number);
      if (a > 0.5) return [r, g, b];
    }
    return [255, 255, 255];
  }
  const isDarkBg = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5;
  // 카드 색: 바탕이 어두우면 밝은 글자에 옅게 밝힌 층, 밝으면 짙은 글자에 옅게 어둡힌 층(반투명이라 바탕색이 비친다). PDF 노트도 같은 값을 쓴다
  function noteVars(node, bg) {
    const v = isDarkBg(bg)
      ? { card: "rgba(255,255,255,.06)", line: "rgba(255,255,255,.14)", ink: "#e5e7eb", pre: "rgba(255,255,255,.07)", muted: "#9ca3af", "tr-bar": "rgba(255,255,255,.3)", focus: "rgba(255,255,255,.09)", lift: "40%" }
      : { card: "rgba(0,0,0,.035)", line: "rgba(0,0,0,.09)", ink: "#1f2328", pre: "rgba(0,0,0,.05)", muted: "#6b7280", "tr-bar": "rgba(0,0,0,.25)", focus: "#fff", lift: "0%" };
    for (const [k, val] of Object.entries(v)) node.style.setProperty(`--nl-${k}`, val);
  }
  function renderInline() {
    const { list, trs, edit, sig } = inlineParts();
    if (sig === inlineSig) return; // 내용이 그대로면 손대지 않는다(끼우면 페이지 높이가 바뀌어 다시 그리기가 돌아오므로)
    inlineSig = sig;
    for (const x of inlineHosts.splice(0)) x.remove();
    inlineEls.clear(); cardEls.clear();
    const colors = TEMPLATES[state.tpl].boxes;
    // 문단마다 번역 → 설명 순서로 한 덩어리
    const groups = new Map();
    const group = (el) => { if (!groups.has(el)) groups.set(el, { tr: null, boxes: [] }); return groups.get(el); };
    for (const [i, t] of trs) group(state.paras[i].el).tr = [i, t];
    for (const b of list) group(b.el).boxes.push(b);
    for (const [el, g] of groups) {
      if (!el.isConnected) continue;
      const box = document.createElement("notelayer-note");
      const sr = box.attachShadow({ mode: "open" });
      sr.append(h("style", {}, INLINE_CSS), ...[g.tr ? inlineTr(g.tr[0], g.tr[1], edit) : null, ...g.boxes.map((b) => inlineCard(b, colors, edit))].filter(Boolean));
      // 품는 화면(PDF 노트)이 자리를 정하면 그쪽에 맡긴다. 아니면 목록 칸·표 칸 안의 문단은 그 칸 안에, 나머지는 문단 바로 뒤에(표·목록 모양을 깨지 않게)
      if (HOST?.insertAfter) HOST.insertAfter(el, box);
      else { if (/^(LI|TD|TH|DT|DD)$/.test(el.tagName)) el.append(box); else el.after(box); noteVars(box, bgOf(el)); }
      inlineHosts.push(box);
    }
    HOST?.relayout?.();
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
  // ── 본문 직접 고르기 ──
  // 마우스를 올리거나(손가락은 누르면) 그 자리 상자에 테두리가 생긴다. ↑ 로 더 큰 상자, ↓ 로 다시 작은 상자. 「이 상자로」 로 정한다
  let pick = null; // { cur, trail: [] }
  const pickBox = h("div", { class: "pick-box", hidden: true });
  const pickInfo = h("span", {});
  const pickBar = h("div", { class: "pick-bar", hidden: true },
    h("b", {}, "본문 고르기"), pickInfo,
    h("button", { onclick: () => pickMove(1) }, "↑ 더 큰 상자"),
    h("button", { onclick: () => pickMove(-1) }, "↓ 작은 상자"),
    h("button", { class: "primary", onclick: () => pick?.cur && pickDone(pick.cur) }, "이 상자로"),
    h("button", { onclick: endPick }, "취소"));
  shadow.append(pickBox, pickBar);
  const blockOf = (node) => {
    let el = node?.nodeType === 1 ? node : node?.parentElement;
    while (el && el !== document.body && !(el.matches(BLOCK) || getComputedStyle(el).display === "block")) el = el.parentElement;
    return el && el !== document.body && el !== document.documentElement ? el : null;
  };
  function pickShow(el) {
    if (!pick) return;
    pick.cur = el;
    if (!el) { pickBox.hidden = true; pickInfo.textContent = " 상자에 마우스를 올리거나 눌러 보세요"; return; }
    const r = el.getBoundingClientRect();
    Object.assign(pickBox.style, { left: `${r.left + scrollX - 3}px`, top: `${r.top + scrollY - 3}px`, width: `${r.width + 6}px`, height: `${r.height + 6}px` });
    pickBox.hidden = false;
    pickInfo.textContent = ` 글자 ${textLen(el).toLocaleString()}자 · 문단 ${collectParagraphs(el).length}개`;
  }
  function pickMove(dir) {
    if (!pick?.cur) return;
    if (dir > 0) { const up = pick.cur.parentElement; if (up && up !== document.body && up !== document.documentElement) { pick.trail.push(pick.cur); pickShow(up); } }
    else if (pick.trail.length) pickShow(pick.trail.pop());
  }
  const pickOver = (e) => { if (pick && e.pointerType !== "touch" && !e.composedPath().includes(host)) { pick.trail = []; pickShow(blockOf(e.target)); } };
  const pickClick = (e) => {
    if (!pick || e.composedPath().includes(host)) return;
    e.preventDefault(); e.stopPropagation(); // 고르는 동안에는 링크를 눌러도 이동하지 않는다
    pick.trail = []; pickShow(blockOf(e.target));
  };
  const pickKey = (e) => {
    if (!pick) return;
    if (e.key === "Escape") { e.preventDefault(); endPick(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); pickMove(1); }
    else if (e.key === "ArrowDown") { e.preventDefault(); pickMove(-1); }
    else if (e.key === "Enter" && pick.cur) { e.preventDefault(); pickDone(pick.cur); }
  };
  function startPick() {
    hidePop(); closeSummary();
    if (!COMPACT) steps.open = false;
    setMin(true);
    pick = { cur: null, trail: [] };
    pickBar.hidden = false;
    pickShow(state.root && state.root !== document.body ? state.root : null);
    addEventListener("pointerover", pickOver, true);
    addEventListener("click", pickClick, true);
    addEventListener("keydown", pickKey, true);
  }
  function endPick() {
    pick = null; pickBox.hidden = true; pickBar.hidden = true;
    removeEventListener("pointerover", pickOver, true);
    removeEventListener("click", pickClick, true);
    removeEventListener("keydown", pickKey, true);
  }
  // 고른 상자를 다시 찾을 주소(CSS 선택자): id 가 있으면 그것, 없으면 태그·클래스로 위에서부터 이어 붙이고 페이지에 하나뿐인지 확인한다
  function selectorOf(el) {
    const parts = [];
    for (let n = el; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      if (n.id && /^[A-Za-z][\w-]*$/.test(n.id)) { parts.unshift(`#${n.id}`); break; }
      const cls = [...n.classList].filter((c) => /^[A-Za-z][\w-]*$/.test(c)).slice(0, 3).map((c) => `.${c}`).join("");
      let part = n.tagName.toLowerCase() + cls;
      const sibs = n.parentElement ? [...n.parentElement.children].filter((x) => x.tagName === n.tagName) : [];
      if (sibs.length > 1) part += `:nth-of-type(${sibs.indexOf(n) + 1})`;
      parts.unshift(part);
      const sel = parts.join(" > ");
      try { if (document.querySelectorAll(sel).length === 1) return sel; } catch {}
    }
    const sel = parts.join(" > ");
    try { return document.querySelectorAll(sel).length === 1 ? sel : null; } catch { return null; }
  }
  function pickDone(el) {
    endPick();
    const sel = selectorOf(el);
    if (sel) try { localStorage.setItem(ROOT_KEY, sel); } catch {}
    rootHow = "saved";
    setRoot(el);
    setMsg(copyMsg, sel ? "본문 상자를 바꿨습니다. 이 사이트의 다른 글에서도 같은 자리를 본문으로 씁니다." : "본문 상자를 바꿨습니다(이 상자는 다시 찾을 주소를 만들지 못해 이번에만 씁니다).");
  }
  // 본문을 바꾸면 문단 번호가 달라지므로, 지금 표시·설명은 구절과 앞뒤 글자로 새 본문에 다시 붙인다
  function setRoot(el) {
    const had = hasData();
    const data = had ? serialize() : null;
    state.root = el;
    state.paras = collectParagraphs(el);
    if (had) {
      state.marks = []; state.orphans = []; state.attaching = null; state.boxes = []; state.imps = []; state.trs = new Map();
      apply(data, { restored: true });
      save();
    } else { inlineSig = ""; paint(); drawLayer(); renderResult(); }
    renderFound();
    showRoot();
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
    openOverview();
  }

  // ── 본문 영역 지도: 페이지 전체를 왼쪽 위에 작게 줄여 그리고, 본문으로 고른 영역과 지금 보는 곳을 겹쳐 보인다 ──
  // 화면을 찍지 않고 큰 구획(머리·메뉴·옆 칸·바닥 등)만 회색 상자로 그린다. 지도를 누르면 그 자리로 굴러간다
  const overview = h("div", { class: "overview", hidden: true });
  const OV_W = 200;
  let ovScale = null;
  function docSize() {
    const de = document.documentElement, b = document.body;
    return { w: Math.max(de.scrollWidth, b?.scrollWidth || 0, innerWidth), h: Math.max(de.scrollHeight, b?.scrollHeight || 0, innerHeight) };
  }
  function openOverview() { overview.hidden = false; renderOverview(); addEventListener("scroll", moveOverviewView, { passive: true }); }
  function closeOverview() { overview.hidden = true; removeEventListener("scroll", moveOverviewView); }
  function ovRect(r, cls, extra = "") {
    const { sx, sy } = ovScale;
    return h("div", { class: cls, style: `left:${r.l * sx}px;top:${r.t * sy}px;width:${Math.max(2, (r.r - r.l) * sx)}px;height:${Math.max(1, (r.b - r.t) * sy)}px;${extra}` });
  }
  const docRect = (el) => { const r = el.getBoundingClientRect(); return { l: r.left + scrollX, t: r.top + scrollY, r: r.right + scrollX, b: r.bottom + scrollY, w: r.width, h: r.height }; };
  function renderOverview() {
    if (overview.hidden || !state.root) return;
    const d = docSize();
    const H = Math.max(80, Math.min(d.h * (OV_W / d.w), innerHeight - 150));
    ovScale = { sx: OV_W / d.w, sy: H / d.h };
    const map = h("div", { class: "ov-map", style: `width:${OV_W}px;height:${H}px`, title: "누르면 그 자리로 이동합니다",
      onclick: (e) => {
        const r = map.getBoundingClientRect();
        scrollTo({ left: 0, top: (e.clientY - r.top) / ovScale.sy - innerHeight / 2, behavior: "smooth" });
      } });
    // 큰 구획: 화면에 보이고 너무 작지 않은 것만. 본문 영역과 그 안쪽은 따로 그리므로 뺀다
    const parts = [];
    for (const el of document.querySelectorAll("header, nav, aside, footer, main, [role=banner], [role=navigation], [role=complementary], [role=contentinfo], [role=main]")) {
      if (parts.length >= 40 || el === state.root || state.root.contains(el) || el.closest("notelayer-overlay")) continue;
      const r = docRect(el);
      if (r.w < 40 || r.h < 16) continue;
      parts.push(ovRect(r, "ov-part"));
    }
    const root = docRect(state.root);
    const lines = state.paras.slice(0, 300).map((p) => { const r = docRect(p.el); return r.h ? ovRect(r, "ov-line") : null; });
    const view = h("div", { class: "ov-view" });
    map.replaceChildren(...parts, ovRect(root, "ov-root"), ...lines, view);
    overview.replaceChildren(
      h("div", { class: "ov-head" }, h("b", {}, "본문 영역"), h("span", { class: "grow" }),
        h("button", { class: "x", title: "지도 닫기", onclick: closeOverview }, "✕")),
      map,
      h("div", { class: "ov-legend" }, h("span", { class: "sw sw-root" }), "본문으로 고른 곳", h("span", { class: "sw sw-view" }), "지금 보는 곳"));
    moveOverviewView();
  }
  function moveOverviewView() {
    if (overview.hidden || !ovScale) return;
    const v = overview.querySelector(".ov-view");
    if (v) Object.assign(v.style, { left: `${scrollX * ovScale.sx}px`, top: `${scrollY * ovScale.sy}px`,
      width: `${innerWidth * ovScale.sx}px`, height: `${innerHeight * ovScale.sy}px` });
  }

  // ── 패널 ──
  const tplSelect = h("select", { onchange: (e) => { state.tpl = e.target.value; paint(); drawLayer(); renderResult(); save(); } },
    Object.entries(TEMPLATES).map(([id, t]) => h("option", { value: id }, t.name)));
  const pill = COMPACT
    ? h("div", { class: "mini compact", hidden: true })
    : h("div", { class: "mini", hidden: true, role: "button", tabindex: "0", title: "눌러서 notelayer 패널 펼치기",
      onclick: () => setMin(false), onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setMin(false); } } });
  let storeLive = false; // 작은 상자의 저장 점(저장 창과 연결됐는지)
  // 작은 상자 옮기기: 윗줄(이름 줄)을 잡고 끈다. 옮긴 자리는 화면 왼쪽 위 기준으로 이 사이트에 기억하고,
  // 창 크기가 바뀌어도 화면 밖으로 나가지 않게 붙잡는다
  let miniDragged = false;
  function placeMini() {
    const pos = ui.miniPos;
    if (!pos) return;
    const w = pill.offsetWidth || 200, hgt = pill.offsetHeight || 40;
    const x = clamp(pos.x, 4, Math.max(4, innerWidth - w - 4)), y = clamp(pos.y, 4, Math.max(4, innerHeight - hgt - 4));
    Object.assign(pill.style, { left: `${x}px`, top: `${y}px`, right: "auto" });
  }
  pill.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || !e.target.closest(".mini-head") || e.target.closest("button")) return;
    const r = pill.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    const x0 = e.clientX, y0 = e.clientY;
    miniDragged = false;
    const move = (ev) => {
      if (!miniDragged && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return; // 살짝 누른 것은 누름으로 둔다
      miniDragged = true;
      ui.miniPos = { x: ev.clientX - dx, y: ev.clientY - dy };
      placeMini();
    };
    const up = () => {
      removeEventListener("pointermove", move); removeEventListener("pointerup", up);
      if (miniDragged) { saveUi(); setTimeout(() => { miniDragged = false; }, 0); } // 끈 직후의 누름 한 번만 막고 바로 푼다
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
    e.preventDefault(); // 끄는 동안 본문 글자가 골라지지 않게
  });
  // 끈 직후의 누름은 「펼치기」로 치지 않는다
  pill.addEventListener("click", (e) => { if (miniDragged) { e.stopPropagation(); e.preventDefault(); } }, true);
  function renderMini() {
    if (pill.hidden) return;
    const t = TEMPLATES[state.tpl], c = colors();
    pill.style.setProperty("--circle", c.circle); pill.style.setProperty("--hl", c.hl); pill.style.setProperty("--wave", c.wave);
    const n = (k) => state.marks.filter((m) => m.kind === k).length;
    const eye = (on) => { const v = svgEl("svg", { viewBox: "0 0 16 16", width: "14", height: "14" });
      v.append(svgEl("path", { d: "M1 8s2.6-5 7-5 7 5 7 5-2.6 5-7 5-7-5-7-5z", fill: "none", stroke: "currentColor", "stroke-width": "1.4" }),
        svgEl("circle", { cx: "8", cy: "8", r: "2", fill: "currentColor" }));
      if (!on) v.append(svgEl("path", { d: "M2 14L14 2", stroke: "currentColor", "stroke-width": "1.6" }));
      return v; };
    const stop = (fn) => (e) => { e.stopPropagation(); fn(); };
    const item = (k, sw, name, num) => h("span", { class: `it${state.focus === k ? " on" : ""}${state.show[k] ? "" : " off"}` },
      h("button", { class: "eye", title: state.show[k] ? "본문에서 숨기기" : "본문에 보이기", onclick: stop(() => setShow(k, !state.show[k])) }, eye(state.show[k])),
      h("button", { class: "lab", title: state.focus === k ? "다시 누르면 풀기(Esc)" : "이것만 또렷하게(나머지 글자는 흐리게)", onclick: stop(() => setFocus(k)) },
        sw, `${name} `, h("b", {}, String(num))));
    // 번역은 「이것만 또렷하게」 가 뜻이 없어 보이기/숨기기만 둔다
    const eyeOnly = (k, name, num) => h("span", { class: `it${state.show[k] ? "" : " off"}` },
      h("button", { class: "eye", title: state.show[k] ? "본문에서 숨기기" : "본문에 보이기", onclick: stop(() => setShow(k, !state.show[k])) }, eye(state.show[k])),
      h("span", { class: "lab" }, `${name} `, h("b", {}, String(num))));
    pill.replaceChildren(
      h("div", { class: "mini-head" }, h("b", {}, "notelayer"),
        h("span", { class: storeLive ? "dot on" : "dot", title: LOCAL ? (storeLive ? "이 PC 에 저장 중" : "저장소를 여는 중") : storeLive ? "저장 창과 연결됨" : "저장 창이 닫혀 있음" }),
        h("span", { class: "grow" }), COMPACT ? null : h("span", { class: "open" }, "펼치기 ▾"),
        COMPACT && !HOST ? h("button", { class: "x", title: "닫기(저장한 표시는 남는다). 즐겨찾기 버튼을 다시 누르면 열린다", onclick: stop(destroy) }, "✕") : null),
      h("div", { class: "mini-items" }, hasData()
        ? [item("circle", h("span", { class: "mk mk-key" }, "가"), t.marks.circle, n("circle")),
          item("highlight", h("span", { class: "mk mk-hl" }), t.marks.highlight, n("highlight")),
          item("wave", h("span", { class: "mk mk-wave" }), t.marks.wave, n("wave")),
          item("boxes", null, "설명", state.boxes.length),
          ...(state.imps.length ? [eyeOnly("imp", "중요도", state.imps.length)] : []),
          ...(state.trs.size ? [eyeOnly("tr", "번역", state.trs.size)] : []),
          ...(state.orphans.length ? [h("span", {}, `제자리를 잃은 표시 `, h("b", {}, String(state.orphans.length)))] : [])]
        : [h("span", {}, !COMPACT ? "눌러서 요청문을 복사하고 AI 답을 붙여 넣으세요"
          : !LOCAL && !storeLive ? "저장해 둔 표시는 「저장 창」을 열면 불러옵니다. 새로 만들려면 「AI 답 넣기」에서 요청문을 복사하세요"
          : "이 페이지에 저장된 표시가 아직 없습니다. 「AI 답 넣기」에서 요청문을 복사해 AI 답을 붙여 넣으세요")]),
      COMPACT ? h("div", { class: "mini-acts" },
        h("button", { class: "act", disabled: !state.concepts?.nodes?.length, title: state.concepts ? "개념 구조도를 크게 봅니다" : "요약(개념 구조도)이 아직 없습니다", onclick: stop(openSummary) }, "요약 보기"),
        h("button", { class: `act sw${state.editing ? " on" : ""}`, role: "switch", "aria-checked": String(state.editing),
          title: state.editing ? "누르면 고칠 수 없게 합니다" : "누르면 표시·설명·번역을 고칠 수 있습니다", onclick: stop(() => setEditing(!state.editing)) },
          state.editing ? "✎ 수정 가능" : "🔒 수정 불가"),
        h("button", { class: "act", title: "요청문 복사·AI 답 붙여 넣기·내보내기", onclick: stop(() => setMin(false, true)) }, "AI 답 넣기"),
        // 저장 창을 쓰는 웹페이지에서만 보인다(PDF 노트는 같은 화면이 저장해서 저장 창이 없다)
        !LOCAL && BASE ? h("button", { class: "act", title: storeLive ? "열려 있는 저장 창으로 옮겨 갑니다" : "저장 창을 엽니다",
          onclick: stop(goStore) }, "저장 창 ↗") : null) : "");
    placeMini(); // 내용 폭이 바뀌어도 옮겨 둔 자리에서 화면 밖으로 나가지 않게
  }
  const foundMsg = h("p", { class: "muted" });
  // 설명 분량: 요청문에 넣을 설명 규칙을 고른다. 고른 값은 이 사이트에 기억한다
  const DETAILS = [["brief", "간단히", "막힐 만한 곳에만 한두 문장"], ["mid", "중간", "어려운 문단에 풀이와 예시"], ["deep", "상세히", "문단마다 풀이·예시·먼저 알 것·헷갈리는 점"]];
  const detailHint = h("span", { class: "detail-hint" });
  const detailBtns = DETAILS.map(([k, label, hint]) => h("button", { class: "seg", "aria-pressed": "false", title: hint,
    onclick: () => { ui.detail = k; saveUi(); renderDetail(); } }, label));
  function renderDetail() {
    const cur = ui.detail || "mid";
    DETAILS.forEach(([k], i) => detailBtns[i].setAttribute("aria-pressed", String(k === cur)));
    detailHint.textContent = DETAILS.find(([k]) => k === cur)[2] + (cur === "deep" ? " · 긴 글은 답이 잘릴 수 있어요(그땐 글자를 골라 「🔎 자세히 묻기」)" : "");
  }
  const detailRow = h("div", { class: "detail-row" }, h("span", { class: "detail-label" }, "설명"), h("span", { class: "segs" }, ...detailBtns), detailHint);
  renderDetail();
  const resetRootBtn = h("button", { hidden: true, title: "이 사이트에 기억한 본문 상자를 지우고 자동으로 고릅니다", onclick: () => {
    try { localStorage.removeItem(ROOT_KEY); } catch {}
    setRoot(findRoot());
  } }, "자동 고르기로 되돌리기");
  const copyMsg = h("p", { class: "msg" });
  const answer = h("textarea", { placeholder: "AI 가 돌려준 답(JSON)을 그대로 붙여 넣으세요" });
  const applyMsg = h("p", { class: "msg" });
  const storeState = h("div", { class: "msg" });
  const savedMsg = h("div", { class: "msg" });
  const storeOpenBtn = h("button", { class: "primary", hidden: true, onclick: () => openStore() }, "저장 창 열기");
  const saveBar = h("div", { class: "savebar" }, storeState, savedMsg, storeOpenBtn);
  const setMsg = (el, text, err = false) => { el.className = err ? "msg err" : "msg"; el.textContent = text; };
  // 접고 펴는 줄 없이 늘 펼쳐 둔다. 다른 곳의 steps.open 대입은 이 상자에서는 아무 일도 하지 않는다
  const steps = h("div", { class: "steps" },
    h("h3", {}, "1. 이 페이지 본문으로 요청문 만들기"), foundMsg,
    detailRow,
    h("div", { class: "row" },
      h("button", { class: "primary", onclick: copyPrompt }, "요청문 복사"),
      h("button", { onclick: showRoot }, "본문 영역 보기"),
      HOST ? null : h("button", { title: "본문으로 쓸 상자를 직접 고릅니다. 고른 상자는 이 사이트에 기억합니다", onclick: startPick }, "본문 다시 고르기"),
      resetRootBtn),
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
    // 수정 켜고 끄기는 작은 상자에 있다. 좌우 옮기기·별도 창 떼어 내기는 쓰지 않아 머리줄에서 뺐다(코드는 남겨 둠)
    h("header", {}, h("b", {}, "notelayer"), tplSelect,
      // 작은 상자를 쓰는 화면에서는 ✕ 가 패널만 닫고 작은 상자로 돌아간다(전부 끄기는 작은 상자의 ✕)
      COMPACT ? h("button", { class: "icon", title: "닫고 작은 상자로 돌아가기", onclick: () => setMin(true) }, "✕")
        : [h("button", { class: "icon dock-only", title: "접기", onclick: () => setMin(true) }, "—"),
          HOST ? null : h("button", { class: "icon", title: "닫기(저장한 표시는 남는다)", onclick: destroy }, "✕")]),
    h("div", { class: "edit-bar" }, "수정 모드 — 본문 글자를 끌어 골라 표시·설명을 달고, 표시를 눌러 종류를 바꾸거나 지웁니다. 설명 카드는 글을 눌러 바로 고칩니다."),
    h("div", { class: "body" }, saveBar, steps, resultBox));
  // 도구 막대는 패널보다 위에 그려야 패널 옆 글자를 골라도 눌린다
  shadow.append(panel, pill, pop, overview);
  // 품는 화면이 테마를 바꾸면(notelayer-overlay 의 data-theme) 패널도 따라간다
  const syncTheme = () => { const dark = host.getAttribute("data-theme") === "dark"; panel.classList.toggle("dark", dark); overview.classList.toggle("dark", dark); };
  new MutationObserver(syncTheme).observe(host, { attributes: true, attributeFilter: ["data-theme"] });
  syncTheme();

  // stepsOnly: 작은 상자의 「AI 답 넣기」 로 열면 요청문·답·내보내기 칸만 보인다.
  // 설명 목록이 필요한 길(옆 패널 설명 카드 열기 등)은 setMin(false) 로 열어 전부 보인다
  let stepsOnly = false;
  function setMin(min, onlySteps = false) {
    if (min) panel.setAttribute("data-min", ""); else panel.removeAttribute("data-min");
    pill.hidden = !min;
    stepsOnly = !min && onlySteps;
    if (stepsOnly) steps.open = true;
    resultBox.hidden = !hasData() || stepsOnly;
    renderMini();
  }
  const saveUi = () => store.set(UI_KEY, { side: state.side, width: state.width, boxMode: INLINE_ONLY ? ui.boxMode : state.boxMode, showPoints: ui.showPoints, miniPos: ui.miniPos, detail: ui.detail });

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
  // 본문 글자 가운데 한글이 적으면 외국어 문서로 보고 번역도 요청한다
  function needsTranslation() {
    const s = state.paras.map((x) => x.text).join(" ");
    const letters = (s.match(/\p{L}/gu) || []).length, ko = (s.match(/[가-힣]/g) || []).length;
    return letters > 40 && ko / letters < 0.3;
  }
  async function copyPrompt() {
    const text = PROMPT.build({ title: document.title, paragraphs: state.paras, templateId: state.tpl, template: TEMPLATES[state.tpl], needTr: needsTranslation(), detail: ui.detail || "mid" });
    const ok = await copyText(text);
    setMsg(copyMsg, ok ? `복사했습니다(${text.length.toLocaleString()}자). 쓰는 AI 에 붙여 넣으세요.` : "복사하지 못했습니다.", !ok);
  }
  async function copyResult() {
    const ok = await copyText(JSON.stringify(serialize({ exporting: true })));
    setMsg(applyMsg, ok ? "지금 표시·설명을 JSON 으로 복사했습니다. notelayer 화면의 「AI 표시 만들기」 답 칸에 붙여 넣어도 됩니다." : "복사하지 못했습니다.", !ok);
  }
  function clearSaved() {
    if (!confirm("이 페이지의 표시·설명을 모두 지울까요? 저장한 것도 지워집니다.")) return;
    state.marks = []; state.orphans = []; state.attaching = null; state.boxes = []; state.imps = []; state.concepts = null; state.trs = new Map();
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
    if (!restored && result?.add) return applyAdd(result);
    if (!restored && (state.marks.some((m) => !m.mine) || state.boxes.some((b) => !b.mine))
      && !confirm("지금 있는 AI 표시·설명을 이 답으로 바꿀까요? 내가 단 표시와 설명은 남습니다.")) return null;
    const a = anchor(result);
    // 내가 남긴 것(옮기거나 고친 AI 표시·설명 포함)과 글이 같은 새 표시·설명은 건너뛴다(같은 설명이 두 번 붙지 않게)
    const myMarks = state.marks.filter((m) => m.mine), myBoxes = state.boxes.filter((b) => b.mine);
    const markKey = (m) => `${m.kind}\u0000${squash(m.quote)}`;
    const haveMark = new Set(myMarks.map(markKey)), haveBox = new Set(myBoxes.map((b) => squash(b.text)));
    state.marks = restored ? a.marks : [...myMarks, ...a.marks.filter((m) => !haveMark.has(markKey(m)))];
    state.orphans = restored ? a.lost : state.orphans.filter((o) => o.mine);
    state.attaching = null;
    state.boxes = restored ? a.boxes : [...myBoxes, ...a.boxes.filter((b) => !haveBox.has(squash(b.text)))];
    const myImps = state.imps.filter((x) => x.mine);
    state.imps = restored ? a.imps : [...myImps, ...myImps.reduce((list, m) => carve(list, m.i, m.j), a.imps)].sort((p, q) => p.i - q.i);
    // 번역도 AI 것만 바꾸고 내가 고친 문단은 남긴다
    const trMap = restored ? new Map() : new Map([...state.trs].filter(([, t]) => t.mine));
    for (const t of a.trs) if (!trMap.has(t.i)) trMap.set(t.i, { text: t.text, mine: t.mine });
    state.trs = trMap;
    const c = cleanConcepts(result.concepts);
    // 요약 구조도를 직접 고쳤으면, 새 답의 요약으로 바꾸기 전에 묻는다
    const keepMine = !restored && c && state.concepts?.mine
      && !confirm("요약 구조도를 직접 고친 적이 있습니다. 새 답의 요약으로 바꿀까요?\n(취소를 누르면 고친 요약을 그대로 둡니다)");
    if ((c || restored) && !keepMine) state.concepts = c;
    if (restored || result.ink) HOST?.restoreExtra?.(result); // 품는 화면의 층도 되살린다
    paint(); drawLayer(); renderResult();
    if (!restored || a.moved) save(); // 자리를 다시 잡은 표시는 새 구절·앞뒤 글자로 저장해 둔다
    tuckIfCovering();
    const placed = a.marks.length;
    const parts = [`${restored ? "저장한 " : ""}표시 ${placed}/${a.total}개, 설명 ${a.boxes.length}개를 얹었습니다`];
    if (state.concepts) parts.push(`개념 ${state.concepts.nodes.length}개`);
    if (a.trs.length) parts.push(`번역 ${a.trs.length}문단`);
    if (a.imps.length) parts.push(`중요도 ${a.imps.length}묶음`);
    if (a.moved) parts.push(`글이 바뀌어 자리를 다시 잡은 표시 ${a.moved}개`);
    if (a.lost.length) parts.push(restored
      ? `\n제자리를 잃은 표시 ${a.lost.length}개 — 원문이 바뀌어 찾지 못했습니다. 패널 위쪽 목록에서 다시 붙이거나 지울 수 있습니다`
      : `\n원문에서 찾지 못한 표시 ${a.lost.length}개: ${a.lost.slice(0, 4).map((x) => `「${x.quote}」`).join(", ")}${a.lost.length > 4 ? " …" : ""}`);
    if (!window.CSS?.highlights) parts.push("\n이 브라우저는 형광펜·물결 칠하기를 지원하지 않습니다(크롬 계열 권장).");
    setMsg(applyMsg, parts.join(" · "));
    steps.open = false;
    return { placed, total: a.total, boxes: a.boxes.length, lost: a.lost.map((x) => x.quote), moved: a.moved, orphans: state.orphans.length };
  }

  // 「자세히 묻기」 답: 지금 있는 표시·설명은 그대로 두고 설명만 더한다
  function applyAdd(result) {
    const a = anchor({ boxes: result.boxes });
    if (!a.boxes.length) { setMsg(applyMsg, "더할 설명을 찾지 못했습니다.", true); return null; }
    state.boxes.push(...a.boxes);
    afterChange();
    setMsg(applyMsg, `설명 ${a.boxes.length}개를 더했습니다. 해당 문단 아래에서 볼 수 있습니다.`);
    steps.open = false;
    if (COMPACT) setMin(true);
    setTimeout(() => openCard(a.boxes[0].id), 50);
    return { placed: 0, total: 0, boxes: a.boxes.length, lost: [], moved: 0, orphans: state.orphans.length };
  }
  // 고른 글자가 걸친 문단(최대 4개)과 앞뒤 한 문단씩을 담아 「더 자세히」 요청문을 복사하고, 답을 붙여 넣을 칸을 연다
  async function deepAsk(range) {
    const i = paraIndexOf(range.startContainer), j = paraIndexOf(range.endContainer);
    if (i < 0) { hidePop(); return; }
    const last = Math.min(Math.max(i, j), i + 3);
    const P = state.paras, pick = (k) => ({ p: k + 1, text: P[k].text });
    const targets = []; for (let k = i; k <= last; k++) targets.push(pick(k));
    const context = [i - 1, last + 1].filter((k) => k >= 0 && k < P.length).map(pick);
    const els = new Set(targets.map((x) => P[x.p - 1].el));
    const existing = state.boxes.filter((b) => els.has(b.el)).map((b) => ({ p: boxOrder(b) + 1, text: b.text }));
    const text = PROMPT.buildFocus({ title: document.title, targets, context, existing, template: TEMPLATES[state.tpl] });
    getSelection()?.removeAllRanges(); hidePop();
    const ok = await copyText(text);
    setMin(false);
    steps.open = true;
    setMsg(copyMsg, ok ? `p ${targets.map((x) => x.p).join(", ")} 을 더 자세히 묻는 요청문을 복사했습니다(${text.length.toLocaleString()}자). 쓰는 AI 에 붙여 넣고, 받은 답을 아래 칸에 붙여 넣어 「적용」하세요. 지금 있는 설명은 그대로 두고 더하기만 합니다.` : "복사하지 못했습니다.", !ok);
    answer.value = "";
    answer.focus();
  }

  let tab = "boxes";
  function renderResult() {
    const has = hasData();
    resultBox.hidden = !has || stepsOnly;
    if (!has) { renderMini(); return; }
    renderOrphans();
    const t = TEMPLATES[state.tpl];
    const count = (k) => state.marks.filter((m) => m.kind === k).length;
    const toggle = (key, ...label) => h("button", { "aria-pressed": String(state.show[key]),
      onclick: () => setShow(key, !state.show[key]) }, ...label);
    legend.replaceChildren(
      toggle("circle", h("span", { class: "sw sw-key" }, "가"), `${t.marks.circle} ${count("circle")}`),
      toggle("highlight", h("span", { class: "sw sw-hl" }), `${t.marks.highlight} ${count("highlight")}`),
      toggle("wave", h("span", { class: "sw sw-wave" }), `${t.marks.wave} ${count("wave")}`),
      toggle("boxes", `설명 ${state.boxes.length}`),
      ...(state.imps.length ? [toggle("imp", `중요도 ${state.imps.length}`)] : []),
      ...(INLINE_ONLY ? [] : [h("button", { title: "설명 카드를 문단 아래(본문 속)에 둘지, 옆 패널과 배지로 볼지", onclick: () => {
        state.boxMode = state.boxMode === "inline" ? "side" : "inline"; saveUi(); drawLayer(); renderResult(); tuckIfCovering();
      } }, state.boxMode === "inline" ? "설명 위치: 본문 속 ⇄" : "설명 위치: 옆 패널 ⇄")]));
    const nodes = state.concepts?.nodes || [];
    tabs.replaceChildren(
      h("button", { "aria-selected": String(tab === "boxes"), onclick: () => { tab = "boxes"; renderResult(); } }, `설명 ${state.boxes.length}`),
      h("button", { "aria-selected": String(tab === "concepts"), onclick: () => { tab = "concepts"; renderResult(); } }, `요약${nodes.length ? ` (개념 ${nodes.length})` : ""}`),
      ...(nodes.length ? [h("button", { title: "페이지를 덮는 화면에 위에서 아래로 크게 봅니다", onclick: openSummary }, "크게 보기 ⤢")] : []));
    list.replaceChildren(tab === "boxes" ? renderBoxes() : renderConcepts());
    renderMini();
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
    // 관계 이름표가 있으면 하위 개념으로 들어가는 가로선을 길게 해 그 가운데에 이름표를 얹는다
    const hasRel = c.nodes.some((n) => n.parent && relName(n));
    const INDENT = hasRel ? 52 : 22;
    const width = list.clientWidth || 300;
    const gutter = c.links.length ? clamp(Math.round(width * 0.3), 76, 150) : 0;
    const wrap = h("div", { class: "map", style: `padding-right:${gutter}px` });
    const lines = svgEl("svg", { class: "map-lines" });
    const labels = h("div");
    const topic = h("div", { class: "mnode topic" }, c.topic);
    wrap.append(lines, topic);
    const rows = [], seen = new Set();
    // 다른 개념과 위아래로도 화살표로도 이어지지 않은 개념은 「따로 있는 개념」으로 떼어 놓는다
    const linked = new Set(c.links.flatMap((l) => [l.from, l.to]));
    const alone = (n) => n.parent == null && !(kids.get(n.id) || []).length && !linked.has(n.id);
    const card = (n, depth, extra = "") => {
      const pts = (Array.isArray(n.points) ? n.points : []).filter((x) => typeof x === "string" && x.trim());
      const ptsList = h("ul", { class: "points", hidden: true }, pts.map((x) => h("li", {}, x)));
      return h("div", { class: `mnode${extra}`, "data-id": n.id, style: `margin-left:${depth * INDENT}px` },
        h("div", { class: "term", title: pts.length ? "눌러서 핵심 내용 펼치기" : "", onclick: () => (ptsList.hidden = !ptsList.hidden) },
          n.term, n.role ? h("span", { class: "role" }, n.role) : null),
        n.gloss ? h("div", { class: "gloss" }, n.gloss) : null,
        ptsList);
    };
    const walk = (parent, depth) => {
      for (const n of kids.get(parent) || []) {
        if (seen.has(n.id) || (parent == null && alone(n))) continue;
        seen.add(n.id);
        // 맨 위 개념은 주제와 선으로 잇지 않고 묶음마다 떨어뜨려 놓는다(주제와의 선은 관계를 뜻하지 않아서)
        const el = card(n, depth, parent == null ? " root" : "");
        rows.push({ id: n.id, parent, el });
        wrap.append(el);
        walk(n.id, depth + 1);
      }
    };
    walk(null, 0);
    const lonely = (kids.get(null) || []).filter(alone);
    if (lonely.length) {
      wrap.append(h("div", { class: "map-sub" }, "따로 있는 개념 — 다른 개념과 이어진 관계가 없습니다"));
      for (const n of lonely) { const el = card(n, 0, " lone"); rows.push({ id: n.id, parent: null, el }); wrap.append(el); }
    }
    wrap.append(labels);
    const draw = () => drawMap({ wrap, lines, labels, topic, rows, links: c.links, gutter, byId });
    const win = list.ownerDocument.defaultView;
    win.requestAnimationFrame(draw);
    mapObserver = new win.ResizeObserver(() => win.requestAnimationFrame(draw));
    mapObserver.observe(wrap);
    return wrap;
  }

  // 위아래 관계의 이름. AI 답의 rel(상위 개념과의 관계)을 쓰고, 없으면 역할(role)이 관계를 뜻하는 말일 때만 쓴다
  const ROLE_AS_REL = { "분류": "종류", "종류": "종류", "구성 요소": "구성 요소", "하위 개념": "하위 개념", "예시": "예", "예": "예", "단계": "단계", "하위 단계": "단계" };
  const relName = (n) => (tidy(n?.rel) || ROLE_AS_REL[tidy(n?.role)] || "").slice(0, 8);
  function drawMap({ wrap, lines, labels, topic, rows, links, gutter, byId }) {
    if (!wrap.isConnected) return;
    lines.replaceChildren(); labels.replaceChildren();
    const base = wrap.getBoundingClientRect();
    const box = (el) => { const r = el.getBoundingClientRect(); return { l: r.left - base.left, r: r.right - base.left, t: r.top - base.top, b: r.bottom - base.top, m: (r.top + r.bottom) / 2 - base.top }; };
    const pos = new Map(rows.map((x) => [x.id, box(x.el)]));
    const path = (d, cls) => { const p = svgEl("path", { d, class: cls }); lines.append(p); return p; };
    const defs = svgEl("defs");
    const marker = svgEl("marker", { id: "nl-arrow", viewBox: "0 0 8 8", refX: "7", refY: "4", markerWidth: "7", markerHeight: "7", orient: "auto-start-reverse" });
    marker.append(svgEl("path", { d: "M0,0 L8,4 L0,8 z", class: "arrow" }));
    defs.append(marker); lines.append(defs);
    // 위아래 관계: 상위 개념 왼쪽 아래에서 내려와 하위 개념 왼쪽으로 꺾어 들어간다
    for (const x of rows) {
      if (x.parent == null) continue;
      const pb = pos.get(x.parent), cb = pos.get(x.id);
      if (!pb || !cb) continue;
      const vx = pb.l + 10;
      path(`M${vx} ${pb.b} V${cb.m - 6} Q${vx} ${cb.m} ${vx + 6} ${cb.m} H${cb.l}`, "tree");
    }
    // 관계 이름표: 상위 개념의 세로선에서 하위 개념 카드로 들어가는 가로선 가운데
    for (const x of rows) {
      if (x.parent == null) continue;
      const pb = pos.get(x.parent), cb = pos.get(x.id), rel = relName(byId.get(x.id));
      if (!pb || !cb || !rel) continue;
      const vx = pb.l + 10;
      // 가로선에 들어가면 가운데, 넘치면 카드 바로 앞에 맞춰 세로선 쪽으로 늘린다(카드를 덮지 않게)
      const lab = h("div", { class: "tree-label", style: `top:${cb.m}px` }, rel);
      labels.append(lab);
      const w = lab.offsetWidth, l = vx + 6, r = cb.l - 3;
      lab.style.left = `${w <= r - l ? (l + r) / 2 : r - w / 2}px`;
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

  // ── 요약 크게 보기: 페이지를 덮는 화면에 위에서 아래로 내려가는 개념 구조도 ──
  // 위아래 관계는 꺾인 실선(갈라지는 선에 관계 이름), 위아래가 아닌 관계는 점선 화살표 + 이름표.
  // 개념을 누르면 오른쪽에 핵심 내용이 나오고, 「원문에서 보기」로 그 개념을 설명한 구절로 간다
  let sheet = null;
  function closeSummary() { sheet?.remove(); sheet = null; }
  function openSummary() {
    const c = state.concepts;
    if (!c?.nodes?.length) return;
    closeSummary();
    // 상세 칸은 개념을 눌렀을 때만 오른쪽 아래에 뜬다(늘 붙어 있으면 구조도를 가렸다)
    const detail = h("div", { class: "sheet-detail", hidden: true });
    const body = h("div", { class: "sheet-body" });
    const pointsBtn = h("button", { class: "sheet-btn", title: "개념 상자마다 점(•)으로 적힌 핵심 내용을 모두 펼치고 접습니다" });
    // 보기(위치·배율): 처음 열 때 한 번만 화면 폭에 맞추고, 그 뒤로는 사용자가 정한 대로 둔다
    // (핵심 내용을 펼치고 접을 때마다 다시 맞추면 배율이 바뀌어 커졌다 작아졌다 했다)
    // 휠 = 커서 자리를 중심으로 확대·축소, 오른쪽 버튼을 누른 채 끌기 = 이동
    let view = null;
    const zoomLabel = h("button", { class: "sheet-btn zoom-val", title: "100% 로" });
    const apply = () => {
      const tree = body.querySelector(".td-tree");
      if (tree) tree.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.z})`;
      zoomLabel.textContent = `${Math.round(view.z * 100)}%`;
    };
    const fit = () => {
      const tree = body.querySelector(".td-tree");
      const w = tree.offsetWidth, hgt = tree.offsetHeight, bw = body.clientWidth, bh = body.clientHeight;
      const z = clamp(Math.min(1, (bw - 64) / w), 0.5, 1);
      view = { z, x: Math.max(32, (bw - w * z) / 2), y: w * z <= bw && hgt * z < bh - 48 ? Math.max(24, (bh - hgt * z) / 2) : 24 };
      apply();
    };
    // 화면의 (cx, cy) 자리를 그대로 둔 채 배율만 바꾼다
    const zoomAt = (z2, cx, cy) => {
      z2 = clamp(z2, 0.3, 2.5);
      view.x = cx - (cx - view.x) * (z2 / view.z);
      view.y = cy - (cy - view.y) * (z2 / view.z);
      view.z = z2;
      apply();
    };
    const zoomCenter = (k) => zoomAt(view.z * k, body.clientWidth / 2, body.clientHeight / 2);
    zoomLabel.onclick = () => zoomAt(1, body.clientWidth / 2, body.clientHeight / 2);
    // ── 고르기와 오른쪽 아래 칸: 수정 모드면 이름·풀이·관계·핵심 내용을 그 자리에서 고친다 ──
    let selId = null, redrawT = 0;
    const ptsOf = (n) => (Array.isArray(n.points) ? n.points : []).filter((x) => typeof x === "string" && x.trim());
    const conceptsChanged = (now = false) => {
      c.mine = true; // 고친 요약은 AI 답을 새로 붙일 때 바꿀지 묻는다
      save(); renderResult();
      clearTimeout(redrawT);
      if (now) draw(); else redrawT = setTimeout(draw, 250);
    };
    const closeBtn = () => h("button", { class: "detail-close", title: "닫기", onclick: () => select(null) }, "✕");
    const viewDetail = (n) => {
      const pts = ptsOf(n), up = n.parent && c.nodes.find((x) => x.id === n.parent);
      return [
        closeBtn(),
        h("h3", {}, n.term),
        h("div", { class: "role" }, [n.role, up ? `${up.term} 의 ${relName(n) || "하위 개념"}` : null].filter(Boolean).join(" · ")),
        n.gloss ? h("div", { class: "gloss" }, n.gloss) : null,
        pts.length ? h("ul", {}, pts.map((x) => h("li", {}, x))) : null,
        n.def?.quote ? h("button", { class: "go", onclick: () => { closeSummary(); showQuote(n.def); } }, "원문에서 보기 ↗") : null,
      ].filter(Boolean);
    };
    const field = (name, value, ph, onText, multi = false) => h("div", { class: "ed-row" }, h("span", {}, name),
      h("div", { class: `ed${multi ? " multi" : ""}`, contenteditable: "plaintext-only", "data-ph": ph,
        oninput: (e) => { onText(multi ? e.target.innerText : tidy(e.target.innerText)); conceptsChanged(); } }, value || ""));
    const editDetail = (n) => {
      const up = n.parent && c.nodes.find((x) => x.id === n.parent);
      return [
        closeBtn(),
        h("div", { class: "role" }, up ? `「${up.term}」 아래에 있는 개념` : "맨 위 개념", " · 상자를 끌어 다른 개념 위에 놓으면 그 밑으로 옮겨집니다"),
        field("이름", n.term, "개념 이름", (v) => { n.term = v; }),
        field("한 줄 풀이", n.gloss, "처음 보는 사람을 위한 한 줄 풀이", (v) => { n.gloss = v; }),
        up ? field("위 개념과의 관계 (갈라지는 선에 붙는 이름)", n.rel, "예: 종류, 구성 요소, 단계", (v) => { n.rel = v; }) : null,
        field("핵심 내용 (한 줄에 하나)", ptsOf(n).join("\n"), "개념을 누르면 펼쳐지는 핵심 내용", (v) => { n.points = v.split("\n").map(tidy).filter(Boolean); }, true),
        h("div", { class: "ed-acts" },
          h("button", { class: "sheet-btn", onclick: () => addChild(n) }, "+ 하위 개념"),
          n.def?.quote ? h("button", { class: "sheet-btn", onclick: () => { closeSummary(); showQuote(n.def); } }, "원문에서 보기 ↗") : null,
          h("button", { class: "sheet-btn danger", onclick: () => removeNode(n) }, "이 개념 지우기")),
      ].filter(Boolean);
    };
    const select = (n) => {
      selId = n ? n.id : null;
      for (const e of body.querySelectorAll(".td-node")) e.classList.toggle("sel", e.dataset.id === selId);
      if (!n) { detail.hidden = true; return; }
      detail.hidden = false;
      detail.replaceChildren(...(state.editing ? editDetail(n) : viewDetail(n)));
    };
    const addChild = (n) => {
      const k = { id: uid(), term: "새 개념", parent: n.id, rel: "", gloss: "", points: [] };
      c.nodes.push(k);
      conceptsChanged(true);
      select(k);
      const ed = detail.querySelector(".ed");
      ed?.focus();
      try { const r = document.createRange(); r.selectNodeContents(ed); getSelection().removeAllRanges(); getSelection().addRange(r); } catch {}
    };
    const removeNode = (n) => {
      if (!confirm(`「${n.term || "이름 없는 개념"}」 개념을 지울까요? 하위 개념은 한 칸 위로 올라갑니다.`)) return;
      for (const k of c.nodes) if (k.parent === n.id) k.parent = n.parent ?? null;
      c.nodes = c.nodes.filter((x) => x !== n);
      c.links = c.links.filter((l) => l.from !== n.id && l.to !== n.id);
      select(null);
      if (!c.nodes.length) { state.concepts = null; closeSummary(); afterChange(); return; }
      conceptsChanged(true);
    };
    // ── 상자 끌어 옮기기(수정 모드): 마우스는 그냥 끌고, 손가락·펜은 길게 누른 다음 끈다(짧게 끌면 지금처럼 화면 이동) ──
    let nodeDrag = null;
    const descOf = (id) => {
      const out = new Set();
      const walk = (p) => { for (const k of c.nodes) if (k.parent === p && !out.has(k.id)) { out.add(k.id); walk(k.id); } };
      walk(id);
      return out;
    };
    const inside = (r, x, y) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    const overEmpty = (x, y) => x != null && inside(body.getBoundingClientRect(), x, y) && (detail.hidden || !inside(detail.getBoundingClientRect(), x, y));
    const beginNode = (d) => {
      d.on = true;
      clearTimeout(d.timer);
      d.desc = descOf(d.n.id);
      d.el.classList.add("dragging");
      try { body.setPointerCapture(d.id); } catch {}
      if (touches.delete(d.id)) { gesture = null; body.classList.remove("panning"); } // 손가락 끌기는 화면 이동 대신 상자 옮기기로
      hint.textContent = "개념 위에 놓으면 그 밑으로 들어갑니다";
    };
    const grab = (e, n, el) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const d = { n, el, id: e.pointerId, sx: e.clientX, sy: e.clientY, on: false, target: null, touch: e.pointerType !== "mouse", timer: 0 };
      nodeDrag = d;
      if (d.touch) d.timer = setTimeout(() => { if (nodeDrag === d && !d.on) beginNode(d); }, 450);
    };
    // 끄는 중이면 true(화면 이동을 건너뛴다)
    const moveNode = (e) => {
      const d = nodeDrag;
      if (!d.on) {
        if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 6) return !d.touch;
        if (d.touch) { clearTimeout(d.timer); nodeDrag = null; return false; } // 길게 누르기 전에 움직였으면 화면 이동
        beginNode(d);
      }
      d.x = e.clientX; d.y = e.clientY;
      d.el.style.transform = `translate(${(d.x - d.sx) / view.z}px, ${(d.y - d.sy) / view.z}px)`;
      let t = null;
      for (const el of body.querySelectorAll(".td-node")) {
        if (el === d.el || d.desc.has(el.dataset.id)) continue;
        if (inside(el.getBoundingClientRect(), d.x, d.y)) { t = el; break; }
      }
      for (const el of body.querySelectorAll(".td-node.drop")) if (el !== t) el.classList.remove("drop");
      t?.classList.add("drop");
      d.target = t?.dataset.id || null;
      const tn = d.target && c.nodes.find((x) => x.id === d.target);
      hint.textContent = tn ? `「${tn.term}」 밑으로 옮깁니다`
        : d.n.parent != null && overEmpty(d.x, d.y) ? "여기에 놓으면 맨 위 개념이 됩니다" : "개념 위에 놓으면 그 밑으로 들어갑니다";
      return true;
    };
    const dropNode = () => {
      const d = nodeDrag;
      nodeDrag = null;
      clearTimeout(d.timer);
      if (!d.on) return;
      dragEndAt = Date.now();
      syncEditBtn();
      const to = d.target ? d.target : overEmpty(d.x, d.y) ? null : undefined; // undefined = 놓을 데가 아님(그대로)
      if (to !== undefined && to !== (d.n.parent ?? null)) { d.n.parent = to; conceptsChanged(true); }
      else draw();
    };
    const hint = h("span", { class: "muted hint" });
    const editToggle = h("button", { class: "sheet-btn", onclick: () => { setEditing(!state.editing); syncEditBtn(); select(null); draw(); } });
    const syncEditBtn = () => {
      editToggle.textContent = state.editing ? "✎ 수정 가능" : "🔒 수정 불가";
      editToggle.className = `sheet-btn${state.editing ? " sw-on" : ""}`;
      editToggle.title = state.editing ? "누르면 고칠 수 없게 합니다" : "누르면 개념 상자를 끌어 옮기고, 누른 개념의 이름·풀이·핵심 내용을 고칠 수 있습니다";
      hint.textContent = state.editing ? "상자를 끌어 다른 개념 위에 놓기 · 눌러서 오른쪽 아래에서 고치기 · 빈 곳 끌기로 이동"
        : "휠·두 손가락으로 확대·축소 · 끌어서 이동 · Esc 로 닫기";
    };
    const draw = () => {
      pointsBtn.textContent = ui.showPoints ? "핵심 내용 접기" : "핵심 내용 펼치기";
      pointsBtn.setAttribute("aria-pressed", String(!!ui.showPoints));
      const tree = h("div", { class: "td-tree" });
      body.replaceChildren(tree);
      layoutTopDown(tree, c, { sel: selId, select, grab });
      if (view) apply(); else fit();
    };
    pointsBtn.onclick = () => { ui.showPoints = !ui.showPoints; store.set(UI_KEY, { ...(store.get(UI_KEY) || {}), showPoints: ui.showPoints }); select(null); draw(); };
    body.addEventListener("wheel", (e) => {
      e.preventDefault();
      const r = body.getBoundingClientRect();
      zoomAt(view.z * Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    body.addEventListener("contextmenu", (e) => e.preventDefault());
    // 끌어 옮기기·두 손가락 확대. 마우스는 오른쪽 버튼(어디서나) 또는 왼쪽 버튼(빈 곳), 손가락·펜은 어디서나.
    // 거의 움직이지 않고 뗀 손가락은 「누르기」 로 남겨 개념 상자를 열 수 있게 한다
    const touches = new Map();
    let gesture = null; // { kind: "pan"|"pinch", ... }
    const local = (e) => { const r = body.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const startPinch = () => {
      const [a, b] = [...touches.values()];
      gesture = { kind: "pinch", d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: view.z, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, vx: view.x, vy: view.y };
    };
    body.addEventListener("pointerdown", (e) => {
      const mouse = e.pointerType === "mouse";
      if (mouse && !(e.button === 2 || (e.button === 0 && !e.target.closest?.(".td-node, .td-lab")))) return;
      if (mouse && e.button === 2) e.preventDefault();
      touches.set(e.pointerId, local(e));
      // 붙잡기(pointer capture)는 실제로 끌기 시작한 다음에 한다. 대자마자 붙잡으면 개념 상자를 톡 눌러도 상자에 전달되지 않는다
      if (touches.size === 2) { for (const id of touches.keys()) try { body.setPointerCapture(id); } catch {} startPinch(); }
      else if (touches.size === 1) gesture = { kind: "pan", sx: local(e).x, sy: local(e).y, vx: view.x, vy: view.y, moved: false };
    });
    body.addEventListener("pointermove", (e) => {
      if (nodeDrag && nodeDrag.id === e.pointerId && moveNode(e)) return;
      if (!touches.has(e.pointerId) || !gesture) return;
      touches.set(e.pointerId, local(e));
      if (gesture.kind === "pinch" && touches.size >= 2) {
        const [a, b] = [...touches.values()];
        const z2 = clamp(gesture.z0 * (Math.hypot(a.x - b.x, a.y - b.y) / gesture.d0), 0.3, 2.5);
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        // 처음 두 손가락 가운데 있던 지점이 지금 가운데로 오게
        view.x = mx - (gesture.mx - gesture.vx) * (z2 / gesture.z0);
        view.y = my - (gesture.my - gesture.vy) * (z2 / gesture.z0);
        view.z = z2;
        apply();
      } else if (gesture.kind === "pan") {
        const p = touches.get(e.pointerId), dx = p.x - gesture.sx, dy = p.y - gesture.sy;
        if (!gesture.moved && Math.hypot(dx, dy) < 5) return;
        if (!gesture.moved) try { body.setPointerCapture(e.pointerId); } catch {}
        gesture.moved = true;
        body.classList.add("panning");
        view.x = gesture.vx + dx; view.y = gesture.vy + dy;
        apply();
      }
    });
    const lift = (e) => {
      if (nodeDrag && nodeDrag.id === e.pointerId) dropNode();
      if (!touches.delete(e.pointerId)) return;
      if (touches.size === 1) { const [p] = [...touches.values()]; gesture = { kind: "pan", sx: p.x, sy: p.y, vx: view.x, vy: view.y, moved: true }; }
      else if (touches.size === 0) { gesture = null; body.classList.remove("panning"); }
    };
    body.addEventListener("pointerup", lift);
    body.addEventListener("pointercancel", lift);
    sheet = h("div", { class: "sheet", role: "dialog", "aria-label": "요약" },
      h("div", { class: "sheet-head" }, h("b", {}, "요약"), h("span", { class: "sheet-topic" }, c.topic), h("span", { class: "grow" }),
        pointsBtn,
        h("span", { class: "zoom" },
          h("button", { class: "sheet-btn", title: "축소", onclick: () => zoomCenter(1 / 1.2) }, "－"), zoomLabel,
          h("button", { class: "sheet-btn", title: "확대", onclick: () => zoomCenter(1.2) }, "＋"),
          h("button", { class: "sheet-btn", title: "구조도 전체가 화면에 들어오게", onclick: fit }, "화면 맞춤")),
        editToggle, hint, h("button", { class: "sheet-close", title: "닫기", onclick: closeSummary }, "✕")),
      h("div", { class: "sheet-main" }, body, detail));
    shadow.append(sheet);
    syncEditBtn();
    draw();
  }
  function layoutTopDown(tree, c, ctx) {
    const NW = 220, HG = 24, VG = 86, SUB = 30;
    const byId = new Map(c.nodes.map((n) => [n.id, n]));
    const kids = new Map();
    for (const n of c.nodes) { if (!kids.has(n.parent)) kids.set(n.parent, []); kids.get(n.parent).push(n); }
    const linked = new Set(c.links.flatMap((l) => [l.from, l.to]));
    const alone = (n) => n.parent == null && !(kids.get(n.id) || []).length && !linked.has(n.id);
    const roots = (kids.get(null) || []).filter((n) => !alone(n)), lonely = (kids.get(null) || []).filter(alone);
    const els = new Map();
    const pts = (n) => (Array.isArray(n.points) ? n.points : []).filter((x) => typeof x === "string" && x.trim());
    const card = (n, extra = "") => {
      const e = h("div", { class: `td-node${extra}${ctx.sel === n.id ? " sel" : ""}${state.editing ? " editable" : ""}`, "data-id": n.id, style: `width:${NW}px`,
        onclick: () => { if (Date.now() - dragEndAt > 400) ctx.select(n); },
        onpointerdown: state.editing ? (ev) => ctx.grab(ev, n, e) : null },
        h("div", { class: "td-term" }, n.term || "(이름 없음)"), n.gloss ? h("div", { class: "td-gloss" }, n.gloss) : null,
        ui.showPoints && pts(n).length ? h("ul", { class: "td-points" }, pts(n).map((x) => h("li", {}, x))) : null);
      els.set(n.id, e); tree.append(e);
      return e;
    };
    // 깊이별 높이를 재고, 하위 개념 폭을 더해 자리를 잡는다(하위 개념은 상위 개념 아래 가운데에 모인다)
    const depthOf = new Map(), seen = new Set();
    const walk = (n, d) => { if (seen.has(n.id)) return; seen.add(n.id); depthOf.set(n.id, d); card(n, d === 0 ? " root" : ""); for (const k of kids.get(n.id) || []) walk(k, d + 1); };
    for (const r of roots) walk(r, 0);
    const rowH = [];
    for (const [id, d] of depthOf) rowH[d] = Math.max(rowH[d] || 0, els.get(id).offsetHeight);
    const rowY = []; let y = 0;
    for (let d = 0; d < rowH.length; d++) { rowY[d] = y; y += rowH[d] + VG; }
    const widthOf = new Map();
    const wOf = (n) => {
      const ks = (kids.get(n.id) || []).filter((k) => depthOf.get(k.id) === depthOf.get(n.id) + 1);
      const w = Math.max(NW, ks.reduce((a, k) => a + wOf(k), 0) + HG * Math.max(0, ks.length - 1));
      widthOf.set(n.id, w); return w;
    };
    const pos = new Map();
    const place = (n, left) => {
      const d = depthOf.get(n.id), w = widthOf.get(n.id);
      const x = left + (w - NW) / 2;
      pos.set(n.id, { x, y: rowY[d], w: NW, h: els.get(n.id).offsetHeight });
      const ks = (kids.get(n.id) || []).filter((k) => depthOf.get(k.id) === d + 1);
      const total = ks.reduce((a, k) => a + widthOf.get(k.id), 0) + HG * Math.max(0, ks.length - 1);
      let l = left + (w - total) / 2;
      for (const k of ks) { place(k, l); l += widthOf.get(k.id) + HG; }
    };
    let left = 0;
    for (const r of roots) { wOf(r); place(r, left); left += widthOf.get(r.id) + HG * 2; }
    let width = Math.max(NW, left - HG * 2), height = y - VG;
    // 다른 개념과 이어지지 않은 개념은 아래에 한 줄로
    if (lonely.length) {
      const top = (roots.length ? height : 0) + (roots.length ? SUB + 16 : 0);
      tree.append(h("div", { class: "td-sub", style: `top:${top - SUB + 6}px` }, "따로 있는 개념 — 다른 개념과 이어진 관계가 없습니다"));
      let x = 0, rowTop = top, rowMax = 0;
      for (const n of lonely) {
        const e = card(n, " lone");
        if (x && x + NW > Math.max(width, 3 * (NW + HG))) { x = 0; rowTop += rowMax + HG; rowMax = 0; }
        pos.set(n.id, { x, y: rowTop, w: NW, h: e.offsetHeight });
        rowMax = Math.max(rowMax, e.offsetHeight); x += NW + HG;
      }
      width = Math.max(width, Math.min(lonely.length, 3) * (NW + HG) - HG);
      height = rowTop + rowMax;
    }
    for (const [id, p] of pos) Object.assign(els.get(id).style, { left: `${p.x}px`, top: `${p.y}px` });
    const svg = svgEl("svg", { class: "td-lines", width: String(width), height: String(height) });
    const defs = svgEl("defs");
    const marker = svgEl("marker", { id: "nl-td-arrow", viewBox: "0 0 8 8", refX: "7", refY: "4", markerWidth: "7", markerHeight: "7", orient: "auto-start-reverse" });
    marker.append(svgEl("path", { d: "M0,0 L8,4 L0,8 z", class: "td-arrow" }));
    defs.append(marker); svg.append(defs);
    tree.prepend(svg);
    // 위아래 관계: 상위 개념 아래 가운데에서 내려와 가로로 갈라진 뒤 하위 개념 위 가운데로 들어간다
    for (const [id, d] of depthOf) {
      const n = byId.get(id);
      if (!n.parent || !pos.has(n.parent) || depthOf.get(n.parent) !== d - 1) continue;
      const a = pos.get(n.parent), b = pos.get(id);
      const ax = a.x + a.w / 2, ay = a.y + a.h, bx = b.x + b.w / 2, by = b.y, my = by - VG / 2;
      svg.append(svgEl("path", { d: `M${ax} ${ay} V${my} H${bx} V${by}`, class: "td-edge" }));
      const rel = relName(n);
      if (rel) tree.append(h("div", { class: "td-rel", style: `left:${bx}px;top:${by - VG / 4}px` }, rel));
    }
    // 위아래가 아닌 관계: 점선 화살표 + 이름표. 상자를 가리지 않게
    //  - 같은 줄: 두 상자 아래 가운데에서 내려와 줄 아래 여백(갈라지는 가로선보다 위)으로 돌아간다. 이름표는 그 가장 낮은 곳
    //  - 다른 줄: 위쪽 상자 아래 가운데에서 아래쪽 상자 위 가운데로. 이름표는 위쪽 상자 바로 아래
    const busy = [];
    const labelAt = (x, y, text) => {
      // 이름표끼리 겹치면 조금씩 내린다
      let yy = y;
      for (const q of busy) if (Math.abs(q.x - x) < 70 && Math.abs(q.y - yy) < 16) yy = q.y + 16;
      busy.push({ x, y: yy });
      tree.append(h("div", { class: "td-lab", style: `left:${x}px;top:${yy}px` }, text));
    };
    let lane = 0;
    for (const l of c.links) {
      const a = pos.get(l.from), b = pos.get(l.to);
      if (!a || !b) continue;
      const ax = a.x + a.w / 2, bx = b.x + b.w / 2;
      let d, lx, ly;
      if (Math.abs(a.y - b.y) < 4) {
        const base = Math.max(a.y + a.h, b.y + b.h), dip = base + 16 + (lane++ % 3) * 7;
        d = `M${ax} ${a.y + a.h} C${ax} ${dip} ${bx} ${dip} ${bx} ${b.y + b.h + 2}`;
        lx = (ax + bx) / 2; ly = dip - 2;
        height = Math.max(height, dip + 12);
      } else {
        const [u, v] = a.y < b.y ? [a, b] : [b, a];
        const ux = u.x + u.w / 2, vx = v.x + v.w / 2, uy = u.y + u.h, vy = v.y;
        const fromU = u === a;
        d = fromU ? `M${ux} ${uy} C${ux} ${uy + 40} ${vx} ${vy - 40} ${vx} ${vy - 2}` : `M${vx} ${vy} C${vx} ${vy - 40} ${ux} ${uy + 40} ${ux} ${uy + 2}`;
        lx = ux + (vx - ux) * 0.25; ly = uy + 18;
      }
      const p = svgEl("path", { d, class: "td-link" });
      p.setAttribute("marker-end", "url(#nl-td-arrow)");
      svg.append(p);
      labelAt(lx, ly, l.label);
    }
    svg.setAttribute("height", String(height));

    Object.assign(tree.style, { width: `${width}px`, height: `${height}px` });
    svg.setAttribute("width", String(width));
  }
  // 개념을 설명한 원문 구절로 가서 잠깐 칠한다. 문단 번호 근처부터 찾는다
  function showQuote(def) {
    const P = state.paras, n = P.length;
    if (!n) return;
    const hint = clamp((Number(def.p) || 1) - 1, 0, n - 1);
    const order = [hint];
    for (let d = 1; d < n; d++) { if (hint - d >= 0) order.push(hint - d); if (hint + d < n) order.push(hint + d); }
    for (const i of order) {
      const hit = locate(P[i].el, def.quote, null, false);
      if (!hit) continue;
      (hit.range.startContainer.parentElement || P[i].el).scrollIntoView({ behavior: "smooth", block: "center" });
      if (window.CSS?.highlights) {
        CSS.highlights.set("nl-ov-flash", new Highlight(hit.range));
        clearTimeout(flashElement.t);
        flashElement.t = setTimeout(() => CSS.highlights.delete("nl-ov-flash"), 1800);
      }
      return;
    }
    flashElement(P[hint].el);
  }

  function openCard(id) {
    if (COMPACT) {
      const el = inlineEls.get(id);
      if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.focus?.(); return el; }
      if (state.boxMode === "inline") return null;
    }
    if (state.popup) state.popup.focus(); else setMin(false);
    if (tab !== "boxes") { tab = "boxes"; renderResult(); }
    const card = list.querySelector(`[data-id="${id}"]`);
    if (!card) return null;
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.classList.remove("flash"); void card.offsetWidth; card.classList.add("flash");
    return card;
  }

  // ── 중요도 음영: AI(또는 내가) 문단 묶음마다 매긴 세 단계. core 는 진한 음영, some 은 옅은 음영, rare 는 흐린 막 ──
  // 왼쪽 막대 옆 꼬리표를 누르면 그 등급인 이유가 나오고, 수정 모드면 등급을 바꾸거나 지운다
  const LEVEL_NAMES = { core: "핵심", some: "가끔", rare: "덜 중요" };
  const levelNames = () => ({ ...LEVEL_NAMES, ...(TEMPLATES[state.tpl].levels || {}) });
  // [밝은 바탕, 어두운 바탕]
  const IMP_COLORS = {
    core: [{ tint: "rgba(245,158,11,.13)", bar: "#f59e0b", chip: "#fef3c7", ink: "#92400e" }, { tint: "rgba(245,158,11,.15)", bar: "#f59e0b", chip: "#3b2f12", ink: "#fbbf24" }],
    some: [{ tint: "rgba(100,116,139,.08)", bar: "#94a3b8", chip: "#f1f5f9", ink: "#475569" }, { tint: "rgba(148,163,184,.08)", bar: "#64748b", chip: "#2a2f37", ink: "#cbd5e1" }],
    rare: [{ tint: "rgba(255,255,255,.55)", bar: "#d1d5db", chip: "#f3f4f6", ink: "#6b7280" }, { tint: "rgba(20,22,26,.5)", bar: "#4b5563", chip: "#23272e", ink: "#9ca3af" }],
  };
  // 문단 묶음에서 [i, j] 를 도려낸다(걸친 묶음은 앞뒤 남는 부분만 남긴다)
  function carve(list, i, j) {
    return list.flatMap((x) => (x.j < i || x.i > j ? [x]
      : [...(x.i < i ? [{ ...x, j: i - 1 }] : []), ...(x.j > j ? [{ ...x, i: j + 1 }] : [])]));
  }
  // 문단 상자: 웹은 문단 요소 상자, PDF 는 글자 줄을 합친 상자(문단 요소에 크기가 없다)
  function impBox(el) {
    if (!PDF) { const r = el.getBoundingClientRect(); return r.height ? { l: r.left, r: r.right, t: r.top, b: r.bottom } : null; }
    const rg = document.createRange(); rg.selectNodeContents(el);
    const ls = lineRects(rg);
    return ls.length ? { l: Math.min(...ls.map((x) => x.left)), r: Math.max(...ls.map((x) => x.right)), t: ls[0].top, b: ls[ls.length - 1].bottom } : null;
  }
  // 문단의 첫 줄 상자(화면 좌표). 「실무 핵심」 은 묶음 전체가 아니라 첫 줄(그 묶음의 주제)만 칠한다
  function firstLineBox(el) {
    const rg = document.createRange(); rg.selectNodeContents(el);
    const l = lineRects(rg)[0];
    return l ? { l: l.left, r: l.right, t: l.top, b: l.bottom } : null;
  }
  // 이유 한 줄의 폭(.imp-why 글꼴 기준)을 재서 왼쪽 여백에 들어가는지 본다
  let measureCtx = null;
  function textWidth(t) {
    measureCtx ??= document.createElement("canvas").getContext("2d");
    measureCtx.font = '400 11px "Pretendard Variable", "Pretendard", "Malgun Gothic", sans-serif';
    return measureCtx.measureText(t).width;
  }
  function drawImp() {
    if (!state.show.imp || !state.imps.length || state.focus) { if (impSig) { impLayer.replaceChildren(); impSig = ""; } return; }
    const sx = scrollX, sy = scrollY, dark = host.getAttribute("data-theme") === "dark", names = levelNames();
    const groups = [];
    for (const x of state.imps) {
      const boxes = [];
      for (let k = x.i; k <= x.j && k < state.paras.length; k++) { const b = impBox(state.paras[k].el); if (b) boxes.push({ l: b.l + sx, r: b.r + sx, t: b.t + sy, b: b.b + sy }); }
      if (boxes.length) groups.push({ x, boxes });
    }
    // 문서 좌표로 그리므로 창을 굴려도 그대로다. 자리가 같으면 다시 만들지 않는다
    const sig = JSON.stringify([dark, state.tpl, groups.map((g) => [g.x.level, g.x.why, g.boxes.map((b) => [b.l, b.r, b.t, b.b].map(Math.round))])]);
    if (sig === impSig) return;
    impSig = sig;
    const out = [];
    for (const { x, boxes } of groups) {
      let c = IMP_COLORS[x.level][dark ? 1 : 0];
      // 흐린 막은 웹페이지면 그 사이트 바탕색으로 덮는다(어두운 사이트에서 진한 상자처럼 보이지 않게)
      if (x.level === "rare" && !PDF) c = { ...c, tint: `rgba(${bgOf(state.paras[x.i].el).join(",")},.55)` };
      const L = Math.min(...boxes.map((b) => b.l)), R = Math.max(...boxes.map((b) => b.r));
      const T = Math.min(...boxes.map((b) => b.t)), B = Math.max(...boxes.map((b) => b.b));
      // 「실무 핵심」 은 묶음의 첫 줄(주제)만 칠하고, 묶음 범위는 왼쪽 세로 줄로만 보인다. 나머지 등급은 묶음 전체에 옅게 깐다
      let tints = boxes;
      if (x.level === "core") {
        const f = firstLineBox(state.paras[x.i].el);
        tints = f ? [{ l: f.l + sx, r: f.r + sx, t: f.t + sy, b: f.b + sy }] : [];
      }
      for (const b of tints) out.push(h("div", { class: "imp-tint", style: `left:${b.l - 6}px;top:${b.t - 3}px;width:${b.r - b.l + 12}px;height:${b.b - b.t + 6}px;background:${c.tint}` }));
      out.push(h("div", { class: "imp-bar", style: `left:${L - 14}px;top:${T - 3}px;height:${B - T + 6}px;background:${c.bar}` }));
      // 꼬리표는 왼쪽 여백에. 여백이 좁으면(휴대폰 등) 오른쪽 위에
      const roomLeft = L - sx > 96;
      out.push(h("div", { class: `imp-chip${roomLeft ? " left" : ""}`, title: x.why || names[x.level],
        style: `left:${roomLeft ? L - 20 : R - 6}px;top:${T - (roomLeft ? 1 : 21)}px;background:${c.chip};color:${c.ink}${roomLeft ? "" : ";transform:translateX(-100%)"}`,
        onclick: (e) => { e.stopPropagation(); showImpTools(x, e.clientX, e.clientY); } }, names[x.level]));
      // 이유는 늘 꼬리표 바로 아래, 꼬리표 오른쪽 끝에 맞춰 둔다. 왼쪽 여백에 한 줄로 들어가면 한 줄로,
      // 여백이 모자라면 여백 폭 안에서 두 줄까지만 접는다(AI 에는 이유를 15자 안팎으로 쓰게 해 대개 한 줄이다)
      if (x.why && roomLeft) {
        const room = L - sx - 32;
        const fits = textWidth(x.why) + 4 <= room;
        out.push(h("div", { class: `imp-why${fits ? "" : " wrap"}`, title: x.why,
          style: `left:${L - 20}px;top:${T + 19}px;color:${c.ink}${fits ? "" : `;width:${Math.max(60, room)}px`}`,
          onclick: (e) => { e.stopPropagation(); showImpTools(x, e.clientX, e.clientY); } }, x.why));
      }
    }
    impLayer.replaceChildren(...out);
  }
  function showImpTools(x, cx, cy) {
    const names = levelNames();
    if (!state.editing) { showPop(cx, cy + 12, [h("span", { class: "why" }, `${names[x.level]} — ${x.why || "이유가 적혀 있지 않습니다"}`)]); return; }
    showPop(cx, cy + 12, [
      ...(x.why ? [h("span", { class: "why" }, x.why), h("span", { class: "sep" })] : []),
      ...LEVELS.map((k) => h("button", { "aria-pressed": String(x.level === k), onclick: () => { x.level = k; x.mine = true; hidePop(); afterChange(); } }, names[k])),
      h("span", { class: "sep" }),
      h("button", { onclick: () => { state.imps = state.imps.filter((y) => y !== x); hidePop(); afterChange(); } }, "음영 지우기"),
    ]);
  }
  // 수정 모드에서 글자를 고른 다음 「▤ 중요도」: 고른 글자가 걸친 문단들에 등급을 단다(겹치던 음영은 그 범위만 바뀐다)
  function pickLevel(range) {
    const i = paraIndexOf(range.startContainer), j = Math.max(i, paraIndexOf(range.endContainer));
    if (i < 0) { hidePop(); return; }
    const r = range.getBoundingClientRect(), names = levelNames();
    const done = (list) => { state.imps = list.sort((p, q) => p.i - q.i); getSelection()?.removeAllRanges(); hidePop(); afterChange(); };
    showPop(r.left + r.width / 2, r.bottom + 6, [
      ...LEVELS.map((k) => h("button", { onclick: () => done([...carve(state.imps, i, j), { i, j, level: k, why: "", mine: true }]) }, names[k])),
      h("span", { class: "sep" }),
      h("button", { onclick: () => done(carve(state.imps, i, j)) }, "음영 지우기"),
    ]);
  }

  // ── 설명 옮기기: 수정 모드에서 카드 왼쪽 손잡이(⋮⋮)를 끌어 다른 문단 아래·다른 설명 앞뒤로 옮긴다 ──
  // 놓을 자리는 파란 줄로 보인다. 화면 위아래 끝으로 끌면 그쪽으로 굴러간다. Esc 로 그만둔다
  function scrollerOf(el) {
    for (let n = el?.parentElement; n && n !== document.body; n = n.parentElement) {
      const st = getComputedStyle(n);
      if (/(auto|scroll)/.test(st.overflowY) && n.scrollHeight > n.clientHeight + 1) return n;
    }
    return document.scrollingElement || document.documentElement;
  }
  function startBoxDrag(e, b, card) {
    if (e.button > 0 || boxDrag) return;
    e.preventDefault(); e.stopPropagation();
    hidePop(); hideKnobs();
    boxDrag = { b, card, x: e.clientX, y: e.clientY, target: null, scroller: scrollerOf(b.el), raf: 0 };
    card.classList.add("dragging");
    dragGhost.replaceChildren(h("b", {}, b.label), " ", short(b.text || "(빈 설명)"));
    dragGhost.hidden = false;
    addEventListener("pointermove", boxDragMove, true);
    addEventListener("pointerup", boxDragEnd, true);
    addEventListener("pointercancel", boxDragStop, true);
    addEventListener("keydown", boxDragKey, true);
    boxDragFrame();
  }
  function boxDragMove(e) { if (!boxDrag) return; e.preventDefault(); boxDrag.x = e.clientX; boxDrag.y = e.clientY; }
  function boxDragKey(e) { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); boxDragStop(); } }
  function boxDragFrame() {
    const d = boxDrag;
    if (!d) return;
    Object.assign(dragGhost.style, { left: `${Math.min(d.x + 14, innerWidth - 250)}px`, top: `${d.y + 16}px` });
    // 화면(또는 PDF 처럼 안쪽에서 굴러가는 칸) 위아래 끝에 가까우면 그쪽으로 굴린다
    const whole = d.scroller === document.scrollingElement || d.scroller === document.documentElement;
    const sr = whole ? { top: 0, bottom: innerHeight } : d.scroller.getBoundingClientRect();
    const top = Math.max(0, sr.top), bot = Math.min(innerHeight, sr.bottom), edge = 60;
    if (d.y < top + edge) d.scroller.scrollTop -= Math.ceil((top + edge - d.y) / 4);
    else if (d.y > bot - edge) d.scroller.scrollTop += Math.ceil((d.y - (bot - edge)) / 4);
    const t = d.target = dropTarget(d);
    if (t) { Object.assign(dragLine.style, { left: `${t.l}px`, top: `${t.y - 1.5}px`, width: `${Math.max(40, t.r - t.l)}px` }); dragLine.hidden = false; }
    else dragLine.hidden = true;
    d.raf = requestAnimationFrame(boxDragFrame);
  }
  // 놓을 자리: 다른 설명 카드 위면 그 앞이나 뒤, 아니면 가장 가까운 문단 바로 아래(그 문단의 설명들 맨 앞)
  function dropTarget({ x, y, b }) {
    for (const [id, el] of cardEls) {
      const r = el.getBoundingClientRect();
      if (!r.height || y < r.top - 4 || y > r.bottom + 4 || x < r.left - 40 || x > r.right + 40) continue;
      if (id === b.id) return null; // 제자리
      const other = state.boxes.find((o) => o.id === id);
      if (!other) continue;
      const before = y < (r.top + r.bottom) / 2;
      return { box: other, before, l: r.left, r: r.right, y: before ? r.top - 3 : r.bottom + 3 };
    }
    let best = null, bestD = Infinity;
    for (const p of state.paras) {
      const r = p.el.getBoundingClientRect();
      if (!r.height || r.bottom < -300 || r.top > innerHeight + 300) continue;
      const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
      const dist = dy + dx * 0.3 + (y < r.top ? 12 : 0); // 설명은 문단 아래에 붙으므로 문단 위쪽보다 아래쪽을 조금 더 반긴다
      if (dist < bestD) { bestD = dist; best = { p, r }; }
    }
    return best && { para: best.p, l: best.r.left, r: best.r.right, y: best.r.bottom + 3 };
  }
  function boxDragStop() {
    const d = boxDrag;
    if (!d) return null;
    cancelAnimationFrame(d.raf);
    boxDrag = null;
    d.card.classList.remove("dragging");
    dragLine.hidden = true; dragGhost.hidden = true;
    removeEventListener("pointermove", boxDragMove, true);
    removeEventListener("pointerup", boxDragEnd, true);
    removeEventListener("pointercancel", boxDragStop, true);
    removeEventListener("keydown", boxDragKey, true);
    return d;
  }
  function boxDragEnd(e) {
    const d = boxDragStop();
    dragEndAt = Date.now();
    if (!d?.target) return;
    e.preventDefault();
    const { b, target: t } = d;
    state.boxes = state.boxes.filter((x) => x !== b);
    if (t.box) { b.el = t.box.el; state.boxes.splice(state.boxes.indexOf(t.box) + (t.before ? 0 : 1), 0, b); }
    else {
      b.el = t.para.el;
      const i = state.boxes.findIndex((x) => x.el === b.el);
      if (i < 0) state.boxes.push(b); else state.boxes.splice(i, 0, b);
    }
    b.mine = true; // 내가 옮긴 설명은 AI 답을 새로 붙여도 남는다
    afterChange();
  }

  // ── 표시 범위 고치기: 수정 모드에서 표시를 누르면 처음·끝에 동그란 손잡이가 생긴다. 끌면 그 글자까지 표시가 늘거나 준다 ──
  // 손잡이는 글줄 위(처음)·아래(끝)에 달려 있고, 끄는 동안에는 손잡이가 가리키던 글줄 높이에서 글자 자리를 찾는다(손가락에 글자가 가리지 않게)
  const knobSize = () => (matchMedia("(pointer: coarse)").matches ? 18 : 12);
  function showKnobs(m) { knobFor = m; drawKnobs(); }
  function hideKnobs() { if (knobDrag) return; knobFor = null; for (const k of knobs) k.hidden = true; }
  function drawKnobs() {
    const m = knobFor;
    if (!m) return;
    if (!state.editing || !state.marks.includes(m)) { knobFor = null; for (const k of knobs) k.hidden = true; return; }
    const lines = lineRects(m.range);
    if (!lines.length) { for (const k of knobs) k.hidden = true; return; }
    const a = lines[0], z = lines[lines.length - 1], K = knobSize();
    Object.assign(knobs[0].style, { left: `${a.left - 11}px`, top: `${a.top - K}px`, height: `${a.bottom - a.top + K}px` });
    Object.assign(knobs[1].style, { left: `${z.right - 11}px`, top: `${z.top}px`, height: `${z.bottom - z.top + K}px` });
    for (const k of knobs) k.hidden = false;
  }
  function startKnob(e, side) {
    const m = knobFor;
    if (!m || e.button > 0) return;
    e.preventDefault(); e.stopPropagation();
    const lines = lineRects(m.range), L = side === "start" ? lines[0] : lines[lines.length - 1];
    if (!L) return;
    knobDrag = { m, side, dx: (side === "start" ? L.left : L.right) - e.clientX, dy: (L.top + L.bottom) / 2 - e.clientY, quote: m.quote };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    hidePop();
    addEventListener("pointermove", knobMove, true);
    addEventListener("pointerup", knobEnd, true);
    addEventListener("pointercancel", knobEnd, true);
  }
  function knobMove(e) {
    const d = knobDrag;
    if (!d) return;
    e.preventDefault();
    const c = caretAt(e.clientX + d.dx, e.clientY + d.dy);
    if (!c || c.node?.nodeType !== 3 || !state.root.contains(c.node)) return;
    const r = document.createRange(), cur = d.m.range;
    try {
      if (d.side === "start") { r.setStart(c.node, c.offset); r.setEnd(cur.endContainer, cur.endOffset); }
      else { r.setStart(cur.startContainer, cur.startOffset); r.setEnd(c.node, c.offset); }
    } catch { return; }
    if (r.collapsed || !squash(r.toString())) return; // 처음이 끝을 넘어가면 그대로 둔다
    d.m.range = r;
    paint(); drawKnobs();
  }
  function knobEnd() {
    const d = knobDrag;
    if (!d) return;
    knobDrag = null; dragEndAt = Date.now();
    removeEventListener("pointermove", knobMove, true);
    removeEventListener("pointerup", knobEnd, true);
    removeEventListener("pointercancel", knobEnd, true);
    const q = tidy(d.m.range.toString());
    if (q !== d.quote) { d.m.quote = q; d.m.mine = true; afterChange(); }
    drawKnobs();
  }

  // ── 수정 모드: 글자를 골라 표시·설명 달기, 표시를 눌러 바꾸기·지우기 ──
  function setEditing(on) {
    state.editing = on;
    editBtn.setAttribute("aria-pressed", String(on));
    if (on) panel.setAttribute("data-editing", ""); else panel.removeAttribute("data-editing");
    hidePop();
    drawLayer();
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
      h("button", { title: "고른 글자가 걸친 문단에 중요도 음영을 답니다", onclick: () => pickLevel(range) }, "▤ 중요도"),
      h("button", { title: "이 부분을 AI 에게 더 자세히(예시 포함) 묻는 요청문을 복사합니다", onclick: () => deepAsk(range) }, "🔎 자세히 묻기"),
    ]);
  }
  function showMarkTools(m, x, y) {
    showKnobs(m);
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
  // 본문 속 카드 안을 누르거나 글자를 고를 때는 표시 도구를 띄우지 않는다
  const inNote = (e) => e.composedPath().some((n) => n.tagName === "NOTELAYER-NOTE");
  // 손가락·펜으로 고를 때(아이패드): 선택이 바뀐 뒤 0.4초 동안 그대로면 도구를 띄운다. 마우스로 고를 때는 mouseup 이 맡는다
  let lastPointer = "mouse", selT = 0;
  function onPointerKind(e) { lastPointer = e.pointerType || "mouse"; }
  function onSelChange() {
    if (lastPointer === "mouse") return;
    clearTimeout(selT);
    selT = setTimeout(() => {
      const sel = getSelection();
      if (!sel?.rangeCount || sel.isCollapsed) return;
      const r = sel.getRangeAt(0);
      if (!state.root.contains(r.commonAncestorContainer) || squash(r.toString()).length < 2) return;
      if (state.attaching) { attach(r.cloneRange()); return; }
      if (state.editing) { showSelectionTools(r.cloneRange()); return; }
      if (!COMPACT) return;
      const rr = r.getBoundingClientRect(), range = r.cloneRange();
      showPop(rr.left + rr.width / 2, rr.bottom + 10, [h("button", { title: "이 부분을 AI 에게 더 자세히(예시 포함) 묻는 요청문을 복사합니다", onclick: () => deepAsk(range) }, "🔎 자세히 묻기")]);
    }, 400);
  }
  function onMouseUp(e) {
    if (e.composedPath().includes(host) || inNote(e)) return;
    if (!state.editing && !state.attaching) {
      if (!COMPACT) return;
      setTimeout(() => {
        const sel = getSelection();
        if (!sel?.rangeCount || sel.isCollapsed) { hidePop(); return; }
        const r = sel.getRangeAt(0);
        if (!state.root.contains(r.commonAncestorContainer) || squash(r.toString()).length < 2) { hidePop(); return; }
        const rr = r.getBoundingClientRect(), range = r.cloneRange();
        showPop(rr.left + rr.width / 2, rr.bottom + 6, [h("button", { title: "이 부분을 AI 에게 더 자세히(예시 포함) 묻는 요청문을 복사합니다", onclick: () => deepAsk(range) }, "🔎 자세히 묻기")]);
      }, 0);
      return;
    }
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
    if (!state.editing && !pop.hidden && !e.composedPath().includes(host)) hidePop();
    if (!state.editing || e.composedPath().includes(host) || inNote(e)) return;
    if (Date.now() - dragEndAt < 400) return;
    const sel = getSelection();
    if (sel && !sel.isCollapsed) return;
    const m = markAt(e.clientX, e.clientY);
    if (!m) { hidePop(); hideKnobs(); return; }
    e.preventDefault(); e.stopPropagation(); // 표시가 링크 위에 있어도 페이지를 옮기지 않는다
    showMarkTools(m, e.clientX, e.clientY);
  }
  function onKey(e) {
    if (e.key !== "Escape") return;
    if (sheet) { closeSummary(); return; }
    hidePop(); hideKnobs(); if (state.focus) setFocus(state.focus);
  }
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
  function openStore({ quiet = false } = {}) {
    if (LOCAL) { connect(); return null; }
    if (!BASE) return null;
    // 로컬 시험 서버에서 불렀으면 시험용 저장 창 이름을 따로 써서 공개용 저장 창을 덮지 않는다
    const storeName = /^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(BASE) ? "notelayer-store-dev" : "notelayer-store";
    try { conn.win = window.open(`${BASE}store.html`, storeName, `popup=yes,width=380,height=560,left=${Math.max(0, screen.availWidth - 400)},top=60`); } catch { conn.win = null; }
    if (!conn.win) {
      if (!quiet) setSaved("팝업이 막혀 저장 창을 열지 못했습니다. 주소창 오른쪽에서 이 사이트의 팝업을 허용해 주세요.", true);
      renderStore();
      return null;
    }
    connect();
    return conn.win;
  }
  // 작은 상자의 「저장 창」 버튼: 열려 있으면 그 창을 앞으로 가져오고, 닫혀 있으면 새로 연다
  function goStore() {
    if (conn.win && !conn.win.closed) { try { conn.win.focus(); return; } catch {} }
    openStore();
  }
  // 저장 창이 다 뜰 때까지 인사를 되풀이한다(뜨기 전에 보낸 메시지는 버려진다)
  function connect() {
    conn.ready = false;
    clearInterval(conn.helloT);
    renderStore();
    if (LOCAL) {
      HOST.request(msgFor("hello", 0)).then((d) => {
        conn.ready = true; conn.folder = !!d?.folder;
        renderStore();
        onStoreReady();
      }).catch((err) => setSaved(`저장소를 열지 못했습니다: ${err?.message || err}`, true));
      return;
    }
    if (!conn.win) return;
    let n = 0;
    conn.helloT = setInterval(() => {
      if (conn.ready || !conn.win || conn.win.closed || ++n > 80) { clearInterval(conn.helloT); renderStore(); return; }
      try { conn.win.postMessage(msgFor("hello", 0), NL_ORIGIN); } catch {}
    }, 250);
  }
  function send(type, extra) {
    if (LOCAL) {
      return HOST.request(msgFor(type, ++conn.seq, extra)).then((d) => {
        if (!d || d.type === "error") throw new Error(d?.message || "저장소가 답하지 않습니다");
        if (d.type === "saved") conn.folder = !!d.file;
        return d;
      });
    }
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
    if (d.type === "updated") { reloadSaved(); return; } // 저장 창에서 이 페이지의 기록 파일을 불러왔다
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
  // 저장 창은 필요할 때만 열리므로, 처음 연결되기 전에 답을 적용·수정했을 수 있다.
  // 그때 이 페이지의 예전 저장본이 있으면 말없이 덮어쓰지 않고 한 번 묻는다(이 연결에서 한 번만)
  let storeSynced = false;
  async function onStoreReady() {
    const first = !storeSynced;
    storeSynced = true;
    if (conn.dirty) {
      if (first && !LOCAL) {
        try {
          const r = await send("load");
          if (r.record?.data && !confirm("이 페이지에 예전에 저장한 표시가 있습니다. 지금 표시로 바꿔 저장할까요?\n(취소하면 예전에 저장한 표시를 불러옵니다)")) {
            clearTimeout(saveTimer); conn.dirty = false;
            await loadSaved({ replace: true });
            renderStore();
            return;
          }
        } catch {}
      }
      save(); return;
    }
    if (hasData()) return;
    await loadSaved();
  }
  // 저장본을 꺼내 칠한다. replace 면 지금 칠한 것을 비우고 저장본으로 바꾼다(저장 창에서 파일을 불러왔을 때)
  async function loadSaved({ replace = false } = {}) {
    try {
      const r = await send("load");
      if (r.record?.data && (replace || !hasData())) {
        const data = r.record.data;
        if (replace) { state.marks = []; state.orphans = []; state.attaching = null; state.boxes = []; state.imps = []; state.concepts = null; state.trs = new Map(); }
        if (TEMPLATES[data.tpl]) { state.tpl = data.tpl; tplSelect.value = data.tpl; }
        const res = apply(data, { restored: true });
        setSaved(`${replace ? "저장 창에서 불러온 파일로 다시 칠했습니다" : "저장해 둔 표시를 불러왔습니다"} · ${fmtTime(r.record.savedAt)}${r.from === "folder" ? " · 폴더의 파일에서" : ""}`
          + `${res?.moved ? ` · 글이 바뀌어 자리를 다시 잡은 표시 ${res.moved}개` : ""}${res?.orphans ? ` · 제자리를 잃은 표시 ${res.orphans}개` : ""}`);
      } else if (!r.record && !HOST?.ephemeral) setSaved("이 페이지에 저장한 표시가 아직 없습니다. 답을 적용하거나 고치면 자동으로 저장됩니다.");
    } catch (err) {
      setSaved(`불러오지 못했습니다: ${err.message}`, true);
    }
  }
  // 지금 칠한 것이 있으면 바꿀지 먼저 묻는다(저장 창은 더 새 기록만 들이므로, 불러온 파일이 지금 것보다 새것이다)
  async function reloadSaved() {
    if (hasData() && !confirm("저장 창에서 이 페이지의 기록 파일을 불러왔습니다. 지금 페이지의 표시를 불러온 내용으로 바꿀까요?")) return;
    clearTimeout(saveTimer); conn.dirty = false;
    await loadSaved({ replace: true });
  }
  function renderStore() {
    if (LOCAL) {
      storeLive = conn.ready;
      renderMini();
      storeOpenBtn.hidden = true;
      storeState.className = conn.ready ? "msg" : "msg err";
      storeState.textContent = conn.ready
        ? HOST?.ephemeral ? "예시 화면입니다. 표시·설명을 고쳐 볼 수 있지만 저장되지 않고, 새로고침하면 처음 상태로 돌아갑니다."
        : `● 이 PC 에 저장합니다${conn.folder ? "(연결한 폴더에도 파일로)" : ""}. 서버로 보내지 않습니다.`
        : "○ 저장소를 여는 중…";
      return;
    }
    const live = conn.win && !conn.win.closed;
    storeLive = !!(conn.ready && live);
    renderMini();
    // 저장 창이 닫혀 있을 때는 안내 줄을 통째로 숨긴다(여는 버튼은 작은 상자의 「저장 창」).
    // 팝업이 막혔다는 알림처럼 따로 남긴 말이 있을 때만 보인다
    saveBar.hidden = !!BASE && !live && !savedMsg.textContent;
    storeOpenBtn.hidden = true;
    storeState.className = conn.ready && live ? "msg" : "msg err";
    storeState.textContent = !BASE ? "저장 창 주소를 알 수 없어 저장할 수 없습니다. 즐겨찾기 버튼으로 다시 열어 주세요."
      : conn.ready && live ? `● 저장 창과 연결됨 — 이 PC 에 저장합니다${conn.folder ? "(고른 폴더에도 파일로)" : ""}. 서버로 보내지 않고, 다른 사이트는 이 메모를 볼 수 없습니다.`
      : live ? "○ 저장 창과 연결하는 중…"
      : "";
  }

  function destroy() {
    removeEventListener("message", onStoreMessage);
    clearInterval(conn.helloT); clearInterval(conn.watchT); clearTimeout(saveTimer);
    removeEventListener("scroll", onScroll, true);
    removeEventListener("resize", onResize);
    removeEventListener("pagehide", onPageHide);
    document.removeEventListener("mouseup", onMouseUp, true);
    document.removeEventListener("pointerdown", onPointerKind, true);
    document.removeEventListener("selectionchange", onSelChange);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKey, true);
    ro.disconnect(); mapObserver?.disconnect();
    if (state.popup) try { state.popup.close(); } catch {}
    if (window.CSS?.highlights) for (const k of ["nl-ov-dim", "nl-ov-key", "nl-ov-hl", "nl-ov-wave", "nl-ov-flash"]) CSS.highlights.delete(k);
    for (const x of inlineHosts.splice(0)) x.remove();
    closeSummary(); host.remove(); pageStyle.remove();
    delete window.NL_OVERLAY;
  }
  function onResize() { placePanel(); placeMini(); renderOverview(); queueDraw(); }
  function onPageHide() { if (state.popup) try { state.popup.close(); } catch {} }

  // ── 시작 ──
  state.root = HOST?.root || findRoot();
  state.paras = HOST?.paragraphs || collectParagraphs(state.root);
  const cut = (s) => (s.length > 36 ? `${s.slice(0, 36)}…` : s);
  function renderFound() {
    const how = HOST ? "" : { saved: " (이 사이트에서 직접 고른 본문)", site: " (사이트가 표시한 본문)", score: " (글자 분포로 짐작한 본문 — 틀리면 「본문 다시 고르기」)" }[rootHow];
    foundMsg.textContent = state.paras.length
      ? `본문 문단 ${state.paras.length}개를 찾았습니다.${how}\n첫 문단: ${cut(state.paras[0].text)}\n끝 문단: ${cut(state.paras[state.paras.length - 1].text)}`
      : "본문을 찾지 못했습니다. 「본문 다시 고르기」로 직접 골라 주세요.";
    resetRootBtn.hidden = HOST || rootHow !== "saved";
  }
  renderFound();
  autoPlace();
  placePanel();
  if (COMPACT) setMin(true);
  // 웹페이지: 본문 바탕이 어두운 사이트면 작은 창·패널·요약을 어둡게(PDF 노트는 자기 테마 단추가 정한다)
  if (!HOST) host.setAttribute("data-theme", isDarkBg(bgOf(state.root)) ? "dark" : "light");
  addEventListener("scroll", onScroll, { capture: true, passive: true });
  addEventListener("resize", onResize);
  addEventListener("pagehide", onPageHide);
  document.addEventListener("mouseup", onMouseUp, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("pointerdown", onPointerKind, true);
  document.addEventListener("selectionchange", onSelChange);
  document.addEventListener("keydown", onKey, true);
  const ro = new ResizeObserver(queueDraw);
  ro.observe(document.body);

  paint();
  // 즐겨찾기 버튼이 누르는 순간 저장 창을 먼저 열어 둔다(파일을 다 받은 뒤에 열면 팝업 차단에 걸린다)
  if (LOCAL) connect();
  else {
    addEventListener("message", onStoreMessage);
    conn.win = window.__NL_STORE_WIN || null;
    try { delete window.__NL_STORE_WIN; } catch {}
    conn.watchT = setInterval(() => { if (conn.ready && (!conn.win || conn.win.closed)) { conn.ready = false; renderStore(); } }, 2000);
    // 즐겨찾기 버튼이 누르는 순간 열어 둔 저장 창이 있으면 바로 잇는다. 저장 창을 먼저 열지 않는 예전 즐겨찾기로 불렀으면 여기서 연다.
    // 누른 지 몇 초 안이라 대개 팝업 차단에 걸리지 않는다. 막히면 저장할 때나 「저장 창」 버튼으로 다시 연다
    if (!conn.win && BASE) openStore({ quiet: true }); else connect();
  }

  window.NL_OVERLAY = {
    // 버튼을 다시 누르면: 저장 창이 닫혀 있으면 다시 열고, 아니면 패널(작은 상자)을 숨기고 보인다
    toggle: () => {
      if (!LOCAL && BASE && (!conn.win || conn.win.closed)) { openStore(); if (COMPACT) host.style.display = ""; else setMin(false); return; }
      if (COMPACT) { host.style.display = host.style.display === "none" ? "" : "none"; return; }
      if (state.popup) state.popup.focus(); else setMin(!panel.hasAttribute("data-min"));
    },
    apply: applyText,
    // 템플릿 바꾸기(저장하지 않는다). 예시 열기처럼 화면이 템플릿을 정해 답을 적용할 때 쓴다
    useTemplate: (id) => { if (!TEMPLATES[id]) return false; state.tpl = id; tplSelect.value = id; paint(); drawLayer(); renderResult(); return true; },
    info: () => ({ root: state.root.tagName + (state.root.id ? `#${state.root.id}` : ""), paragraphs: state.paras.length,
      first: state.paras[0]?.text, last: state.paras.at(-1)?.text, side: state.side, width: state.width,
      marks: state.marks.length, boxes: state.boxes.length, orphans: state.orphans.length, editing: state.editing, popped: !!state.popup, key: KEY, store: conn.ready }),
    snapshot: () => serialize(),
    save: () => save(), // 품는 화면이 자기 층(손글씨)을 고친 다음 저장을 부탁한다
    // 내보내기용: 표시마다 화면 위 줄 단위 네모(지금 스크롤 기준), 문단별 번역·설명, 요약, 다시 열 때 쓸 기록 원본
    exportLayer: () => {
      const notes = new Map();
      const note = (el) => { if (!notes.has(el)) notes.set(el, { el, tr: "", boxes: [] }); return notes.get(el); };
      for (const [i, t] of [...state.trs].sort((a, b) => a[0] - b[0])) if (state.paras[i] && t.text) note(state.paras[i].el).tr = t.text;
      for (const b of sortedBoxes()) note(b.el).boxes.push({ label: b.label, text: b.text, pre: b.pre, answer: b.answer });
      return {
        tpl: state.tpl, template: TEMPLATES[state.tpl], colors: colors(),
        marks: state.marks.map((m) => ({ kind: m.kind, quote: m.quote, mine: !!m.mine, rects: lineRects(m.range) })),
        notes: [...notes.values()], concepts: state.concepts,
        record: { v: 1, tpl: state.tpl, ...serialize() }, paragraphs: state.paras.map((x) => x.text),
      };
    },
    restore: (data) => { state.marks = []; state.orphans = []; state.boxes = []; state.imps = []; state.concepts = null; state.trs = new Map(); return apply(data, { restored: true }); },
    destroy,
  };
})();
