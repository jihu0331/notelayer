// notelayer PDF 노트 — PDF 원본을 이 PC 에 보관하고, 원래 모양 그대로 펼쳐 그 위에 표시·설명·메모를 남긴다.
// - pdf.html          : 내 PDF 목록 (넣기·지우기·원본 내려받기·폴더 연결)
// - pdf.html?doc=<id> : 그 PDF 를 펼쳐 보기
// 표시를 다는 코드는 웹페이지 위 표시 층(overlay.js)을 그대로 쓴다. 이 화면이 하는 일은 셋이다.
//   1) PDF 를 웹페이지처럼 펼친다 — 쪽마다 원본 그림(canvas) 위에 투명한 글자 층(pdf.js textLayer)을 겹친다
//   2) 글자 층의 글자 조각을 줄 → 문단으로 묶어 표시 층에 문단 목록으로 넘긴다(요청문·표시 자리 찾기가 문단 단위다)
//   3) 저장은 저장 창을 띄우지 않고 같은 주소의 저장 코드(storage.js)를 바로 부른다. 기록은 저장 창 목록에도 함께 보인다
(() => {
  const S = window.NL_STORAGE;
  // 문서 넣기 화면(import.js)과 같은 판의 pdf.js 를 쓴다
  // 이 판(3.11)은 조작된 글꼴이 든 PDF 를 열면 그 안의 코드가 실행되는 취약점(CVE-2024-4367)이 있다. 모든 getDocument 에
  // isEvalSupported: false 를 넣어 막는다(공식 권고). 코드가 실행되면 이 주소에 저장한 다른 메모까지 읽힐 수 있다
  const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
  const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const $ = (id) => document.getElementById(id);
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k.startsWith("on")) n.addEventListener(k.slice(2), v); else if (k === "class") n.className = v; else n.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) n.append(kid instanceof Node ? kid : String(kid));
    return n;
  };
  const keyOf = (id) => `${location.origin}${location.pathname}?doc=${encodeURIComponent(id)}`;
  const fmt = (t) => new Date(t).toLocaleString();
  const size = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);
  const bc = "BroadcastChannel" in window ? new BroadcastChannel("notelayer-store") : null; // 열려 있는 저장 창에 폴더 변경을 알린다

  function loadScript(src) {
    return new Promise((ok, no) => {
      if (document.querySelector(`script[src="${src}"]`)) { ok(); return; }
      const s = document.createElement("script");
      s.src = src; s.onload = ok; s.onerror = () => no(new Error(`${src} 를 불러오지 못했습니다`));
      document.head.appendChild(s);
    });
  }
  async function pdfjs() {
    await loadScript(PDFJS);
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    return window.pdfjsLib;
  }
  function download(blob, name) {
    const a = el("a", { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  const params = new URLSearchParams(location.search);
  const docId = params.get("doc");
  // 예시: 저장소의 예시 문서 본문으로 만든 PDF 에, 같은 문서에 들어 있는 표시·설명·요약을 얹어 보여 준다
  const SAMPLES = {
    "http-vs-http2": { pdf: "docs/sample-http2.pdf", name: "HTTP-1.1과 HTTP-2 (notelayer 예시).pdf", doc: "documents/http-vs-http2.js", tpl: "tech" },
  };
  if (docId) openDoc(docId); else showLibrary();

  // ═══════════════ 목록 화면 ═══════════════
  function status(text, err = false) { $("status").className = err ? "muted err" : "muted ok"; $("status").textContent = text; }

  // 문서 id = 파일 이름 조각 + 내용 지문(SHA-256 앞 10자). 같은 PDF 를 두 번 넣으면 같은 id 라 겹치지 않고,
  // 다른 PC 에서 같은 폴더를 연결해도 같은 이름으로 찾는다
  async function idFor(name, buf) {
    const hex = [...new Uint8Array(await crypto.subtle.digest("SHA-256", buf))].map((b) => b.toString(16).padStart(2, "0")).join("");
    const slug = name.replace(/\.pdf$/i, "").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "pdf";
    return `${slug}-${hex.slice(0, 10)}`;
  }
  async function addFile(file) {
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") throw new Error(`${file.name}: PDF 파일만 넣을 수 있습니다`);
    const buf = await file.arrayBuffer();
    const id = await idFor(file.name, buf);
    if (await S.getPdf(id)) return { id, dup: true };
    let pages = 0;
    try {
      const lib = await pdfjs();
      const pdf = await lib.getDocument({ data: new Uint8Array(buf.slice(0)), isEvalSupported: false }).promise; // 일꾼에게 넘기면 원본 버퍼가 비워지므로 사본을 준다
      pages = pdf.numPages;
      pdf.destroy();
    } catch (err) {
      throw new Error(`${file.name}: PDF 를 읽지 못했습니다(${err?.message || err})`);
    }
    const blob = new Blob([buf], { type: "application/pdf" });
    await S.putPdf({ id, name: file.name, size: file.size, pages, addedAt: Date.now(), blob });
    let inFolder = false;
    const { dir } = await S.folder();
    if (dir) try { await S.writeBlob(dir, S.pdfFileName(id), blob); inFolder = true; } catch {}
    return { id, inFolder };
  }
  async function addFiles(files) {
    const done = [], errs = [];
    status(`PDF ${files.length}개를 넣는 중…`);
    for (const f of files) {
      try { const r = await addFile(f); done.push(r); } catch (err) { errs.push(err.message); }
    }
    const added = done.filter((r) => !r.dup).length, dup = done.length - added;
    status([added ? `PDF ${added}개를 넣었습니다${done.some((r) => r.inFolder) ? "(연결한 폴더에도 원본을 저장)" : ""}.` : "",
      dup ? `이미 있는 PDF ${dup}개는 건너뛰었습니다.` : "", ...errs].filter(Boolean).join(" "), !added && errs.length > 0);
    await renderList();
    if (files.length === 1 && added === 1) location.href = `pdf.html?doc=${encodeURIComponent(done[0].id)}`;
  }

  async function openSample() {
    const key = "http-vs-http2", s = SAMPLES[key];
    status("예시 PDF 를 여는 중…");
    try {
      const r = await fetch(s.pdf);
      if (!r.ok) throw new Error(`예시 PDF 를 받지 못했습니다(${r.status})`);
      const { id } = await addFile(new File([await r.blob()], s.name, { type: "application/pdf" }));
      location.href = `pdf.html?doc=${encodeURIComponent(id)}&sample=${key}`;
    } catch (err) { status(err.message, true); }
  }
  // 예시로 연 PDF 에 아직 기록이 없으면 예시 문서의 표시·설명·요약을 적용한다(적용하면 보통 기록처럼 저장된다)
  async function applySample(key) {
    const s = SAMPLES[key];
    if (!s) return;
    for (let i = 0; i < 40 && !window.NL_OVERLAY?.info().store; i++) await new Promise((ok) => setTimeout(ok, 150));
    const ov = window.NL_OVERLAY;
    if (!ov || ov.info().marks || ov.info().boxes) return;
    await loadScript(s.doc);
    const doc = window.NL_DOCS?.[window.NL_DOCS.length - 1];
    const ann = doc?.annotations?.[s.tpl];
    if (!ann) return;
    ov.useTemplate(s.tpl);
    ov.apply(JSON.stringify(ann));
    history.replaceState(null, "", `pdf.html?doc=${encodeURIComponent(docId)}`);
  }

  async function showLibrary() {
    $("lib").hidden = false;
    $("pickBtn").onclick = () => $("pickFile").click();
    $("sampleBtn").onclick = openSample;
    $("pickFile").onchange = (e) => { const fs = [...e.target.files]; e.target.value = ""; if (fs.length) addFiles(fs); };
    const drop = $("drop");
    drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("over"));
    drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); const fs = [...e.dataTransfer.files]; if (fs.length) addFiles(fs); });
    bc?.addEventListener("message", (e) => { if (e.data?.type === "folder") refresh(); });
    window.addEventListener("focus", refresh);
    await refresh();
  }
  async function refresh() { await renderFolder(); await renderList(); }

  async function renderFolder() {
    const f = await S.folder().catch(() => ({ dir: null, state: "none", name: "" }));
    const btns = [];
    if (!S.canFolder) {
      $("folderBody").textContent = "이 브라우저는 폴더에 직접 쓰는 기능이 없습니다(크롬·엣지에서 됩니다). PDF 와 기록은 이 브라우저 안에만 저장됩니다.";
    } else if (f.state === "none") {
      $("folderBody").textContent = "폴더를 한 번 고르면 PDF 원본과 기록을 그 폴더에도 파일로 씁니다(pdf-….pdf 와 pdf-….notelayer.json). 브라우저 기록을 지워도 남고, OneDrive·구글 드라이브 같은 동기화 폴더에 두면 다른 PC 에서 같은 폴더를 연결해 이어서 볼 수 있습니다. 웹페이지 위 표시하기의 저장 창과 같은 폴더를 씁니다.";
      btns.push(el("button", { class: "primary", onclick: pickFolder }, "폴더 고르기"));
    } else {
      const label = f.name ? `「${f.name}」` : "고른";
      $("folderBody").replaceChildren(el("span", { class: f.state === "granted" ? "ok" : "err" },
        f.state === "granted" ? `${label} 폴더에도 저장하고 있습니다.` : `${label} 폴더를 쓰려면 다시 허용해야 합니다(브라우저를 새로 열면 다시 묻습니다).`));
      if (f.state !== "granted") btns.push(el("button", { class: "primary", onclick: async () => { await S.folder(true); await S.syncFolder(); folderChanged(); refresh(); } }, "폴더 다시 허용"));
      btns.push(el("button", { onclick: pickFolder }, "다른 폴더로 바꾸기"));
      btns.push(el("button", { onclick: async () => { await S.delMeta("dir"); folderChanged(); refresh(); } }, "연결 끊기"));
    }
    $("folderBtns").replaceChildren(...btns);
  }
  function folderChanged() { try { bc?.postMessage({ type: "folder" }); } catch {} }
  async function pickFolder() {
    status("폴더 고르는 창을 여는 중… (안 보이면 다른 창 뒤에 열렸을 수 있습니다)");
    try {
      const dir = await window.showDirectoryPicker({ id: "notelayer", mode: "readwrite" });
      await S.putMeta("dir", dir);
      const f = await S.folder(true);
      await S.syncFolder();
      status(f.state === "granted" ? `「${dir.name}」 폴더를 연결했습니다. 이 브라우저에 있던 PDF 와 기록도 그 폴더에 썼습니다.` : "폴더에 쓰기 허락을 받지 못했습니다. 「폴더 다시 허용」을 눌러 주세요.", f.state !== "granted");
      folderChanged();
    } catch (err) {
      status(err?.name === "AbortError"
        ? "폴더 고르기가 취소됐습니다. 바탕 화면·다운로드처럼 크롬이 통째로 막는 폴더를 골랐다면, 그 안의 폴더(예: 문서\\notelayer)를 고르세요."
        : `폴더를 연결하지 못했습니다: ${err?.message || err}`, true);
    }
    refresh();
  }

  async function renderList() {
    const docs = await S.allPdfs().catch(() => []);
    const recs = new Map((await S.allPages().catch(() => [])).map((r) => [r.key, r]));
    // 연결한 폴더에만 있는 PDF(다른 PC 에서 넣은 것)도 함께 보인다. 열면 이 브라우저로 가져온다
    const { dir } = await S.folder().catch(() => ({ dir: null }));
    const known = new Set(docs.map((d) => S.pdfFileName(d.id)));
    const folderOnly = [];
    if (dir) {
      for (const name of await S.listNames(dir)) {
        const m = /^pdf-(.+)\.pdf$/.exec(name);
        if (!m || known.has(name)) continue;
        const rec = recs.get(keyOf(m[1])) || await S.readFile(dir, keyOf(m[1]));
        folderOnly.push({ id: m[1], name: rec?.title || `${m[1]}.pdf`, rec });
      }
    }
    const items = [...docs.sort((a, b) => (b.openedAt || b.addedAt) - (a.openedAt || a.addedAt)).map((d) => ({ ...d, rec: recs.get(keyOf(d.id)) })),
      ...folderOnly.map((d) => ({ ...d, folderOnly: true }))];
    $("count").textContent = items.length ? `${items.length}개` : "";
    $("list").replaceChildren(...(items.length ? items.map((d) => {
      const c = S.counts(d.rec?.data);
      const meta = d.folderOnly ? ["연결한 폴더에만 있음 — 열면 이 브라우저로 가져옵니다"]
        : [`${d.pages}쪽`, size(d.size), `넣은 날 ${fmt(d.addedAt)}`];
      if (d.rec) meta.push(`표시 ${c.marks} · 설명 ${c.boxes}`, `저장 ${fmt(d.rec.savedAt)}`);
      return el("li", {},
        el("div", { class: "grow" },
          el("a", { class: "name", href: `pdf.html?doc=${encodeURIComponent(d.id)}`, title: d.name }, d.name),
          el("div", { class: "muted" }, meta.join(" · "))),
        d.folderOnly ? null : el("button", { title: "원본 PDF 내려받기", onclick: () => download(d.blob, d.name) }, "⤓"),
        el("button", { title: "지우기", onclick: () => removeDoc(d) }, "✕"));
    }) : [el("li", { class: "muted" }, "아직 넣은 PDF 가 없습니다.")]));
  }
  async function removeDoc(d) {
    const { dir } = await S.folder();
    if (!confirm(`「${d.name}」 의 PDF 원본과 표시·설명 기록을 지울까요?${dir ? "\n연결한 폴더의 파일(PDF 원본·기록)도 함께 지웁니다." : ""}`)) return;
    await S.delPdf(d.id).catch(() => {});
    await S.handle({ type: "delete", key: keyOf(d.id) }).catch(() => {});
    if (dir) await S.removeEntry(dir, S.pdfFileName(d.id));
    status(`「${d.name}」 을 지웠습니다.`);
    renderList();
  }

  // ═══════════════ 펼쳐 보기 화면 ═══════════════
  async function openDoc(id) {
    $("viewer").hidden = false;
    const loading = (t, err = false) => { $("loading").hidden = false; $("loading").className = err ? "loading err" : "loading"; $("loading").textContent = t; };
    let rec = await S.getPdf(id).catch(() => null);
    if (!rec) {
      // 이 브라우저에는 없고 연결한 폴더에만 있으면 가져온다. 폴더 허락이 풀려 있으면 누르는 동작이 있어야 다시 허락을 물을 수 있다
      const f = await S.folder().catch(() => ({ dir: null, state: "none" }));
      if (f.state === "prompt") {
        loading("이 PDF 는 연결한 폴더에 있습니다. 폴더를 쓰려면 다시 허용해야 합니다.");
        $("loading").append(el("div", { class: "row" }, el("button", { class: "primary", onclick: async () => { await S.folder(true); location.reload(); } }, "폴더 다시 허용")));
        return;
      }
      const file = f.dir && await S.readBlob(f.dir, S.pdfFileName(id));
      if (file) {
        const saved = await S.readFile(f.dir, keyOf(id));
        rec = { id, name: saved?.title || `${id}.pdf`, size: file.size, pages: 0, addedAt: Date.now(), blob: new Blob([await file.arrayBuffer()], { type: "application/pdf" }) };
      }
    }
    if (!rec) {
      loading("이 PDF 를 찾지 못했습니다. 이 브라우저나 연결한 폴더에 없습니다.", true);
      $("loading").append(el("div", { class: "row" }, el("a", { href: "pdf.html" }, "← 내 PDF 목록으로")));
      return;
    }
    document.title = rec.name;
    $("docTitle").textContent = rec.name;
    $("barActions").replaceChildren(
      el("a", { class: "link", href: "pdf.html" }, "← 목록"),
      el("button", { title: "원본 PDF 내려받기", onclick: () => download(rec.blob, rec.name) }, "원본 내려받기"));

    let lib, pdf;
    try {
      lib = await pdfjs();
      pdf = await lib.getDocument({ data: new Uint8Array(await rec.blob.arrayBuffer()), isEvalSupported: false }).promise;
    } catch (err) {
      loading(`PDF 를 열지 못했습니다: ${err?.message || err}`, true);
      return;
    }
    await S.putPdf({ ...rec, pages: pdf.numPages, openedAt: Date.now() }).catch(() => {});

    const pagesEl = $("pages");
    const first = await pdf.getPage(1);
    const w1 = first.getViewport({ scale: 1 }).width;
    // 오른쪽 위 작은 창(약 330px) 자리를 남기고 폭을 정한다. 창 크기를 바꿔도 다시 그리지 않는다(표시 자리가 그대로 맞게)
    const avail = Math.max(480, Math.min(1000, innerWidth - 24 - 350));
    const scale = (innerWidth < 860 ? Math.max(320, innerWidth - 40) : avail) / w1;
    const paragraphs = [];
    const pages = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      loading(`쪽 펼치는 중… ${n}/${pdf.numPages}`);
      const page = n === 1 ? first : await pdf.getPage(n);
      const vp = page.getViewport({ scale });
      const W = Math.floor(vp.width), H = Math.floor(vp.height);
      const box = el("div", { class: "page", "data-page": String(n) });
      box.style.width = `${W}px`;
      box.style.height = `${H}px`;
      box.style.setProperty("--scale-factor", String(scale));
      const layer = el("div", { class: "textLayer" });
      box.append(layer, el("span", { class: "no" }, `${n} / ${pdf.numPages}`));
      pagesEl.append(box);
      const tc = await page.getTextContent();
      const textDivs = [];
      await lib.renderTextLayer({ textContentSource: tc, container: layer, viewport: vp, textDivs }).promise;
      layer.style.width = "100%"; layer.style.height = "100%"; // 문단을 아래로 밀어도 잘리지 않게 쪽 높이를 따라간다
      const paras = groupParagraphs(tc.items, textDivs, layer);
      const rec = { n, page, vp, W, H, box, layer, paras, holders: new Map(), segs: [], full: null, blank: null, drawn: false, task: null };
      // 아주 짧은 조각(한 글자 등)은 요청문 문단에서 빼지만, 아래로 밀 때는 함께 민다
      for (const p of paras) { if (!p.tiny) paragraphs.push({ p: paragraphs.length + 1, el: p.el, text: p.text }); paraPage.set(p.el, { rec, para: p }); }
      pages.push(rec);
      relayout(rec);
    }
    $("loading").hidden = true;
    watchCanvases(pages);

    if (!paragraphs.length) {
      loading("이 PDF 에서 글자를 찾지 못했습니다. 스캔한 PDF·사진처럼 글자가 그림으로만 된 문서에는 표시를 달 수 없습니다.", true);
      pagesEl.before($("loading"));
      return;
    }
    // 표시 층을 이 화면에 얹는다. 주소(key)는 이 PDF 노트 주소라, 저장 창 목록에도 같은 기록으로 보이고 누르면 여기로 돌아온다.
    // 설명·번역은 표시 층이 만들어 insertAfter 로 넘기고, 이 화면이 그 문단 아래를 벌려 자리를 만든다
    const key = keyOf(id);
    const changed = new Set();
    window.NL_HOST = {
      kind: "pdf", key, root: pagesEl, paragraphs, inline: true, compact: true,
      request: (msg) => (msg?.key === key ? S.handle(msg) : Promise.resolve({ type: "error", message: "다른 문서의 기록은 다루지 않습니다" })),
      insertAfter: (paraEl, node) => {
        const at = paraPage.get(paraEl);
        if (!at) return;
        let hd = at.rec.holders.get(paraEl);
        if (!hd) { hd = el("div", { class: "nl-hold" }); at.rec.box.append(hd); at.rec.holders.set(paraEl, hd); holdRec.set(hd, at.rec); holdRO.observe(hd); }
        hd.append(node);
        changed.add(at.rec);
      },
      // 표시 층이 설명·번역을 다시 그린 다음 부른다. 끼운 것이 있었거나 생긴 쪽만 다시 배치한다
      relayout: () => { for (const rec of pages) if (rec.holders.size || changed.has(rec)) relayout(rec); changed.clear(); },
    };
    try { await loadScript("overlay.js"); }
    catch (err) { loading(`표시 층을 불러오지 못했습니다: ${err.message}`, true); pagesEl.before($("loading")); return; }
    if (params.get("sample")) applySample(params.get("sample"));
  }

  // ── 문단 아래 벌리기 ──
  // 쪽 그림은 한 장으로 그려 두고, 끼울 내용(설명·번역)이 있는 문단 아래 「자를 줄」 에서 쪽을 가로로 나눈다.
  // 자른 아래쪽은 그림 조각과 글자 층 문단을 함께 끼운 높이만큼 아래로 민다. 글자 노드는 옮기지 않고 보이는 자리만 옮긴다
  // (글자를 다른 곳으로 옮기면 이미 단 표시의 글자 범위가 풀린다)
  const paraPage = new Map(); // 문단 요소 → { rec, para }
  const holdRec = new WeakMap(); // 끼운 자리 → 그 쪽
  // 끼운 내용의 높이가 바뀌면(설명을 고치는 중 등) 그 쪽을 다시 배치한다
  const holdRO = new ResizeObserver((entries) => {
    const recs = new Set(entries.map((e) => holdRec.get(e.target)).filter(Boolean));
    requestAnimationFrame(() => recs.forEach(relayout));
  });
  // 자를 줄: 문단 바로 아래에서 시작해, 다른 문단(두 단 문서의 옆 단 등)을 가로지르지 않고
  // 그림이 그려졌으면 그림·도표도 가로지르지 않는(한 줄이 고른 색인) 첫 줄. 없으면 쪽 끝
  function cutFor(rec, para) {
    const crosses = (y) => rec.paras.some((q) => q.top < y - 0.5 && y + 0.5 < q.bottom);
    for (let y = Math.ceil(para.bottom) + 1; y < rec.H; y++) {
      if (crosses(y)) continue;
      if (rec.blank && !rec.blank(y)) continue;
      return y;
    }
    return rec.H;
  }
  function relayout(rec) {
    for (const [k, hd] of rec.holders) if (!hd.childElementCount) { holdRO.unobserve(hd); hd.remove(); rec.holders.delete(k); }
    const items = [...rec.holders].map(([k, hd]) => {
      const para = paraPage.get(k).para;
      return { para, hd, cut: cutFor(rec, para) };
    }).sort((a, b) => a.cut - b.cut || a.para.top - b.para.top);
    // 끼울 자리마다 높이를 재서 쌓는다. 같은 줄에서 자르는 문단이 여럿이면 차례로 쌓는다
    // 카드 폭은 그 쪽 본문 폭으로 맞춘다(문단 길이마다 폭이 달라 들쭉날쭉했다). 두 단 문서의 한쪽 단처럼 본문 폭의 절반 남짓인 문단만 그 단 폭을 따른다
    const body = rec.paras.filter((q) => !q.tiny);
    const bl = Math.min(...body.map((q) => q.left)), br = Math.max(...body.map((q) => q.right));
    let off = 0;
    const shifts = []; // { y, off }: y 아래는 off 만큼 민다
    for (const it of items) {
      const narrow = it.para.right - it.para.left < (br - bl) * 0.55 && (it.para.left > bl + (br - bl) * 0.3 || it.para.right < br - (br - bl) * 0.3);
      const [l, r] = narrow ? [it.para.left, Math.max(it.para.right, Math.min(rec.W - 8, it.para.left + 360))] : [bl, br];
      Object.assign(it.hd.style, { top: `${it.cut + off}px`, left: `${l}px`, width: `${Math.min(r, rec.W - 6) - l}px` });
      off += it.hd.offsetHeight;
      const last = shifts[shifts.length - 1];
      if (last && last.y === it.cut) last.off = off; else shifts.push({ y: it.cut, off });
    }
    const offAt = (y) => { let o = 0; for (const sh of shifts) if (y >= sh.y - 0.5) o = sh.off; return o; };
    for (const p of rec.paras) p.el.style.transform = offAt(p.top) ? `translateY(${offAt(p.top)}px)` : "";
    rec.box.style.height = `${rec.H + off}px`;
    // 그림 조각: [0, 첫 자를 줄), [자를 줄, 다음 자를 줄) … 마다 캔버스 하나
    const bounds = [0, ...shifts.map((sh) => sh.y).filter((y) => y < rec.H), rec.H];
    const want = [];
    for (let i = 0; i < bounds.length - 1; i++) if (bounds[i + 1] > bounds[i]) want.push({ start: bounds[i], end: bounds[i + 1], off: offAt(bounds[i]) });
    while (rec.segs.length > want.length) rec.segs.pop().canvas.remove();
    while (rec.segs.length < want.length) { const c = el("canvas", { class: "seg" }); rec.box.prepend(c); rec.segs.push({ canvas: c }); }
    want.forEach((w, i) => {
      const sg = rec.segs[i];
      Object.assign(sg, w);
      Object.assign(sg.canvas.style, { top: `${w.start + w.off}px`, height: `${w.end - w.start}px` });
    });
    paintSegs(rec);
  }
  function paintSegs(rec) {
    for (const sg of rec.segs) {
      if (!rec.full) { sg.canvas.width = 0; sg.canvas.height = 0; continue; }
      const k = rec.full.width / rec.W, hgt = sg.end - sg.start;
      sg.canvas.width = rec.full.width;
      sg.canvas.height = Math.max(1, Math.round(hgt * k));
      sg.canvas.getContext("2d").drawImage(rec.full, 0, Math.round(sg.start * k), rec.full.width, sg.canvas.height, 0, 0, sg.canvas.width, sg.canvas.height);
    }
  }
  // 그림이 그려지면 줄마다 「한 줄 전체가 고른 색인가」 를 작게 줄여 재 둔다. 자를 줄이 도표·그림을 가로지르지 않게 쓴다
  function measureBlank(rec) {
    const sw = 240, sh = Math.max(1, Math.round(rec.H * sw / rec.W));
    const c = document.createElement("canvas");
    c.width = sw; c.height = sh;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(rec.full, 0, 0, sw, sh);
    const d = ctx.getImageData(0, 0, sw, sh).data;
    const rows = new Uint8Array(sh);
    for (let y = 0; y < sh; y++) {
      let lo = 255, hi = 0;
      for (let x = 0; x < sw; x++) {
        const i = (y * sw + x) * 4, v = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
        if (v < lo) lo = v; if (v > hi) hi = v;
      }
      rows[y] = hi - lo < 14 ? 1 : 0;
    }
    rec.blank = (y) => rows[Math.min(sh - 1, Math.max(0, Math.floor(y * sh / rec.H)))] === 1;
  }

  // 원본 그림은 화면 가까이 온 쪽만 그린다. 쪽이 많으면 멀어진 쪽의 그림은 비워 메모리를 아낀다(글자 층·표시는 그대로 남는다)
  function watchCanvases(pages) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const byBox = new Map(pages.map((p) => [p.box, p]));
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const p = byBox.get(e.target);
        if (e.isIntersecting && !p.drawn) {
          p.drawn = true;
          const full = document.createElement("canvas");
          full.width = Math.floor(p.vp.width * dpr);
          full.height = Math.floor(p.vp.height * dpr);
          p.task = p.page.render({ canvasContext: full.getContext("2d"), viewport: p.vp, transform: dpr === 1 ? null : [dpr, 0, 0, dpr, 0, 0] });
          p.task.promise.then(() => {
            if (!p.drawn) return;
            p.full = full;
            if (!p.blank) measureBlank(p);
            relayout(p); // 그림을 재었으니 자를 줄을 다시 고르고 조각을 칠한다
          }).catch(() => {});
        } else if (!e.isIntersecting && p.drawn && pages.length > 20) {
          p.task?.cancel();
          p.drawn = false;
          p.full = null;
          paintSegs(p);
        }
      }
    }, { rootMargin: "1500px 0px" });
    for (const p of pages) io.observe(p.box);
  }

  // ── 글자 조각 → 줄 → 문단 ──
  // pdf.js 는 글자를 줄 조각(span) 단위로 따로 놓는다. 문단이 없으므로 위치로 묶는다.
  //  줄: 세로 가운데가 거의 같고 왼쪽에서 오른쪽으로 이어지는 조각
  //  문단 끊기: 줄 사이가 크게 벌어짐 / 위로 올라감(다음 단) / 글자 크기가 바뀜(제목) / 앞 줄이 일찍 끝남 / 너무 길어짐
  // 묶은 문단은 조각들을 감싼 상자(nl-para)가 된다. 상자 안의 조각 자리는 그대로 두어 원본 그림과 겹친 위치가 바뀌지 않는다
  function groupParagraphs(items, divs, layer) {
    const L = layer.getBoundingClientRect();
    const spans = [];
    let k = 0;
    for (const it of items) {
      if (it.str === undefined) continue; // 표시용 묶음(marked content)은 조각이 없다
      const span = divs[k++];
      if (!span) continue;
      const r = span.getBoundingClientRect();
      spans.push({ span, str: it.str, x: span.offsetLeft, y: span.offsetTop,
        box: { l: r.left - L.left, t: r.top - L.top, r: r.right - L.left, b: r.bottom - L.top } });
    }
    const lines = [];
    for (const s of spans) {
      const line = lines[lines.length - 1];
      const blank = !s.str.trim() || s.box.b - s.box.t < 0.5;
      if (blank) { if (line) { line.spans.push(s); line.text += " "; } continue; }
      const h = s.box.b - s.box.t, cy = (s.box.t + s.box.b) / 2;
      if (line && Math.abs(cy - line.cy) < Math.min(h, line.h) * 0.5 && s.box.l > line.l && s.box.l - line.r < h * 4) {
        line.spans.push(s);
        if (s.box.l - line.r > h * 0.15 && !/\s$/.test(line.text)) line.text += " "; // 조각 사이가 떨어져 있으면 띄어 쓴 자리다
        line.r = Math.max(line.r, s.box.r); line.t = Math.min(line.t, s.box.t); line.b = Math.max(line.b, s.box.b);
        line.text += s.str;
      } else {
        lines.push({ spans: [s], l: s.box.l, r: s.box.r, t: s.box.t, b: s.box.b, cy, h, text: s.str });
      }
    }
    const paras = [];
    let cur = null;
    for (const line of lines) {
      if (cur) {
        const prev = cur.lines[cur.lines.length - 1];
        const gap = line.t - prev.b;
        const brk = gap > Math.max(prev.h, line.h) * 0.9
          || line.t < prev.t - 2
          || Math.abs(line.h - prev.h) > Math.min(line.h, prev.h) * 0.3
          || prev.r < cur.r - prev.h * 3
          || line.l > cur.r
          || cur.len > 1500;
        if (!brk) { cur.lines.push(line); cur.r = Math.max(cur.r, line.r); cur.l = Math.min(cur.l, line.l); cur.len += line.text.length; continue; }
        paras.push(cur);
      }
      cur = { lines: [line], l: line.l, r: line.r, len: line.text.length };
    }
    if (cur) paras.push(cur);

    const out = [];
    for (const p of paras) {
      const all = p.lines.flatMap((x) => x.spans);
      const bx = Math.min(...p.lines.map((x) => x.l)), by = Math.min(...p.lines.map((x) => x.t));
      const bw = Math.max(...p.lines.map((x) => x.r)) - bx, bh = Math.max(...p.lines.map((x) => x.b)) - by;
      const div = el("div", { class: "nl-para" });
      Object.assign(div.style, { left: `${bx}px`, top: `${by}px`, width: `${bw}px`, height: `${bh}px` });
      for (const s of all) {
        s.span.style.left = `${s.x - bx}px`;
        s.span.style.top = `${s.y - by}px`;
        div.append(s.span);
      }
      layer.append(div);
      const text = p.lines.map((x) => x.text.replace(/\s+/g, " ").trim()).filter(Boolean).join(" ");
      out.push({ el: div, text, tiny: text.length < 2, left: bx, top: by, right: bx + bw, bottom: by + bh });
    }
    for (const br of layer.querySelectorAll("br")) br.remove();
    return out;
  }
})();
