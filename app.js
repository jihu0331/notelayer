// notelayer — 원문 위에 템플릿별 표시·설명·내 메모 층을 얹어 보는 화면.
// 데이터: templates.js(템플릿), documents/*.js(문서와 그 위의 표시·설명).
function startNotelayer() {
  const TEMPLATES = window.NL_TEMPLATES;
  const DOCS = window.NL_DOCS;
  const SVG = "http://www.w3.org/2000/svg";
  const STORE = "notelayer-v1";
  const supportsHighlight = typeof CSS !== "undefined" && "highlights" in CSS;
  const $ = (id) => document.getElementById(id);
  const article = $("doc");

  // 사용자가 화면에서 넣은 문서는 예시 문서와 따로 이 브라우저에 저장한다
  const USER_STORE = "notelayer-userdocs-v1";
  const userDocIds = new Set();
  try {
    for (const d of JSON.parse(localStorage.getItem(USER_STORE)) ?? []) {
      if (d?.id && Array.isArray(d.blocks) && !DOCS.some((x) => x.id === d.id)) { DOCS.push(d); userDocIds.add(d.id); }
    }
  } catch {}
  function saveUserDocs() { try { localStorage.setItem(USER_STORE, JSON.stringify(DOCS.filter((d) => userDocIds.has(d.id)))); } catch {} }

  let uidSeq = 0;
  const uid = () => `x${Date.now().toString(36)}${(uidSeq++).toString(36)}`;
  const withIds = (list) => (list ?? []).map((x) => ({ id: uid(), ...structuredClone(x) }));

  // 문서별 상태: 템플릿별 표시·설명(고친 내용 포함)과 내 메모. 이 브라우저에만 저장한다
  function freshDocState(d) {
    const ann = {};
    for (const [t, a] of Object.entries(d.annotations)) ann[t] = { marks: withIds(a.marks), boxes: withIds(a.boxes) };
    return { ann, memos: withIds(d.memos) };
  }
  function loadState() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORE)); } catch {}
    const s = {};
    for (const d of DOCS) s[d.id] = saved?.[d.id]?.ann ? saved[d.id] : freshDocState(d);
    return s;
  }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch {} }

  const state = loadState();
  const ui = { doc: DOCS[0].id, tpl: DOCS[0].templates[0], editing: false, side: null, layers: { marks: true, boxes: true, mine: true, tr: true } };
  let focusId = null;           // 새로 단 메모: 그려진 뒤 바로 입력칸에 커서를 둔다
  const openIds = new Set();    // 펼쳐 둔 상자
  let circleRanges = [];

  const docById = (id) => DOCS.find((d) => d.id === id);
  const cur = () => {
    const d = docById(ui.doc);
    const st = state[d.id];
    st.ann[ui.tpl] ??= { marks: [], boxes: [] }; // 새로 넣은 문서는 템플릿마다 빈 층으로 시작한다
    return { d, tpl: TEMPLATES[ui.tpl], st, ann: st.ann[ui.tpl] };
  };

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text; // 데이터는 늘 글자로만 넣는다
    return e;
  }
  const paraEl = (p) => article.querySelector(`p[data-p="${p}"]`);

  // 원문 문단 안에서 인용문 위치를 찾는다. at 이 맞으면 그 자리를, 아니면 첫 일치를 쓴다
  function locate(p, quote, at) {
    const node = paraEl(p)?.firstChild;
    if (!node || node.nodeType !== Node.TEXT_NODE) return null;
    let i = at != null && node.data.substr(at, quote.length) === quote ? at : node.data.indexOf(quote);
    if (i < 0) return null;
    return { node, start: i, end: i + quote.length };
  }
  function toRange(loc) {
    const r = document.createRange();
    r.setStart(loc.node, loc.start); r.setEnd(loc.node, loc.end);
    return r;
  }

  // ── 상자 ──
  function whoText(item, kind) {
    if (kind === "mine") return "나";
    if (item.by && item.by !== "ai") return item.by;
    return item.edited ? "AI · 내가 고침" : "AI";
  }
  // 상자 글: 수정 모드에서는 글 자체가 입력칸이 되어, 치는 대로 바로 바뀌고 저장된다
  function baseBox({ id, label, color, who, first, cls, onText, onEmpty, onLabel }) {
    const box = el("details", `box ${cls}`);
    box.style.setProperty("--c", color);
    box.dataset.id = id;
    box.open = openIds.has(id);
    const sum = el("summary");
    const tag = el("span", "tag", label);
    const whoEl = el("span", "who", who);
    const text = el("span", "first", first);
    sum.append(tag, whoEl, text);
    // 수정 모드에서는 윗줄을 눌러도 접고 펴지 않는다(글을 고치는 자리이므로)
    sum.addEventListener("click", (e) => { if (ui.editing) e.preventDefault(); });
    if (ui.editing && onText) {
      text.contentEditable = "plaintext-only";
      text.spellcheck = false;
      text.title = "눌러서 바로 고치기";
      text.addEventListener("focus", () => { box.open = true; openIds.add(id); });
      text.addEventListener("input", () => { const w = onText(text.textContent); if (w) whoEl.textContent = w; });
      text.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) { e.preventDefault(); text.blur(); }
      });
      text.addEventListener("blur", () => { if (!text.textContent.trim()) onEmpty?.(); });
    }
    if (ui.editing && onLabel) {
      tag.classList.add("pick");
      tag.title = "눌러서 종류 바꾸기";
      tag.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); onLabel(tag); });
    }
    box.append(sum);
    box.addEventListener("toggle", () => { box.open ? openIds.add(id) : openIds.delete(id); queueDraw(); });
    return box;
  }
  function actions(buttons) {
    const row = el("div", "edit-actions");
    for (const [text, fn, cls] of buttons) { const b = el("button", `btn ${cls ?? ""}`, text); b.onclick = fn; row.append(b); }
    return row;
  }
  // 펼쳐야 보이는 칸(그림·답·번역)도 수정 모드에서는 글 자체를 바로 고친다
  function liveEdit(node, { onText, onEmpty, placeholder }) {
    if (!ui.editing) return node;
    node.contentEditable = "plaintext-only";
    node.spellcheck = false;
    node.classList.add("live");
    if (placeholder) node.dataset.placeholder = placeholder;
    node.addEventListener("input", () => onText(node.textContent));
    node.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) { e.preventDefault(); node.blur(); }
    });
    node.addEventListener("blur", () => { if (!node.textContent.trim()) onEmpty?.(); });
    return node;
  }
  // 저장은 치는 동안 잠깐 모았다가 한 번에 한다
  let saveTimer = 0;
  function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 300); }

  function makeAiBox(b, tpl, ann) {
    const isPerson = b.by && b.by !== "ai";
    const before = b.text;
    const box = baseBox({
      id: b.id, label: b.label, color: tpl.boxes[b.label] ?? "#6b7280", who: whoText(b, "ai"), first: b.text,
      cls: isPerson ? "person" : "ai",
      onText: (t) => { b.text = t; if (!isPerson) b.edited = true; saveSoon(); return whoText(b, "ai"); },
      onEmpty: () => { b.text = before; save(); render(); }, // 설명을 다 지우면 원래 글로 되돌린다. 상자를 없애려면 지우기
      onLabel: (tag) => openLabelMenu(b, tpl, tag),
    });
    const body = el("div", "body");
    const whoEl = box.querySelector(".who");
    const touched = () => { if (!isPerson) b.edited = true; whoEl.textContent = whoText(b, "ai"); saveSoon(); };
    if (b.pre) {
      const preBefore = b.pre;
      body.append(liveEdit(el("pre", null, b.pre), {
        onText: (t) => { b.pre = t; touched(); },
        onEmpty: () => { b.pre = preBefore; save(); render(); },
      }));
    }
    if (b.answer) {
      const ans = el("div", "answer");
      const ansText = el("span", null, b.answer);
      ans.append(el("span", "answer-label", "답: "), ansText);
      if (ui.editing) {
        // 고칠 때는 답을 펼쳐 둔다
        const ansBefore = b.answer;
        liveEdit(ansText, { onText: (t) => { b.answer = t; touched(); }, onEmpty: () => { b.answer = ansBefore; save(); render(); } });
        body.append(ans);
      } else {
        const btn = el("button", "reveal", "먼저 생각해 보고, 답 보기");
        ans.hidden = true;
        btn.onclick = () => { ans.hidden = false; btn.remove(); queueDraw(); };
        body.append(btn, ans);
      }
    }
    body.append(actions([["지우기", () => { ann.boxes = ann.boxes.filter((x) => x !== b); save(); render(); }]]));
    box.append(body);
    return box;
  }

  function makeMemoBox(m, st) {
    const box = baseBox({
      id: m.id, label: `“${m.quote}”`, color: "var(--mine)", who: "나", first: m.text, cls: "mine",
      onText: (t) => { m.text = t; saveSoon(); },
      onEmpty: () => { st.memos = st.memos.filter((x) => x !== m); save(); render(); }, // 비운 메모는 지운다
    });
    box.open = true;
    box.querySelector(".first").dataset.placeholder = "이 구절에 남길 메모";
    const body = el("div", "body");
    body.append(actions([["지우기", () => { st.memos = st.memos.filter((x) => x !== m); save(); render(); }]]));
    box.append(body);
    if (focusId === m.id) requestAnimationFrame(() => { box.querySelector(".first").focus(); focusId = null; });
    return box;
  }

  // 설명 상자 종류 바꾸기: 꼬리표를 누르면 템플릿의 상자 종류가 뜬다
  function openLabelMenu(b, tpl, tag) {
    const pop = $("pop");
    pop.replaceChildren(el("div", "q", "설명 종류"));
    const row = el("div", "row");
    for (const l of Object.keys(tpl.boxes)) {
      const btn = el("button", null, l);
      btn.setAttribute("aria-pressed", String(b.label === l));
      btn.onclick = () => { b.label = l; if (!(b.by && b.by !== "ai")) b.edited = true; save(); render(); };
      row.append(btn);
    }
    pop.append(row);
    const r = tag.getBoundingClientRect();
    pop.style.left = `${r.left + scrollX}px`;
    pop.style.top = `${r.bottom + scrollY + 6}px`;
    pop.style.display = "block";
  }

  // ── 그리기 ──
  function render() {
    const { d, tpl, st, ann } = cur();
    document.body.dataset.template = ui.tpl;
    document.body.classList.toggle("editing", ui.editing);
    closePop(); hideSelMenu();

    // 막대 상태
    $("docSelect").value = d.id;
    $("deleteDocBtn").hidden = !userDocIds.has(d.id);
    document.querySelectorAll("#templateButtons button").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.id === ui.tpl));
      b.disabled = !d.templates.includes(b.dataset.id);
      b.title = b.disabled ? "이 예시 문서에는 맞지 않는 템플릿입니다" : "";
    });
    const hasTr = d.blocks.some((b) => b.tr);
    $("layerTr").disabled = !hasTr;
    $("trLabel").classList.toggle("off", !hasTr);
    $("trLabel").title = hasTr ? "" : "이 문서는 번역할 필요가 없는 한국어 문서입니다";
    $("editSwitch").setAttribute("aria-checked", String(ui.editing));

    // 출처와 범례: 모양의 뜻은 고정, 이름만 템플릿이 정한다
    $("meta").textContent = `원문: ${d.source} · 원문은 고치지 않고 그 위에 층만 얹는다`;
    const legend = $("legend");
    legend.replaceChildren(el("div", "reader", `${tpl.name} · 읽는 사람: ${tpl.reader} · ${tpl.rules.join(" · ")}`));
    for (const [kind, cls, name] of [["circle", "sw-circle", tpl.marks.circle], ["highlight", "sw-hl", tpl.marks.highlight],
      ["wave", "sw-wave", tpl.marks.wave], ["mine", "sw-mine", "내 메모"]]) {
      const k = el("button", "k");
      k.dataset.kind = kind;
      k.title = "눌러서 이 종류만 오른쪽에 모아 보기";
      k.append(el("span", cls), el("span", null, name), el("span", "count"));
      k.onclick = () => { ui.side = ui.side === kind ? null : kind; renderSide(); };
      legend.append(k);
    }
    // 설명 상자 종류도 같은 방식으로 모아 본다
    const boxRow = el("div", "boxrow");
    boxRow.append(el("span", "count", "설명"));
    for (const [label, color] of Object.entries(tpl.boxes)) {
      const k = el("button", "k");
      k.dataset.kind = `box:${label}`;
      k.title = "눌러서 이 설명만 오른쪽에 모아 보기";
      const dot = el("span", "dot"); dot.style.background = color;
      k.append(dot, el("span", null, label), el("span", "count"));
      k.onclick = () => { ui.side = ui.side === k.dataset.kind ? null : k.dataset.kind; renderSide(); };
      boxRow.append(k);
    }
    legend.append(boxRow);
    if (ui.side?.startsWith("box:") && !tpl.boxes[ui.side.slice(4)]) ui.side = null; // 템플릿을 바꿔 없는 종류면 닫는다
    if (hasTr) legend.append(el("span", "k", "번역: 영어 → 한국어 (문단 아래)"));

    // 본문: 원문 → 번역 → 설명 상자 → 내 메모 순서로 문단마다 쌓는다
    article.replaceChildren(el("h1", null, d.title));
    for (const b of d.blocks) {
      const p = el("p", null, b.text);
      p.dataset.p = b.p; p.lang = d.lang;
      article.append(p);
      if (b.tr && ui.layers.tr) {
        // 번역을 고치면 원래 번역 위에 내 번역을 덮어 둔다. 다 지우면 원래 번역으로 돌아간다
        st.tr ??= {};
        const mineTr = st.tr[b.p];
        const tr = el("div", "tr"); tr.lang = "ko";
        const label = el("span", "tr-label", mineTr ? "번역 · 내가 고침" : "번역");
        const text = liveEdit(el("span", "tr-text", mineTr ?? b.tr), {
          onText: (t) => { st.tr[b.p] = t; label.textContent = "번역 · 내가 고침"; saveSoon(); },
          onEmpty: () => { delete st.tr[b.p]; save(); render(); },
        });
        tr.append(label, text);
        article.append(tr);
      }
      if (ui.layers.boxes) for (const x of ann.boxes.filter((x) => x.p === b.p)) article.append(makeAiBox(x, tpl, ann));
      if (ui.layers.mine) for (const m of st.memos.filter((m) => m.p === b.p)) article.append(makeMemoBox(m, st));
    }
    const overlay = document.createElementNS(SVG, "svg");
    overlay.setAttribute("class", "overlay"); overlay.id = "overlay"; overlay.setAttribute("aria-hidden", "true");
    const orphanBox = el("div", "orphans");
    orphanBox.id = "orphans";
    // 고르고 있는 표시의 양 끝 손잡이(수정 모드). 끌면 한 글자씩 범위가 늘고 준다
    const hStart = el("div", "handle start"); const hEnd = el("div", "handle end");
    hStart.title = hEnd.title = "끌어서 범위 조절";
    wireHandle(hStart, "start"); wireHandle(hEnd, "end");
    article.append(overlay, hStart, hEnd, orphanBox);
    $("expandAll").textContent = allOpen() ? "설명 모두 접기" : "설명 모두 펼치기";
    paintMarks();
  }

  // 글자에 붙는 표시는 페이지 구조를 바꾸지 않는 브라우저 기능(CSS Custom Highlight)으로 칠한다.
  // 범위를 끌어 조절하는 동안에는 문서를 다시 짓지 않고 이 함수만 다시 부른다
  function paintMarks() {
    const { st, ann } = cur();
    const ranges = { highlight: [], wave: [], circle: [] };
    const orphans = [];
    for (const m of visibleMarks(ann)) {
      const loc = locate(m.p, m.quote, m.at);
      if (loc) ranges[m.kind].push(toRange(loc)); else orphans.push(m.quote);
    }
    const mine = ui.layers.mine ? st.memos.map((m) => locate(m.p, m.quote, m.at)).filter(Boolean).map(toRange) : [];
    const sel = selectedMark();
    const selLoc = sel && locate(sel.p, sel.quote, sel.at);
    if (supportsHighlight) {
      CSS.highlights.clear();
      CSS.highlights.set("mk-hl", new Highlight(...ranges.highlight));
      CSS.highlights.set("mk-wave", new Highlight(...ranges.wave));
      CSS.highlights.set("mk-mine", new Highlight(...mine));
      if (selLoc) CSS.highlights.set("mk-sel", new Highlight(toRange(selLoc)));
    }
    circleRanges = ranges.circle;
    $("orphans").textContent = (orphans.length ? `원래 자리를 못 찾은 표시: ${orphans.join(", ")}` : "")
      + (supportsHighlight ? "" : " 이 브라우저는 형광펜 기능을 지원하지 않아 동그라미만 보입니다.");
    queueDraw();
    renderSide();
  }

  // ── 오른쪽 모아 보기: 범례에서 고른 종류의 표시를 문서 순서대로 나열하고, 누르면 그 자리로 간다 ──
  function sideItems(kind) {
    const { st, ann } = cur();
    if (kind.startsWith("box:")) {
      if (!ui.layers.boxes) return [];
      const label = kind.slice(4);
      return ann.boxes.filter((b) => b.label === label).map((b) => ({ src: b, box: true })).sort((a, b) => a.src.p - b.src.p);
    }
    const list = kind === "mine"
      ? st.memos.map((m) => ({ src: m, memo: true }))
      : visibleMarks(ann).filter((m) => m.kind === kind).map((m) => ({ src: m, memo: false }));
    for (const it of list) it.loc = locate(it.src.p, it.src.quote, it.src.at);
    return list.sort((a, b) => a.src.p - b.src.p || (a.loc?.start ?? 0) - (b.loc?.start ?? 0));
  }
  let activeSideId = null;
  function renderSide() {
    const side = $("side");
    const { tpl } = cur();
    // 범례 숫자는 늘 갱신한다
    for (const k of document.querySelectorAll(".legend button.k")) {
      k.querySelector(".count").textContent = String(sideItems(k.dataset.kind).length);
      k.setAttribute("aria-pressed", String(ui.side === k.dataset.kind));
    }
    document.body.classList.toggle("side-open", !!ui.side);
    if (!ui.side) { side.hidden = true; return; }
    side.hidden = false;
    const isBox = ui.side.startsWith("box:");
    const name = isBox ? `설명 · ${ui.side.slice(4)}` : ui.side === "mine" ? "내 메모" : `${SHAPE[ui.side]} ${tpl.marks[ui.side]}`;
    const items = sideItems(ui.side);
    const header = el("header");
    const close = el("button", "close", "×");
    close.title = "닫기";
    close.onclick = () => { ui.side = null; renderSide(); };
    header.append(el("span", null, `${name} · ${items.length}개`), close);
    const body = el("div");
    if (!items.length) body.append(el("div", "empty", isBox && !ui.layers.boxes ? "AI 설명 층이 꺼져 있습니다." : "이 문서에는 아직 없습니다."));
    for (const it of items.filter((x) => x.box)) {
      const b = el("button", `item${activeSideId === it.src.id ? " active" : ""}`);
      b.append(el("div", "quote", it.src.text));
      if (it.src.answer) b.append(el("div", "ctx", "답은 본문에서 펼쳐 확인"));
      b.append(el("div", "meta", `문단 ${it.src.p} · ${whoText(it.src, "ai")}`));
      b.onclick = () => goTo(it);
      body.append(b);
    }
    for (const it of items.filter((x) => !x.box)) {
      const b = el("button", `item${it.loc ? "" : " lost"}${activeSideId === it.src.id ? " active" : ""}`);
      b.append(el("div", "quote", `“${it.src.quote}”`));
      if (it.loc) {
        const t = it.loc.node.data;
        const ctx = el("div", "ctx");
        const a = Math.max(0, it.loc.start - 18), z = Math.min(t.length, it.loc.end + 18);
        ctx.append(document.createTextNode(`${a > 0 ? "…" : ""}${t.slice(a, it.loc.start)}`), el("mark", null, t.slice(it.loc.start, it.loc.end)),
          document.createTextNode(`${t.slice(it.loc.end, z)}${z < t.length ? "…" : ""}`));
        b.append(ctx);
      }
      const meta = it.memo ? it.src.text || "(빈 메모)" : `${it.src.by === "me" ? "내가 단 표시" : "AI 표시"}`;
      b.append(el("div", "meta", `문단 ${it.src.p} · ${it.loc ? meta : "원래 자리를 못 찾음"}`));
      if (it.loc) b.onclick = () => goTo(it);
      body.append(b);
    }
    side.replaceChildren(header, body);
  }
  // 그 자리로 화면을 옮기고 잠깐 반짝인다. 수정 모드에서는 바로 고칠 수 있게 표시 창도 연다
  let flashTimer = 0;
  function goTo(it) {
    activeSideId = it.src.id;
    if (it.box) {
      // 설명 상자는 펼친 다음 그 상자로 옮겨 테두리를 잠깐 반짝인다
      const box = article.querySelector(`.box[data-id="${it.src.id}"]`);
      if (!box) return;
      box.open = true; openIds.add(it.src.id);
      const r = box.getBoundingClientRect();
      scrollTo({ top: r.top + scrollY - innerHeight / 3, behavior: "smooth" });
      box.classList.remove("flash"); void box.offsetWidth; box.classList.add("flash");
      renderSide();
      return;
    }
    const range = toRange(it.loc);
    const target = it.memo ? article.querySelector(`.box[data-id="${it.src.id}"]`) ?? range : range;
    const r = target.getBoundingClientRect();
    scrollTo({ top: r.top + scrollY - innerHeight / 3, behavior: "smooth" });
    if (supportsHighlight) {
      CSS.highlights.set("mk-flash", new Highlight(range));
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => CSS.highlights.delete("mk-flash"), 1600);
    }
    if (!it.memo && ui.editing) openPop(it.src); else renderSide();
  }
  // AI 가 단 표시는 "AI 표시" 층, 내가 달거나 고친 표시는 "내 표시·메모" 층에 속한다
  function visibleMarks(ann) {
    return ann.marks.filter((m) => (m.by === "me" ? ui.layers.mine : ui.layers.marks));
  }
  function allOpen() {
    const ids = [...article.querySelectorAll(".box")].map((b) => b.dataset.id);
    return ids.length > 0 && ids.every((id) => openIds.has(id));
  }

  // 동그라미는 겹친 SVG 층에 그린다. 글자 위치가 바뀔 때마다 다시 그린다
  let raf = 0;
  function queueDraw() { cancelAnimationFrame(raf); raf = requestAnimationFrame(drawCircles); }
  function drawCircles() {
    const overlay = $("overlay");
    if (!overlay) return;
    overlay.replaceChildren();
    const base = article.getBoundingClientRect();
    const hand = TEMPLATES[ui.tpl].hand;
    for (const r of circleRanges) {
      for (const rect of r.getClientRects()) {
        const cx = rect.left - base.left + rect.width / 2;
        const cy = rect.top - base.top + rect.height / 2;
        const e = document.createElementNS(SVG, "ellipse");
        e.setAttribute("cx", cx); e.setAttribute("cy", cy);
        e.setAttribute("rx", rect.width / 2 + 4); e.setAttribute("ry", rect.height / 2);
        e.setAttribute("fill", "none"); e.style.stroke = "var(--circle)";
        e.setAttribute("stroke-width", hand ? "2.2" : "1.6");
        if (hand) e.setAttribute("transform", `rotate(-2 ${cx} ${cy})`);
        overlay.append(e);
      }
    }
    positionHandles(base);
  }
  function positionHandles(base) {
    const [hs, he] = article.querySelectorAll(".handle");
    if (!hs) return;
    const m = selectedMark();
    const loc = m && locate(m.p, m.quote, m.at);
    const rects = loc ? [...toRange(loc).getClientRects()] : [];
    if (!ui.editing || !rects.length) { hs.style.display = he.style.display = "none"; return; }
    const a = rects[0], z = rects[rects.length - 1];
    Object.assign(hs.style, { display: "block", left: `${a.left - base.left - 1}px`, top: `${a.top - base.top}px`, height: `${a.height}px` });
    Object.assign(he.style, { display: "block", left: `${z.right - base.left - 1}px`, top: `${z.top - base.top}px`, height: `${z.height}px` });
  }

  // ── 표시 범위 늘이고 줄이기 ──
  let selectedId = null;
  const selectedMark = () => (selectedId ? cur().ann.marks.find((m) => m.id === selectedId) : null);
  // 범위를 문단 안의 [start, end) 로 바꾼다. 범위를 바꾼 표시는 내 표시가 된다
  function setRange(m, start, end) {
    const node = paraEl(m.p)?.firstChild;
    if (!node) return false;
    start = Math.max(0, start); end = Math.min(node.data.length, end);
    if (end <= start) return false;
    m.at = start; m.quote = node.data.slice(start, end); m.by = "me";
    return true;
  }
  // 한 단어씩: 띄어쓰기를 경계로 삼고, 한 단어만 남았으면 한 글자씩 줄인다
  function stepRange(m, side, grow) {
    const loc = locate(m.p, m.quote, m.at);
    if (!loc) return;
    const t = loc.node.data, sp = (c) => /\s/.test(c);
    let { start, end } = loc;
    if (side === "start" && grow) { while (start > 0 && sp(t[start - 1])) start--; while (start > 0 && !sp(t[start - 1])) start--; }
    if (side === "end" && grow) { while (end < t.length && sp(t[end])) end++; while (end < t.length && !sp(t[end])) end++; }
    if (side === "start" && !grow) {
      let i = start; while (i < end && !sp(t[i])) i++; while (i < end && sp(t[i])) i++;
      start = i < end ? i : start + 1;
    }
    if (side === "end" && !grow) {
      let i = end; while (i > start && !sp(t[i - 1])) i--; while (i > start && sp(t[i - 1])) i--;
      end = i > start ? i : end - 1;
    }
    if (setRange(m, start, end)) { save(); paintMarks(); openPop(m); }
  }
  let dragging = null;
  function wireHandle(h, side) {
    h.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); h.setPointerCapture(e.pointerId); dragging = side; });
    h.addEventListener("pointermove", (e) => {
      if (dragging !== side) return;
      const m = selectedMark();
      const node = m && paraEl(m.p)?.firstChild;
      if (!node) return;
      // 손잡이 자신이 글자를 가리지 않도록 잠깐 숨기고 손가락 아래 글자 위치를 읽는다
      const hs = article.querySelectorAll(".handle");
      hs.forEach((x) => (x.style.visibility = "hidden"));
      const c = caretAt(e.clientX, e.clientY);
      hs.forEach((x) => (x.style.visibility = ""));
      if (!c || c.node !== node) return;
      const loc = locate(m.p, m.quote, m.at);
      let { start, end } = loc;
      if (side === "start") start = Math.min(c.offset, end - 1); else end = Math.max(c.offset, start + 1);
      if (start === loc.start && end === loc.end) return;
      if (setRange(m, start, end)) { paintMarks(); pop.style.display = "none"; }
    });
    h.addEventListener("pointerup", () => {
      if (dragging !== side) return;
      dragging = null; save();
      const m = selectedMark(); if (m) openPop(m);
    });
  }
  new ResizeObserver(queueDraw).observe(article);
  document.fonts?.ready.then(queueDraw);

  // ── 표시 누르기: 보기 모드는 뜻만, 수정 모드는 바꾸기·지우기 ──
  const pop = $("pop");
  function closePop() {
    pop.style.display = "none";
    if (selectedId) { selectedId = null; if (supportsHighlight) CSS.highlights.delete("mk-sel"); queueDraw(); }
  }
  function caretAt(x, y) {
    if (document.caretPositionFromPoint) { const c = document.caretPositionFromPoint(x, y); return c && { node: c.offsetNode, offset: c.offset }; }
    const r = document.caretRangeFromPoint?.(x, y); return r && { node: r.startContainer, offset: r.startOffset };
  }
  function markAt(x, y) {
    const c = caretAt(x, y);
    const p = c?.node?.parentElement?.closest?.("p[data-p]");
    if (!p || c.node.nodeType !== Node.TEXT_NODE) return null;
    const { ann } = cur();
    let best = null;
    for (const m of visibleMarks(ann)) {
      if (String(m.p) !== p.dataset.p) continue;
      const loc = locate(m.p, m.quote, m.at);
      if (loc && loc.start <= c.offset && c.offset < loc.end && (!best || m.quote.length < best.quote.length)) best = m;
    }
    return best;
  }
  const SHAPE = { circle: "◯", highlight: "▬", wave: "〰" };
  // 표시 창은 표시 바로 아래에 띄운다. 범위를 바꾸면 내용과 자리를 다시 잡는다
  function openPop(m) {
    const { tpl, ann } = cur();
    const wasSelected = selectedId === m.id;
    selectedId = ui.editing ? m.id : null;
    pop.replaceChildren();
    const head = el("div", null, `${SHAPE[m.kind]} ${tpl.marks[m.kind]} · ${m.by === "me" ? "내가 단 표시" : "AI 가 단 표시"}`);
    head.style.fontWeight = "600";
    pop.append(head, el("div", "q", `“${m.quote}”`));
    if (ui.editing) {
      const kinds = el("div", "row");
      for (const k of ["circle", "highlight", "wave"]) {
        const b = el("button", null, `${SHAPE[k]} ${tpl.marks[k]}`);
        b.setAttribute("aria-pressed", String(m.kind === k));
        b.onclick = () => { m.kind = k; m.by = "me"; save(); paintMarks(); openPop(m); };
        kinds.append(b);
      }
      const range = el("div", "row range");
      const step = (text, side, grow) => { const b = el("button", null, text); b.onclick = () => stepRange(m, side, grow); return b; };
      range.append(
        el("span", "rlabel", "앞쪽"), step("◀ 늘이기", "start", true), step("줄이기 ▶", "start", false),
        el("span", "rlabel", "뒤쪽"), step("◀ 줄이기", "end", false), step("늘이기 ▶", "end", true),
      );
      const del = el("button", "danger", "표시 지우기");
      del.onclick = () => { ann.marks = ann.marks.filter((x) => x !== m); save(); render(); };
      pop.append(kinds, range, el("div", "q hint-line", "버튼은 한 단어씩, 표시 양 끝의 노란 손잡이를 끌면 한 글자씩 조절됩니다."), del);
    } else {
      pop.append(el("div", "q", "고치려면 오른쪽 위 수정 모드를 켜세요."));
    }
    const loc = locate(m.p, m.quote, m.at);
    const rects = loc ? [...toRange(loc).getClientRects()] : [];
    const z = rects[rects.length - 1];
    if (z) {
      pop.style.left = `${Math.max(scrollX + 8, Math.min(z.left + scrollX, scrollX + innerWidth - 340))}px`;
      pop.style.top = `${z.bottom + scrollY + 14}px`;
    }
    pop.style.display = "block";
    if (!wasSelected || ui.editing) paintMarks();
  }
  article.addEventListener("click", (e) => {
    if (e.target.closest(".box, .tr, .handle, button, textarea, select")) return;
    if (getSelection().toString()) return;
    const m = markAt(e.clientX, e.clientY);
    if (m) { e.stopPropagation(); openPop(m); } else closePop();
  });
  // 창 안 버튼을 누르면 창 내용이 새로 그려져 누른 버튼이 사라지므로, 눌린 순간의 경로로 판단한다
  document.addEventListener("click", (e) => {
    const path = e.composedPath();
    // 오른쪽 목록에서 누른 것도 표시 창을 여는 동작이므로 닫지 않는다
    if (!path.includes(pop) && !path.includes(article) && !path.includes($("side"))) closePop();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closePop(); hideSelMenu(); } });

  // ── 글자 고르기: 수정 모드에서만 새 표시·메모를 단다 ──
  const selmenu = $("selmenu");
  let pending = null;
  function hideSelMenu() { selmenu.style.display = "none"; pending = null; }
  document.addEventListener("mouseup", (ev) => {
    if (selmenu.contains(ev.target) || pop.contains(ev.target)) return;
    const sel = getSelection();
    const p = sel.anchorNode?.parentElement?.closest("p[data-p]");
    const raw = sel.toString();
    const quote = raw.trim();
    if (!ui.editing || !p || !quote || sel.anchorNode !== sel.focusNode || !sel.rangeCount) { hideSelMenu(); return; }
    const r = sel.getRangeAt(0);
    pending = { p: Number(p.dataset.p), quote, at: r.startOffset + (raw.length - raw.trimStart().length) };
    const { tpl } = cur();
    selmenu.replaceChildren();
    for (const k of ["circle", "highlight", "wave"]) {
      const b = el("button", null, `${SHAPE[k]} ${tpl.marks[k]}`);
      b.onclick = () => { cur().ann.marks.push({ id: uid(), ...pending, kind: k, by: "me" }); clearSel(); save(); render(); };
      selmenu.append(b);
    }
    const memo = el("button", "mine", "내 메모");
    memo.onclick = () => {
      const m = { id: uid(), ...pending, text: "" };
      cur().st.memos.push(m); focusId = m.id;
      clearSel(); render();
    };
    selmenu.append(memo);
    const rect = r.getBoundingClientRect();
    selmenu.style.left = `${rect.left + scrollX}px`;
    selmenu.style.top = `${rect.bottom + scrollY + 6}px`;
    selmenu.style.display = "flex";
    closePop();
  });
  function clearSel() { getSelection().removeAllRanges(); hideSelMenu(); }

  // ── 막대 ──
  // 문서 고르기: 예시 문서와 내가 넣은 문서를 나눠 보여 준다
  function fillDocSelect() {
    const sel = $("docSelect");
    sel.replaceChildren();
    const mine = DOCS.filter((d) => userDocIds.has(d.id));
    const groups = [["예시 문서", DOCS.filter((d) => !userDocIds.has(d.id))], ["내 문서", mine]];
    for (const [label, list] of groups) {
      if (!list.length) continue;
      const g = el("optgroup"); g.label = label;
      for (const d of list) { const o = el("option", null, d.title); o.value = d.id; g.append(o); }
      sel.append(g);
    }
    sel.value = ui.doc;
  }
  fillDocSelect();
  $("docSelect").onchange = (e) => {
    ui.doc = e.target.value;
    const d = docById(ui.doc);
    if (!d.templates.includes(ui.tpl)) ui.tpl = d.templates[0];
    render();
  };
  for (const [id, t] of Object.entries(TEMPLATES)) {
    const b = el("button", null, t.name); b.dataset.id = id;
    b.onclick = () => { ui.tpl = id; render(); };
    $("templateButtons").append(b);
  }
  for (const [id, key] of [["layerMarks", "marks"], ["layerBoxes", "boxes"], ["layerMine", "mine"], ["layerTr", "tr"]]) {
    $(id).addEventListener("change", (e) => { ui.layers[key] = e.target.checked; render(); });
  }
  $("editSwitch").onclick = () => { ui.editing = !ui.editing; render(); };
  $("resetBtn").onclick = () => {
    if (!confirm("이 문서에서 고친 표시·설명·메모를 모두 처음 상태로 돌릴까요?")) return;
    state[ui.doc] = freshDocState(docById(ui.doc)); save(); render();
  };
  $("expandAll").onclick = () => {
    const ids = [...article.querySelectorAll(".box")].map((b) => b.dataset.id);
    if (allOpen()) ids.forEach((id) => openIds.delete(id)); else ids.forEach((id) => openIds.add(id));
    render();
  };
  $("printBtn").onclick = () => { article.querySelectorAll(".box").forEach((b) => (b.open = true)); setTimeout(() => window.print(), 50); };
  const setBarH = () => document.documentElement.style.setProperty("--bar-h", `${$("bar").offsetHeight}px`);
  new ResizeObserver(setBarH).observe($("bar"));


  // ── 내보내기·불러오기: 고친 표시·설명·메모는 브라우저에만 저장되므로 파일로 백업한다 ──
  $("exportBtn").onclick = () => {
    const userDocs = DOCS.filter((d) => userDocIds.has(d.id));
    const blob = new Blob([JSON.stringify({ app: "notelayer", version: 1, savedAt: new Date().toISOString(), state, userDocs }, null, 2)], { type: "application/json" });
    const a = el("a"); a.href = URL.createObjectURL(blob); a.download = `notelayer-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $("importBtn").onclick = () => $("importFile").click();
  $("importFile").onchange = async (e) => {
    const file = e.target.files[0]; e.target.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== "notelayer" || !data.state) throw new Error("notelayer 백업 파일이 아닙니다");
      for (const d of data.userDocs ?? []) {
        if (!d?.id || !Array.isArray(d.blocks) || DOCS.some((x) => x.id === d.id)) continue;
        DOCS.push(d); userDocIds.add(d.id); state[d.id] = freshDocState(d);
      }
      for (const [id, s] of Object.entries(data.state)) if (state[id] && s?.ann) state[id] = s;
      saveUserDocs(); save(); fillDocSelect(); render();
    } catch (err) { alert(`불러오지 못했습니다: ${err.message}`); }
  };

  // ── 내가 넣은 문서 지우기 (예시 문서는 지울 수 없다) ──
  $("deleteDocBtn").onclick = () => {
    const d = docById(ui.doc);
    if (!userDocIds.has(d.id) || !confirm(`「${d.title}」 문서와 그 위의 표시·메모를 지울까요?`)) return;
    DOCS.splice(DOCS.indexOf(d), 1); userDocIds.delete(d.id); delete state[d.id];
    ui.doc = DOCS[0].id; ui.tpl = DOCS[0].templates[0];
    saveUserDocs(); save(); fillDocSelect(); render();
  };

  // ── 바깥(import.js)에서 쓰는 창구: 새 문서 넣기, LLM 이 만든 표시·설명 얹기 ──
  function addDocument({ title, lang, source, paragraphs, translations }) {
    const blocks = paragraphs.map((text, i) => ({ p: i + 1, text, ...(translations?.[i] ? { tr: translations[i] } : {}) }));
    if (!blocks.length) throw new Error("본문이 비어 있습니다");
    const doc = { id: `my-${uid()}`, title: title || "제목 없는 문서", lang: lang || "ko", source: source || "내가 넣은 문서",
      templates: Object.keys(TEMPLATES), blocks, memos: [], annotations: {} };
    DOCS.push(doc); userDocIds.add(doc.id); state[doc.id] = freshDocState(doc);
    ui.doc = doc.id;
    saveUserDocs(); save(); fillDocSelect(); render();
    return doc;
  }
  // LLM 답을 지금 문서·템플릿에 얹는다. 내가 단 표시와 사람이 쓴 설명은 남기고 AI 것만 바꾼다
  function applyAnnotations(result) {
    const { d, tpl, ann } = cur();
    const paras = new Map(d.blocks.map((b) => [b.p, b.text]));
    const marks = [], lost = [];
    for (const m of Array.isArray(result.marks) ? result.marks : []) {
      const p = Number(m?.p), quote = typeof m?.quote === "string" ? m.quote : "";
      if (!paras.has(p) || !["circle", "highlight", "wave"].includes(m.kind) || !quote) continue;
      if (!paras.get(p).includes(quote)) { lost.push(quote); continue; }
      marks.push({ id: uid(), p, kind: m.kind, quote });
    }
    const labels = Object.keys(tpl.boxes);
    const boxes = [];
    for (const b of Array.isArray(result.boxes) ? result.boxes : []) {
      const p = Number(b?.p);
      if (!paras.has(p) || typeof b?.text !== "string" || !b.text.trim()) continue;
      const box = { id: uid(), p, label: labels.includes(b.label) ? b.label : labels[0], text: b.text.trim() };
      if (typeof b.pre === "string" && b.pre.trim()) box.pre = b.pre;
      if (typeof b.answer === "string" && b.answer.trim()) box.answer = b.answer.trim();
      boxes.push(box);
    }
    ann.marks = [...ann.marks.filter((m) => m.by === "me"), ...marks];
    ann.boxes = [...ann.boxes.filter((b) => b.by && b.by !== "ai"), ...boxes];
    let translated = 0;
    if (userDocIds.has(d.id) && Array.isArray(result.translations)) {
      for (const t of result.translations) {
        const b = d.blocks.find((x) => x.p === Number(t?.p));
        if (b && typeof t.text === "string" && t.text.trim()) { b.tr = t.text.trim(); translated++; }
      }
      saveUserDocs();
    }
    save(); render();
    return { marks: marks.length, lost, boxes: boxes.length, translated };
  }
  window.NL = {
    addDocument, applyAnnotations,
    current: () => { const { d, tpl, ann } = cur(); return { doc: d, templateId: ui.tpl, template: tpl, aiMarks: ann.marks.filter((m) => m.by !== "me").length, isUserDoc: userDocIds.has(d.id) }; },
  };

  render();
  window.dispatchEvent(new Event("notelayer-ready"));
}

// 문서 파일들을 차례로 읽은 다음 시작한다. 스크립트 태그로 읽으므로 파일을 바로 열어도(file://) 동작한다.
(function load() {
  window.NL_DOCS = window.NL_DOCS || [];
  const files = (window.NL_DOCUMENT_FILES || []).slice();
  const next = () => {
    const f = files.shift();
    if (!f) {
      if (!window.NL_DOCS.length) { document.getElementById("doc").textContent = "documents/manifest.js 에 문서가 없습니다."; return; }
      startNotelayer();
      return;
    }
    const s = document.createElement("script");
    s.src = "documents/" + f;
    s.onload = next;
    s.onerror = () => { console.warn("문서를 읽지 못함:", f); next(); };
    document.head.appendChild(s);
  };
  next();
})();
