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
    for (const [t, a] of Object.entries(d.annotations)) ann[t] = { marks: withIds(a.marks), boxes: withIds(a.boxes), outline: a.outline ? structuredClone(a.outline) : null, concepts: a.concepts ? structuredClone(a.concepts) : null };
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
  const ui = { doc: DOCS[0].id, tpl: DOCS[0].templates[0], editing: false, summary: false, focus: null, sumTab: "concepts", concept: null, layers: { marks: true, boxes: true, mine: true, tr: true } };
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
    box.dataset.label = b.label; // 본문 강조에서 설명 종류로 고를 때 쓴다
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
    // 템플릿 고르기: 지금 문서에 맞는 템플릿만 보여 준다
    const tplSel = $("tplSelect");
    tplSel.replaceChildren(...d.templates.map((id) => { const o = el("option", null, TEMPLATES[id].name); o.value = id; return o; }));
    tplSel.value = ui.tpl;
    tplSel.disabled = d.templates.length < 2;
    tplSel.title = tplSel.disabled ? "이 예시 문서에는 이 템플릿 하나만 맞습니다" : "";
    const hasTr = d.blocks.some((b) => b.tr);
    $("layerTr").disabled = !hasTr;
    $("trLabel").classList.toggle("off", !hasTr);
    $("trLabel").title = hasTr ? "" : "이 문서는 번역할 필요가 없는 한국어 문서입니다";
    $("editSwitch").setAttribute("aria-checked", String(ui.editing));

    if (ui.focus?.startsWith("box:") && !tpl.boxes[ui.focus.slice(4)]) ui.focus = null;
    if (ui.concept && !conceptData().nodes.some((n) => n.id === ui.concept)) { ui.concept = null; if (ui.focus?.startsWith("concept:")) ui.focus = null; }
    // 출처와 범례: 모양의 뜻은 고정, 이름만 템플릿이 정한다
    $("meta").textContent = `원문: ${d.source} · 원문은 고치지 않고 그 위에 층만 얹는다`;
    const legend = $("legend");
    legend.replaceChildren(el("div", "reader", `${tpl.name} · 읽는 사람: ${tpl.reader} · ${tpl.rules.join(" · ")}`));
    const sumBtn = el("button", "k sum-open", "요약 보기");
    sumBtn.title = "핵심 문장을 구조화한 요약을 오른쪽에 열기";
    sumBtn.onclick = () => { ui.summary = !ui.summary; renderSummary(); };
    legend.append(sumBtn);
    for (const [kind, cls, name] of [["circle", "sw-circle", tpl.marks.circle], ["highlight", "sw-hl", tpl.marks.highlight],
      ["wave", "sw-wave", tpl.marks.wave], ["mine", "sw-mine", "내 메모"]]) {
      const k = el("button", "k");
      k.dataset.kind = kind;
      k.title = "본문에서 이 종류만 또렷하게 보기 (다시 누르면 해제)";
      k.append(el("span", cls), el("span", null, name), el("span", "count"));
      k.onclick = () => focusKind(kind);
      legend.append(k);
    }
    // 설명 상자 종류도 같은 방식으로 모아 본다
    const boxRow = el("div", "boxrow");
    boxRow.append(el("span", "count", "설명"));
    for (const [label, color] of Object.entries(tpl.boxes)) {
      const k = el("button", "k");
      k.dataset.kind = `box:${label}`;
      k.title = "본문에서 이 설명만 또렷하게 보기 (다시 누르면 해제)";
      const dot = el("span", "dot"); dot.style.background = color;
      k.append(dot, el("span", null, label), el("span", "count"));
      k.onclick = () => focusKind(k.dataset.kind);
      boxRow.append(k);
    }
    legend.append(boxRow);
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
    // 본문 강조: 범례에서 고른 종류만 또렷하게 남기고, 나머지 글·표시·설명은 흐리게 한다
    const f = ui.focus;
    const shows = (kind) => !f || f === kind;
    if (supportsHighlight) {
      CSS.highlights.clear();
      if (shows("highlight")) CSS.highlights.set("mk-hl", new Highlight(...ranges.highlight));
      if (shows("wave")) CSS.highlights.set("mk-wave", new Highlight(...ranges.wave));
      if (shows("mine")) CSS.highlights.set("mk-mine", new Highlight(...mine));
      if (selLoc) CSS.highlights.set("mk-sel", new Highlight(toRange(selLoc)));
      const focused = f === "mine" ? mine : f?.startsWith("concept:") ? conceptRanges(f.slice(8)) : ranges[f] ?? [];
      if (f) CSS.highlights.set("mk-focus", new Highlight(...focused));
      if (f?.startsWith("concept:")) CSS.highlights.set("mk-concept", new Highlight(...focused));
    }
    circleRanges = shows("circle") ? ranges.circle : [];
    article.classList.toggle("focus-mode", !!f);
    for (const box of article.querySelectorAll(".box")) {
      const on = f === "mine" ? box.classList.contains("mine") : f?.startsWith("box:") && !box.classList.contains("mine") && box.dataset.label === f.slice(4);
      box.classList.toggle("dim", !!f && !on);
    }
    $("orphans").textContent = (orphans.length ? `원래 자리를 못 찾은 표시: ${orphans.join(", ")}` : "")
      + (supportsHighlight ? "" : " 이 브라우저는 형광펜 기능을 지원하지 않아 동그라미만 보입니다.");
    queueDraw();
    renderSummary();
  }

  // ── 범례 누르기 = 본문 강조 켜고 끄기 ──
  function countKind(kind) {
    const { st, ann } = cur();
    if (kind.startsWith("box:")) return ui.layers.boxes ? ann.boxes.filter((b) => b.label === kind.slice(4)).length : 0;
    if (kind === "mine") return ui.layers.mine ? st.memos.length : 0;
    return visibleMarks(ann).filter((m) => m.kind === kind).length;
  }
  function focusKind(kind) {
    ui.focus = ui.focus === kind ? null : kind;
    ui.concept = null;
    paintMarks();
    // 고른 종류의 첫 자리가 화면 밖이면 그쪽으로 옮긴다
    const first = ui.focus && firstFocusedTop();
    if (first != null && (first < 0 || first > innerHeight - 80)) scrollTo({ top: first + scrollY - innerHeight / 3, behavior: "smooth" });
  }
  function firstFocusedTop() {
    const f = ui.focus;
    if (f.startsWith("concept:")) {
      const tops = conceptRanges(f.slice(8)).map((r) => r.getBoundingClientRect().top);
      return tops.length ? Math.min(...tops) : null;
    }
    if (f.startsWith("box:") || f === "mine") return article.querySelector(".box:not(.dim)")?.getBoundingClientRect().top ?? null;
    const { ann } = cur();
    const m = visibleMarks(ann).filter((x) => x.kind === f).map((x) => locate(x.p, x.quote, x.at)).filter(Boolean)
      .sort((a, b) => a.node.parentElement.dataset.p - b.node.parentElement.dataset.p || a.start - b.start)[0];
    return m ? toRange(m).getBoundingClientRect().top : null;
  }

  // ── 오른쪽 요약: 원문 문장 그대로, 묶음과 순서는 이해하기 쉽게, 꼭 필요한 문장만 ──
  // 추가 설명은 본문의 설명 상자(LLM)가 맡고, 요약은 구조와 핵심만 보여 준다.
  // 요약 구조(outline)가 있으면 그 묶음·순서를 따르고, 없으면 핵심어마다 묶음을 만든다.
  // 문장 나누기: 마침표·물음표·느낌표 뒤에 빈칸이 오거나 문단이 끝나는 곳. "HTTP/1.1" 처럼 뒤에 글자가 붙은 점은 넘긴다
  function sentencesOf(text) {
    const out = [];
    let start = 0;
    for (let i = 0; i < text.length; i++) {
      if (!/[.!?。]/.test(text[i])) continue;
      let j = i + 1;
      while (j < text.length && /["'”’)\]]/.test(text[j])) j++;
      if (j < text.length && !/\s/.test(text[j])) continue;
      out.push([start, j]);
      while (j < text.length && /\s/.test(text[j])) j++;
      start = j; i = j - 1;
    }
    if (start < text.length && text.slice(start).trim()) out.push([start, text.length]);
    return out;
  }
  function sentenceAt(p, offset) {
    const b = cur().d.blocks.find((x) => x.p === p);
    if (!b) return null;
    const s = sentencesOf(b.text).find(([a, z]) => offset >= a && offset < z);
    return s ? { p, start: s[0], end: s[1], key: `${p}:${s[0]}`, text: b.text.slice(s[0], s[1]) } : null;
  }
  const byDoc = (a, b) => a.p - b.p || a.start - b.start;

  function buildSummary() {
    const { d, ann } = cur();
    // 요약에 쓰는 표시는 핵심어와 외울 문장(꼭 필요한 것)뿐. 확인 필요·메모는 본문에서 본다
    const marks = visibleMarks(ann).filter((m) => m.kind === "circle" || m.kind === "highlight")
      .map((m) => ({ m, loc: locate(m.p, m.quote, m.at) })).filter((x) => x.loc);
    const used = new Set();
    const take = (s) => { if (!s || used.has(s.key)) return null; used.add(s.key); return s; };
    const candidates = [];
    for (const x of marks) {
      const s = sentenceAt(x.m.p, x.loc.start);
      if (s && !candidates.some((c) => c.key === s.key)) candidates.push(s);
    }
    candidates.sort(byDoc);
    const sections = [];
    const outline = ann.outline ?? d.annotations?.[ui.tpl]?.outline;
    if (Array.isArray(outline) && outline.length) {
      for (const sec of outline) {
        const items = [];
        for (const it of sec.items ?? []) {
          const loc = locate(it.p, it.quote);
          const s = loc && take(sentenceAt(it.p, loc.start));
          if (s) items.push(s);
        }
        if (items.length) sections.push({ title: sec.title, items });
      }
      const rest = candidates.filter((s) => !used.has(s.key)).map(take);
      if (rest.length) sections.push({ title: "그 밖의 핵심", items: rest });
      return { sections, marks, source: "outline" };
    }
    // 구조가 없을 때: 핵심어(동그라미)가 처음 나오는 순서대로 묶음을 만든다.
    // 먼저 핵심어마다 자기 동그라미가 있는 문장을 배정하고, 남은 문장은 처음 언급한 핵심어 묶음에 넣는다
    const seen = new Set();
    const groups = [];
    const keywords = marks.filter((x) => x.m.kind === "circle").sort((a, b) => a.m.p - b.m.p || a.loc.start - b.loc.start);
    for (const k of keywords) {
      const word = k.m.quote.toLowerCase();
      if (seen.has(word)) continue;
      seen.add(word);
      const own = take(sentenceAt(k.m.p, k.loc.start));
      groups.push({ title: k.m.quote, word, items: own ? [own] : [] });
    }
    for (const s of candidates) {
      if (used.has(s.key)) continue;
      const g = groups.find((x) => s.text.toLowerCase().includes(x.word));
      if (g) g.items.push(take(s));
    }
    for (const g of groups) if (g.items.length) sections.push({ title: g.title, items: g.items.sort(byDoc) });
    const rest = candidates.filter((s) => !used.has(s.key)).map(take);
    if (rest.length) sections.push({ title: sections.length ? "그 밖의 핵심" : "핵심", items: rest });
    return { sections, marks, source: "auto" };
  }

  // 요약 안의 문장: 원문 글자 그대로. 핵심어는 굵게, 외울 문장은 옅은 형광펜만
  function sentenceEl(s, marks) {
    const ranges = [];
    for (const x of marks) if (x.m.p === s.p && x.loc.end > s.start && x.loc.start < s.end) ranges.push([Math.max(x.loc.start, s.start), Math.min(x.loc.end, s.end), x.m.kind]);
    const cuts = [...new Set([s.start, s.end, ...ranges.flatMap(([a, z]) => [a, z])])].sort((a, b) => a - b);
    const text = cur().d.blocks.find((b) => b.p === s.p).text;
    const li = el("li", "sent");
    for (let i = 0; i < cuts.length - 1; i++) {
      const [a, z] = [cuts[i], cuts[i + 1]];
      const on = ranges.filter(([ra, rz]) => ra <= a && z <= rz).map((r) => r[2]);
      const piece = text.slice(a, z);
      li.append(on.length ? el("span", on.map((k) => `k-${k}`).join(" "), piece) : document.createTextNode(piece));
    }
    li.title = "눌러서 본문의 그 자리로";
    li.onclick = () => jumpTo(s.p, s.start, s.end);
    return li;
  }

  function renderSummary() {
    const side = $("side");
    const { tpl } = cur();
    for (const k of document.querySelectorAll(".legend button.k[data-kind]")) {
      k.querySelector(".count").textContent = String(countKind(k.dataset.kind));
      k.setAttribute("aria-pressed", String(ui.focus === k.dataset.kind));
    }
    document.querySelector(".legend .sum-open")?.setAttribute("aria-pressed", String(ui.summary));
    document.body.classList.toggle("side-open", ui.summary);
    if (!ui.summary) { side.hidden = true; return; }
    side.hidden = false;

    const header = el("header");
    const close = el("button", "close", "×");
    close.title = "닫기";
    close.onclick = () => { ui.summary = false; clearConcept(); renderSummary(); };
    const title = el("div", "sum-title");
    title.append(el("strong", null, "요약"), el("span", null, tpl.name));
    header.append(title, close);
    // 탭: 개념(구조도) · 설명(글머리표)
    const tabs = el("div", "sum-tabs");
    for (const [id, label] of [["concepts", "개념"], ["explain", "설명"]]) {
      const t = el("button", "sum-tab", label);
      t.setAttribute("aria-selected", String(ui.sumTab === id));
      t.onclick = () => { ui.sumTab = id; if (id !== "concepts") clearConcept(); renderSummary(); };
      tabs.append(t);
    }
    const body = el("div", "sum-body");
    if (ui.sumTab === "concepts") renderConcepts(body); else renderExplain(body);
    side.replaceChildren(header, tabs, body);
  }

  // ── 설명 탭: 번호 묶음 아래 원문 문장 글머리표 ──
  function renderExplain(body) {
    const { sections, marks } = buildSummary();
    if (!sections.length) { body.append(el("p", "empty", "핵심어나 외울 문장을 표시하면 여기에 구조화된 요약이 생깁니다.")); return; }
    const list = el("ol", "sum-list");
    for (const sec of sections) {
      const li = el("li", "sum-sec");
      const ul = el("ul");
      for (const s of sec.items) ul.append(sentenceEl(s, marks));
      li.append(el("h3", null, sec.title), ul);
      list.append(li);
    }
    body.append(list, el("p", "sum-foot", "문장은 원문 그대로입니다. 누르면 본문의 그 자리로 갑니다."));
  }

  // ── 개념 탭: 개념 구조도 ──
  // 데이터: { topic, nodes: [{ id, term, role, parent, def: { p, quote }, match: [본문에서 찾을 낱말] }], links: [{ from, to, label }] }
  // 개념 이름·역할·관계는 LLM(또는 사람)이 정한 것이고, 정의 문장(def)만 원문 그대로다.
  function conceptData() {
    const { d, ann } = cur();
    const c = ann.concepts ?? d.annotations?.[ui.tpl]?.concepts;
    if (c?.nodes?.length) return { ...c, source: "data" };
    // 관계 정보가 없으면 핵심어(동그라미)를 주제 아래에 나란히 둔다
    const seen = new Set();
    const nodes = [];
    for (const m of visibleMarks(ann).filter((x) => x.kind === "circle")) {
      const key = m.quote.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      nodes.push({ id: `k${nodes.length}`, term: m.quote, role: "", parent: null, def: { p: m.p, quote: m.quote }, match: [m.quote] });
    }
    return { topic: d.title, nodes, links: [], source: "auto" };
  }
  // 고친 개념 구조는 이 문서·템플릿의 상태에 따로 저장한다
  function editableConcepts() {
    const { ann } = cur();
    if (!ann.concepts) { const { source, ...rest } = conceptData(); ann.concepts = structuredClone(rest); }
    return ann.concepts;
  }
  function clearConcept() {
    if (ui.concept) { ui.concept = null; if (ui.focus?.startsWith("concept:")) ui.focus = null; paintMarks(); }
  }
  function selectConcept(id) {
    const on = ui.concept !== id;
    ui.concept = on ? id : null;
    ui.focus = on ? `concept:${id}` : null; // 본문에서 그 개념이 나오는 자리만 또렷하게
    paintMarks();
    if (on) { const top = firstFocusedTop(); if (top != null && (top < 0 || top > innerHeight - 80)) scrollTo({ top: top + scrollY - innerHeight / 3, behavior: "smooth" }); }
  }
  // 본문에서 개념 낱말이 나오는 모든 자리
  function conceptRanges(id) {
    const n = conceptData().nodes.find((x) => x.id === id);
    if (!n) return [];
    const words = (n.match?.length ? n.match : [n.term]).filter((w) => w && w.length > 1);
    const out = [];
    for (const p of article.querySelectorAll("p[data-p]")) {
      const node = p.firstChild;
      if (!node || node.nodeType !== Node.TEXT_NODE) continue;
      const lower = node.data.toLowerCase();
      for (const w of words) {
        const wl = w.toLowerCase();
        for (let i = lower.indexOf(wl); i >= 0; i = lower.indexOf(wl, i + wl.length)) out.push(toRange({ node, start: i, end: i + w.length }));
      }
    }
    return out;
  }
  function descendants(nodes, id) {
    const out = new Set([id]);
    let grew = true;
    while (grew) { grew = false; for (const n of nodes) if (n.parent && out.has(n.parent) && !out.has(n.id)) { out.add(n.id); grew = true; } }
    return out;
  }
  function renderConcepts(body) {
    const c = conceptData();
    if (!c.nodes.length) { body.append(el("p", "empty", "핵심어를 표시하거나 \"AI 표시 만들기\"로 개념 관계를 받으면 여기에 구조도가 생깁니다.")); return; }
    const ids = new Set(c.nodes.map((n) => n.id));
    const parentOf = (n) => (n.parent && ids.has(n.parent) && n.parent !== n.id ? n.parent : null);
    const map = el("div", "cmap");
    map.append(el("div", "cm-topic", c.topic || cur().d.title));
    const drawn = new Set();
    const branch = (pid) => {
      const ul = el("ul");
      for (const n of c.nodes.filter((x) => parentOf(x) === pid)) {
        if (drawn.has(n.id)) continue; // 관계가 꼬여 있어도 한 번만 그린다
        drawn.add(n.id);
        ul.append(nodeEl(n, c));
        const kids = branch(n.id);
        if (kids.childElementCount) ul.lastChild.append(kids);
      }
      return ul;
    };
    map.append(branch(null));
    // 관계가 꼬여 아무 데도 못 붙은 개념은 맨 아래에
    const lost = c.nodes.filter((n) => !drawn.has(n.id));
    if (lost.length) { const ul = el("ul"); for (const n of lost) ul.append(nodeEl(n, c)); map.append(ul); }
    body.append(map);
    body.append(el("p", "sum-foot", c.source === "auto"
      ? "개념 관계 정보가 없어 핵심어만 나란히 두었습니다. \"AI 표시 만들기\"로 관계(하위·동등·해결 등)를 받을 수 있습니다."
      : "개념 이름과 관계는 AI 가 정한 것이고, 정의 문장만 원문 그대로입니다. 개념을 누르면 본문에서 그 개념이 나오는 자리만 강조됩니다. 수정 모드에서 상위 개념과 역할을 바꿀 수 있습니다."));
  }
  function nodeEl(n, c) {
    const li = el("li");
    const row = el("div", "cm-row");
    const btn = el("button", `cm-node${ui.concept === n.id ? " sel" : ""}`);
    btn.append(el("span", "cm-term", n.term));
    if (n.role) btn.append(el("span", "cm-role", n.role));
    btn.onclick = () => selectConcept(n.id);
    row.append(btn);
    for (const l of (c.links ?? []).filter((x) => x.from === n.id)) {
      const to = c.nodes.find((x) => x.id === l.to);
      if (!to) continue;
      const chip = el("button", "cm-link", `${l.label} → ${to.term}`);
      chip.title = `「${to.term}」 으로 가기`;
      chip.onclick = () => selectConcept(to.id);
      row.append(chip);
    }
    li.append(row);
    if (ui.concept === n.id) {
      // 정의 문장(원문 그대로)
      const loc = n.def && locate(n.def.p, n.def.quote);
      const s = loc && sentenceAt(n.def.p, loc.start);
      if (s) {
        const def = el("div", "cm-def", s.text);
        def.title = "눌러서 본문의 그 자리로";
        def.onclick = () => jumpTo(s.p, s.start, s.end);
        li.append(def);
      }
      if (ui.editing) li.append(conceptEditor(n));
    }
    return li;
  }
  // 수정 모드: 고른 개념의 상위 개념과 역할을 바꾼다
  function conceptEditor(n) {
    const box = el("div", "cm-edit");
    const all = conceptData().nodes;
    const blocked = descendants(all, n.id);
    const sel = el("select");
    const top = el("option", null, "(맨 위 — 주제 바로 아래)"); top.value = ""; sel.append(top);
    for (const x of all) if (!blocked.has(x.id)) { const o = el("option", null, x.term); o.value = x.id; sel.append(o); }
    sel.value = n.parent && all.some((x) => x.id === n.parent) ? n.parent : "";
    sel.onchange = () => { const node = editableConcepts().nodes.find((x) => x.id === n.id); node.parent = sel.value || null; save(); renderSummary(); };
    const role = el("input"); role.value = n.role ?? ""; role.placeholder = "역할 (예: 문제, 해결책, 구성 요소)";
    role.onchange = () => { const node = editableConcepts().nodes.find((x) => x.id === n.id); node.role = role.value.trim(); save(); renderSummary(); };
    const l1 = el("label", null, "상위 개념"); l1.append(sel);
    const l2 = el("label", null, "역할"); l2.append(role);
    box.append(l1, l2);
    return box;
  }

  // Esc 로 본문 강조를 푼다(열린 창이 없을 때)
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && ui.focus && !document.querySelector("dialog[open]")) { ui.focus = null; ui.concept = null; paintMarks(); }
  });

  // 본문의 그 자리로 화면을 옮기고 잠깐 반짝인다
  let flashTimer = 0;
  function jumpTo(p, start, end) {
    const node = paraEl(p)?.firstChild;
    if (!node) return;
    const range = toRange({ node, start, end });
    const r = range.getBoundingClientRect();
    scrollTo({ top: r.top + scrollY - innerHeight / 3, behavior: "smooth" });
    if (supportsHighlight) {
      CSS.highlights.set("mk-flash", new Highlight(range));
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => CSS.highlights.delete("mk-flash"), 1600);
    }
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
  $("tplSelect").onchange = (e) => { ui.tpl = e.target.value; render(); };

  // "⋯" 메뉴: 보기(층·펼치기)와 파일(PDF·백업). 층은 여러 개를 연달아 바꿀 수 있게 열어 두고, 파일 동작은 누르면 닫는다
  const menu = $("moreMenu");
  const setMenu = (open) => { menu.hidden = !open; $("moreBtn").setAttribute("aria-expanded", String(open)); };
  $("moreBtn").onclick = (e) => { e.stopPropagation(); setMenu(menu.hidden); };
  document.addEventListener("click", (e) => { if (!menu.hidden && !e.composedPath().includes(menu)) setMenu(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") setMenu(false); });
  for (const id of ["printBtn", "exportBtn", "importBtn"]) $(id).addEventListener("click", () => setMenu(false));
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
    let outline = null;
    if (Array.isArray(result.outline)) {
      outline = result.outline.map((sec) => ({
        title: String(sec?.title ?? "").slice(0, 60),
        items: (Array.isArray(sec?.items) ? sec.items : []).map((it) => ({ p: Number(it?.p), quote: typeof it?.quote === "string" ? it.quote : "" }))
          .filter((it) => paras.has(it.p) && it.quote && paras.get(it.p).includes(it.quote)),
      })).filter((sec) => sec.title && sec.items.length);
    }
    ann.outline = outline?.length ? outline : null;
    let concepts = null;
    const rc = result.concepts;
    if (rc && Array.isArray(rc.nodes)) {
      const nodes = rc.nodes.filter((n) => n && (typeof n.id === "string" || typeof n.id === "number") && typeof n.term === "string" && n.term.trim())
        .map((n) => {
          const def = n.def && paras.has(Number(n.def.p)) && typeof n.def.quote === "string" && paras.get(Number(n.def.p)).includes(n.def.quote)
            ? { p: Number(n.def.p), quote: n.def.quote } : null;
          const match = (Array.isArray(n.match) ? n.match : []).filter((w) => typeof w === "string" && w.trim()).slice(0, 6);
          return { id: String(n.id), term: n.term.trim().slice(0, 60), role: typeof n.role === "string" ? n.role.trim().slice(0, 30) : "",
            parent: n.parent == null || n.parent === "" ? null : String(n.parent), def, match: match.length ? match : [n.term.trim()] };
        });
      const ids = new Set(nodes.map((n) => n.id));
      for (const n of nodes) if (n.parent && (!ids.has(n.parent) || n.parent === n.id)) n.parent = null;
      // 상위 개념이 돌고 도는 관계는 끊는다
      for (const n of nodes) { const seen = new Set([n.id]); let p = n.parent; while (p) { if (seen.has(p)) { n.parent = null; break; } seen.add(p); p = nodes.find((x) => x.id === p)?.parent; } }
      const links = (Array.isArray(rc.links) ? rc.links : []).map((l) => ({ from: String(l?.from), to: String(l?.to), label: String(l?.label ?? "").slice(0, 20) }))
        .filter((l) => ids.has(l.from) && ids.has(l.to) && l.from !== l.to && l.label);
      if (nodes.length) concepts = { topic: typeof rc.topic === "string" && rc.topic.trim() ? rc.topic.trim().slice(0, 80) : d.title, nodes, links };
    }
    ann.concepts = concepts;
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
    return { marks: marks.length, lost, boxes: boxes.length, translated, outline: ann.outline?.length ?? 0, concepts: ann.concepts?.nodes.length ?? 0 };
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
