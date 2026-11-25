// notelayer PDF 노트 — PDF 원본을 이 PC 에 보관하고, 원래 모양 그대로 펼쳐 그 위에 표시·설명·메모를 남긴다.
// - pdf.html          : 내 PDF 목록 (넣기·지우기·원본 내려받기·폴더 연결)
// - pdf.html?doc=<id> : 그 PDF 를 펼쳐 보기
// 표시를 다는 코드는 웹페이지 위 표시 층(overlay.js)을 그대로 쓴다. 이 화면이 하는 일은 셋이다.
//   1) PDF 를 웹페이지처럼 펼친다 — 쪽마다 원본 그림(canvas) 위에 투명한 글자 층(pdf.js textLayer)을 겹친다
//   2) 글자 층의 글자 조각을 줄 → 문단으로 묶어 표시 층에 문단 목록으로 넘긴다(요청문·표시 자리 찾기가 문단 단위다)
//   3) 저장은 저장 창을 띄우지 않고 같은 주소의 저장 코드(storage.js)를 바로 부른다. 기록은 저장 창 목록에도 함께 보인다
(() => {
  const S = window.NL_STORAGE;
  // vendor.js 가 해시로 확인하는 판의 pdf.js 를 쓴다
  // 이 판(3.11)은 조작된 글꼴이 든 PDF 를 열면 그 안의 코드가 실행되는 취약점(CVE-2024-4367)이 있다. 모든 getDocument 에
  // isEvalSupported: false 를 넣어 막는다(공식 권고). 코드가 실행되면 이 주소에 저장한 다른 메모까지 읽힐 수 있다
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
  // pdf.js 는 vendor.js 가 해시로 확인하며 불러온다
  const pdfjs = () => window.NL_VENDOR.pdfjs();
  function download(blob, name) {
    const a = el("a", { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  const params = new URLSearchParams(location.search);
  const docId = params.get("doc");

  // ── 테마: 자동(시스템·브라우저 테마를 따름) / 밝게 / 어둡게 ──
  // 다크 모드에서는 PDF 그림을 밝기만 뒤집고(pdf.html 의 filter) 쪽 바탕·설명 틈 색도 같은 규칙으로 바꿔, 그림과 설명이 한 장처럼 보이게 한다
  const THEME_KEY = "notelayer:pdf-theme";
  const THEME_NAME = { auto: "◐ 테마: 자동", light: "☀ 테마: 밝게", dark: "☾ 테마: 어둡게" };
  let themePref = "auto";
  try { themePref = localStorage.getItem(THEME_KEY) || "auto"; } catch {}
  if (!THEME_NAME[themePref]) themePref = "auto";
  const darkQuery = matchMedia("(prefers-color-scheme: dark)");
  const isDark = () => themePref === "dark" || (themePref === "auto" && darkQuery.matches);
  const allPages = [];
  const themeBtn = el("button", { class: "theme-btn", title: "자동 → 밝게 → 어둡게 순서로 바꿉니다", onclick: () => {
    themePref = { auto: "light", light: "dark", dark: "auto" }[themePref];
    try { localStorage.setItem(THEME_KEY, themePref); } catch {}
    applyTheme();
  } });
  document.querySelector(".bar a.link[href='index.html']")?.before(themeBtn);
  function applyTheme() {
    const dark = isDark();
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    // 브라우저 강제 다크 모드가 덧칠하지 않게, 밝을 때는 「밝게만」, 어두울 때는 「어둡게」 를 선언한다
    document.documentElement.style.colorScheme = dark ? "dark" : "only light";
    document.querySelector('meta[name="color-scheme"]')?.setAttribute("content", dark ? "dark" : "only light");
    document.querySelector("notelayer-overlay")?.setAttribute("data-theme", dark ? "dark" : "light");
    themeBtn.textContent = THEME_NAME[themePref];
    for (const rec of allPages) relayout(rec);
  }
  darkQuery.addEventListener?.("change", () => { if (themePref === "auto") applyTheme(); });
  applyTheme();
  // CSS 의 invert(1) hue-rotate(180deg) 를 색 하나에 똑같이 적용한다(그림과 틈 색이 맞도록)
  function darkOf([r, g, b]) {
    const R = 255 - r, G = 255 - g, B = 255 - b;
    const c = (v) => Math.max(0, Math.min(255, Math.round(v)));
    return [c(-0.574 * R + 1.430 * G + 0.144 * B), c(0.426 * R + 0.430 * G + 0.144 * B), c(0.426 * R + 1.430 * G - 0.856 * B)];
  }
  // 설명 카드 색: 바탕이 어두우면 밝은 글자에 옅게 밝힌 층, 밝으면 짙은 글자에 옅게 어둡힌 층. 반투명이라 바탕 색이 비친다
  function cardVars(node, [r, g, b]) {
    const dark = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5;
    const v = dark
      ? { card: "rgba(255,255,255,.06)", line: "rgba(255,255,255,.14)", ink: "#e5e7eb", pre: "rgba(255,255,255,.07)", muted: "#9ca3af", "tr-bar": "rgba(255,255,255,.3)", focus: "rgba(255,255,255,.09)", lift: "40%" }
      : { card: "rgba(0,0,0,.035)", line: "rgba(0,0,0,.09)", ink: "#1f2328", pre: "rgba(0,0,0,.05)", muted: "#6b7280", "tr-bar": "rgba(0,0,0,.25)", focus: "#fff", lift: "0%" };
    for (const [k, val] of Object.entries(v)) node.style.setProperty(`--nl-${k}`, val);
  }
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
      el("button", { title: "원본 PDF 내려받기", onclick: () => download(rec.blob, rec.name) }, "원본 내려받기"),
      el("button", { id: "exportBtn", title: "표시·설명·번역을 PDF 주석으로 넣고 notelayer 기록을 첨부한 PDF 를 내려받습니다. 굿노트·삼성 노트에서 열거나, 다른 기기의 notelayer 에서 열어 이어 볼 수 있습니다",
        onclick: () => exportPdf(rec) }, "주석 넣은 PDF 내보내기"),
      penUi(),
      el("span", { id: "viewMsg", class: "muted" }));

    let lib, pdf;
    try {
      lib = await pdfjs();
      pdf = await lib.getDocument({ data: new Uint8Array(await rec.blob.arrayBuffer()), isEvalSupported: false }).promise;
    } catch (err) {
      loading(`PDF 를 열지 못했습니다: ${err?.message || err}`, true);
      return;
    }
    await S.putPdf({ ...rec, pages: pdf.numPages, openedAt: Date.now() }).catch(() => {});
    // notelayer 가 내보낸 PDF 면 기록 원본(notelayer.json)이 첨부돼 있다. 그 PDF 에 박힌 주석은 화면에서 숨긴다(표시 층과 두 번 칠해지지 않게)
    const embedded = await readEmbedded(pdf);

    const pagesEl = $("pages");
    const first = await pdf.getPage(1);
    const w1 = first.getViewport({ scale: 1 }).width;
    // 화면 폭을 다 쓴다(오른쪽 위 작은 창은 PDF 위에 떠 있다). 창 크기를 바꿔도 다시 그리지 않는다(표시 자리가 그대로 맞게)
    const scale = Math.max(320, Math.min(1000, innerWidth - 48)) / w1;
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
      const rec = { n, page, vp, W, H, box, layer, paras, holders: new Map(), segs: [], full: null, blank: null, drawn: false, task: null, hideAnnots: !!embedded, scale };
      rec.ink = inkLayer(rec);
      // 아주 짧은 조각(한 글자 등)은 요청문 문단에서 빼지만, 아래로 밀 때는 함께 민다
      for (const p of paras) { if (!p.tiny) paragraphs.push({ p: paragraphs.length + 1, el: p.el, text: p.text }); paraPage.set(p.el, { rec, para: p }); }
      pages.push(rec); allPages.push(rec);
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
      // 손글씨는 표시·설명과 같은 기록에 저장한다(내보낸 PDF 첨부에도 들어간다)
      extraData: () => (ink.strokes.length ? { ink: ink.strokes.map((s) => ({ n: s.n, c: s.c, w: s.w, ...(s.hl ? { hl: true } : {}), p: s.p })) } : {}),
      hasExtra: () => ink.strokes.length > 0,
      restoreExtra: (data) => {
        ink.strokes = (Array.isArray(data?.ink) ? data.ink : [])
          .filter((s) => s && Number.isInteger(s.n) && Array.isArray(s.p) && s.p.length && typeof s.c === "string")
          .map((s) => ({ id: ++ink.seq, n: s.n, c: s.c, w: Number(s.w) || 2, hl: !!s.hl, p: s.p }));
        for (const r of allPages) drawInk(r);
      },
    };
    try { await loadScript("overlay.js"); }
    catch (err) { loading(`표시 층을 불러오지 못했습니다: ${err.message}`, true); pagesEl.before($("loading")); return; }
    applyTheme(); // 표시 층의 작은 창·요약 화면에도 테마를 알린다
    if (params.get("sample")) applySample(params.get("sample"));
    else if (embedded) applyEmbedded(embedded);
  }

  // ── 손글씨 층 ──
  // 획은 「배율 1 의 쪽 좌표(PDF 단위, 왼쪽 위 기준)」 로 저장한다. PC·아이패드처럼 화면 폭이 달라도 같은 자리에 그려진다.
  // 설명을 끼우려고 벌린 틈에는 쓰지 않고, 아래로 밀린 쪽에 쓴 획은 쪽 내용과 함께 움직인다.
  // 펜을 켜면 펜슬·마우스는 쓰고, 손가락은 화면을 내린다(아이패드에서 펜슬로만 쓰는 노트 앱처럼)
  const SVGNS = "http://www.w3.org/2000/svg";
  const PENS = [{ c: "#1f2328", name: "검정" }, { c: "#d9480f", name: "빨강" }, { c: "#1c64f2", name: "파랑" }, { c: "#facc15", name: "형광펜", hl: true }];
  const ink = { on: false, erase: false, pen: PENS[0], strokes: [], seq: 0 };
  function penUi() {
    const tools = el("span", { class: "pen-tools", hidden: true });
    const btn = el("button", { id: "penBtn", "aria-pressed": "false", title: "PDF 위에 손글씨로 씁니다(아이패드는 펜슬로 쓰고 손가락으로 내립니다)" }, "✏ 펜");
    const sync = () => {
      btn.setAttribute("aria-pressed", String(ink.on)); tools.hidden = !ink.on;
      document.documentElement.classList.toggle("inking", ink.on);
      document.documentElement.classList.toggle("erasing", ink.on && ink.erase);
      for (const b of tools.querySelectorAll("[data-pen]")) b.setAttribute("aria-pressed", String(!ink.erase && b.dataset.pen === ink.pen.c));
      tools.querySelector(".eraser").setAttribute("aria-pressed", String(ink.erase));
    };
    btn.onclick = () => { ink.on = !ink.on; window.getSelection()?.removeAllRanges(); sync(); };
    tools.append(
      ...PENS.map((pn) => el("button", { class: "sw", "data-pen": pn.c, title: pn.name, style: `background:${pn.c}${pn.hl ? ";opacity:.7" : ""}`,
        onclick: () => { ink.pen = pn; ink.erase = false; sync(); } })),
      el("button", { class: "tool eraser", title: "지우개 — 획을 문지르면 그 획을 지웁니다", onclick: () => { ink.erase = !ink.erase; sync(); } }, "지우개"),
      el("button", { class: "tool", title: "마지막 획 되돌리기 (Ctrl+Z)", onclick: undoInk }, "↶"));
    addEventListener("keydown", (e) => { if (ink.on && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undoInk(); } });
    queueMicrotask(sync);
    return el("span", { class: "row", style: "margin:0" }, btn, tools);
  }
  function saveInk() { window.NL_OVERLAY?.save?.(); }
  function undoInk() { if (!ink.strokes.length) return; const s = ink.strokes.pop(); const r = allPages[s.n - 1]; if (r) drawInk(r); saveInk(); }
  // 화면 자리 → 배율 1 의 쪽 좌표. 벌린 틈 안이면 null
  function toPage(rec, e) {
    const b = rec.box.getBoundingClientRect(), vx = e.clientX - b.left, vy = e.clientY - b.top;
    let before = 0, py = null;
    for (const sh of rec.shifts || []) {
      if (vy < sh.y + before) { py = vy - before; break; }
      if (vy < sh.y + sh.off) return null;
      before = sh.off;
    }
    if (py == null) py = vy - before;
    if (py < 0 || py > rec.H || vx < 0 || vx > rec.W) return null;
    return [Math.round((vx / rec.scale) * 10) / 10, Math.round((py / rec.scale) * 10) / 10];
  }
  const pathOf = (pts, k) => pts.map(([x, y], i) => `${i ? "L" : "M"}${(x * k).toFixed(1)} ${(y * k).toFixed(1)}`).join(" ") + (pts.length === 1 ? " l0.1 0" : "");
  function strokeEl(rec, s) {
    const path = document.createElementNS(SVGNS, "path");
    path.setAttribute("d", pathOf(s.p, rec.scale));
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", s.c);
    path.setAttribute("stroke-width", String(s.w * rec.scale));
    path.setAttribute("stroke-linecap", s.hl ? "butt" : "round");
    path.setAttribute("stroke-linejoin", "round");
    if (s.hl) { path.setAttribute("stroke-opacity", "0.38"); path.style.mixBlendMode = "multiply"; }
    const minY = Math.min(...s.p.map((q) => q[1])) * rec.scale;
    const off = rec.offAt ? rec.offAt(minY) : 0;
    if (off) path.setAttribute("transform", `translate(0 ${off})`);
    return path;
  }
  function drawInk(rec) { rec.ink.replaceChildren(...ink.strokes.filter((s) => s.n === rec.n).map((s) => strokeEl(rec, s))); }
  function inkLayer(rec) {
    const svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("class", "ink");
    rec.box.append(svg);
    let cur = null, scroll = null;
    const near = (s, [x, y], r) => s.p.some(([a, b], i) => {
      const [c, d] = s.p[i + 1] || [a, b];
      const vx = c - a, vy = d - b, l2 = vx * vx + vy * vy;
      const t = l2 ? Math.max(0, Math.min(1, ((x - a) * vx + (y - b) * vy) / l2)) : 0;
      return Math.hypot(a + t * vx - x, b + t * vy - y) <= r + s.w / 2;
    });
    const eraseAt = (pt) => {
      const before = ink.strokes.length;
      ink.strokes = ink.strokes.filter((s) => s.n !== rec.n || !near(s, pt, 6));
      if (ink.strokes.length !== before) { drawInk(rec); cur = { erased: true }; }
    };
    svg.addEventListener("pointerdown", (e) => {
      if (!ink.on) return;
      if (e.pointerType === "touch") { scroll = { y: e.clientY, id: e.pointerId }; return; } // 손가락은 화면 내리기
      if (e.button !== 0) return;
      const pt = toPage(rec, e);
      if (!pt) return;
      e.preventDefault();
      svg.setPointerCapture(e.pointerId);
      if (ink.erase) { cur = { erasing: true }; eraseAt(pt); return; }
      const pressure = e.pointerType === "pen" && e.pressure ? e.pressure : 0.5;
      const s = { id: ++ink.seq, n: rec.n, c: ink.pen.c, w: ink.pen.hl ? 12 : Math.round((1.2 + pressure * 1.6) * 10) / 10, hl: !!ink.pen.hl, p: [pt] };
      cur = { s, el: strokeEl(rec, s) };
      svg.append(cur.el);
    });
    svg.addEventListener("pointermove", (e) => {
      if (scroll && e.pointerId === scroll.id) { window.scrollBy(0, scroll.y - e.clientY); scroll.y = e.clientY; return; }
      if (!cur) return;
      const pt = toPage(rec, e);
      if (!pt) return;
      if (cur.erasing || cur.erased) { eraseAt(pt); cur.erasing = true; return; }
      const last = cur.s.p[cur.s.p.length - 1];
      if (Math.hypot(pt[0] - last[0], pt[1] - last[1]) < 0.8) return;
      cur.s.p.push(pt);
      cur.el.setAttribute("d", pathOf(cur.s.p, rec.scale));
    });
    const end = (e) => {
      if (scroll && e.pointerId === scroll.id) { scroll = null; return; }
      if (!cur) return;
      if (cur.s) { ink.strokes.push(cur.s); drawInk(rec); }
      const changed = !!cur.s || cur.erasing || cur.erased;
      cur = null;
      if (changed) saveInk();
    };
    svg.addEventListener("pointerup", end);
    svg.addEventListener("pointercancel", end);
    return svg;
  }

  // ── 주석 넣은 PDF 내보내기 / 첨부된 기록 되살리기 ──
  // 내보낸 PDF 한 장에 두 가지를 담는다.
  //  1) PDF 표준 주석: 핵심어=밑줄(Underline), 중요한 문장=형광펜(Highlight), 확인 필요=물결 밑줄(Squiggly),
  //     문단별 번역·설명=메모(Text), 1쪽 왼쪽 위에 요약 메모. 굿노트·삼성 노트·PDF 뷰어에서 보인다
  //  2) 첨부 파일 notelayer.json: 표시 자리·설명·번역·요약 원본. 다른 기기의 notelayer 에서 이 PDF 를 열면 그대로 되살아난다
  // 주석은 작성자(T)를 notelayer 로 달아, 다시 내보낼 때 예전 것을 지우고 새로 넣는다
  const NL_ATTACH = "notelayer.json";
  async function readEmbedded(pdf) {
    try {
      const att = await pdf.getAttachments();
      const f = att && Object.values(att).find((a) => a?.filename === NL_ATTACH);
      if (!f) return null;
      const j = JSON.parse(new TextDecoder().decode(f.content));
      return j?.app === "notelayer" && j.data && typeof j.data === "object" ? j : null;
    } catch { return null; }
  }
  async function applyEmbedded(j) {
    for (let i = 0; i < 40 && !window.NL_OVERLAY?.info().store; i++) await new Promise((ok) => setTimeout(ok, 150));
    const ov = window.NL_OVERLAY, info = ov?.info();
    if (!ov || info.marks || info.boxes || info.orphans) return; // 이 기기에 이미 기록이 있으면 그쪽을 쓴다
    if (j.data.tpl) ov.useTemplate(j.data.tpl);
    const r = ov.apply(JSON.stringify(j.data));
    if (r) viewMsg(`PDF 에 첨부된 notelayer 기록을 불러왔습니다 · 표시 ${r.placed}개, 설명 ${r.boxes}개${r.lost?.length ? ` · 자리를 못 찾은 표시 ${r.lost.length}개` : ""}`);
  }
  function viewMsg(text, err = false) { const m = $("viewMsg"); if (m) { m.className = err ? "muted err" : "muted ok"; m.textContent = text; } }

  const hexRgb = (css) => {
    const m = /^#([0-9a-f]{6})$/i.exec(css || "");
    if (m) { const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255); }
    // 반투명 색(형광펜)은 흰 종이에 얹었을 때 보이는 색으로 바꾼다(PDF 뷰어마다 투명도 처리가 달라 진하게 나왔다)
    const r = /rgba?\(([^)]+)\)/.exec(css || "");
    if (!r) return [1, 0.85, 0];
    const [cr, cg, cb, a = 1] = r[1].split(",").map(Number);
    return [cr, cg, cb].map((v) => 1 - a * (1 - v / 255));
  };
  const shiftOf = (node) => Number(/translateY\(([-\d.]+)px\)/.exec(node.style.transform || "")?.[1] || 0);
  // 화면 위 네모 → (쪽, 아래로 밀기 전 쪽 좌표). 설명을 끼우려고 아래로 민 만큼은 되돌린다
  function pageRect(r) {
    const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
    for (const p of allPages) {
      const b = p.box.getBoundingClientRect();
      if (cx < b.left || cx > b.right || cy < b.top || cy > b.bottom) continue;
      const para = p.paras.find((q) => { const qr = q.el.getBoundingClientRect(); return cx >= qr.left - 2 && cx <= qr.right + 2 && cy >= qr.top - 2 && cy <= qr.bottom + 2; });
      const ty = para ? shiftOf(para.el) : 0;
      return { p, x1: r.left - b.left, x2: r.right - b.left, y1: r.top - b.top - ty, y2: r.bottom - b.top - ty };
    }
    return null;
  }
  async function exportPdf(rec) {
    const ov = window.NL_OVERLAY;
    if (!ov) return;
    const btn = $("exportBtn");
    btn.disabled = true; viewMsg("PDF 를 만드는 중…");
    try {
      const L = ov.exportLayer();
      const { PDFDocument, PDFName, PDFDict, PDFArray, PDFString, PDFHexString } = await window.NL_VENDOR.pdflib();
      const doc = await PDFDocument.load(new Uint8Array(await rec.blob.arrayBuffer()), { updateMetadata: false });
      const pdfPages = doc.getPages(), ctx = doc.context;
      const text = (t) => PDFHexString.fromText(String(t));
      const textOf = (o) => { try { return o?.decodeText?.(); } catch { return undefined; } };
      // 예전에 넣은 notelayer 주석·첨부는 지운다
      for (const pg of pdfPages) {
        const annots = pg.node.Annots();
        if (!annots) continue;
        for (let i = annots.size() - 1; i >= 0; i--) if (textOf(annots.lookup(i, PDFDict)?.lookup(PDFName.of("T"))) === "notelayer") annots.remove(i);
      }
      const efNames = doc.catalog.lookupMaybe(PDFName.of("Names"), PDFDict)?.lookupMaybe(PDFName.of("EmbeddedFiles"), PDFDict)?.lookupMaybe(PDFName.of("Names"), PDFArray);
      if (efNames) for (let i = efNames.size() - 2; i >= 0; i -= 2) if (textOf(efNames.lookup(i)) === NL_ATTACH) { efNames.remove(i + 1); efNames.remove(i); }

      const now = PDFString.fromDate(new Date());
      let seq = 0;
      const add = (p, dict) => {
        const ref = ctx.register(ctx.obj({ Type: "Annot", F: 4, T: text("notelayer"), M: now, NM: PDFString.of(`notelayer-${++seq}`), ...dict }));
        pdfPages[p.n - 1].node.addAnnot(ref);
      };
      const pt = (p, x, y) => p.vp.convertToPdfPoint(x, y);
      const t = L.template;
      const SUB = { circle: "Underline", highlight: "Highlight", wave: "Squiggly" };
      const COLOR = { circle: hexRgb(L.colors.circle), highlight: hexRgb(L.colors.hl), wave: hexRgb(L.colors.wave) };
      let marks = 0, notes = 0;
      for (const m of L.marks) {
        const byPage = new Map();
        for (const r of m.rects) { const q = pageRect(r); if (q) { if (!byPage.has(q.p)) byPage.set(q.p, []); byPage.get(q.p).push(q); } }
        for (const [p, qs] of byPage) {
          const quads = [], xs = [], ys = [];
          for (const q of qs) {
            const pts = [pt(p, q.x1, q.y1), pt(p, q.x2, q.y1), pt(p, q.x1, q.y2), pt(p, q.x2, q.y2)];
            for (const [x, y] of pts) { quads.push(x, y); xs.push(x); ys.push(y); }
          }
          add(p, { Subtype: SUB[m.kind], Rect: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], QuadPoints: quads,
            C: COLOR[m.kind], Contents: text(`${t.marks[m.kind]}${m.mine ? " (내 표시)" : ""}: ${m.quote}`) });
          marks++;
        }
      }
      // 문단별 번역·설명 = 문단 왼쪽 여백(없으면 오른쪽)의 메모 하나
      for (const nt of L.notes) {
        const at = paraPage.get(nt.el);
        if (!at) continue;
        const { rec: p, para } = at;
        const x = para.left >= 26 ? para.left - 22 : Math.min(p.W - 20, para.right + 4), y = para.top;
        const [x1, y1] = pt(p, x, y + 18), [x2, y2] = pt(p, x + 18, y);
        const parts = [nt.tr ? `[번역]\n${nt.tr}` : "",
          ...nt.boxes.map((b) => `[${b.label}]\n${b.text}${b.pre ? `\n${b.pre}` : ""}${b.answer ? `\n(답) ${b.answer}` : ""}`)].filter(Boolean);
        const c = nt.boxes[0] ? hexRgb(t.boxes[nt.boxes[0].label]) : [0.45, 0.5, 0.58];
        add(p, { Subtype: "Text", Name: "Comment", Open: false, Rect: [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)], C: c, Contents: text(parts.join("\n\n")) });
        notes++;
      }
      // 손글씨 = Ink 주석(굿노트·삼성 노트에서도 손글씨로 보인다)
      let strokes = 0;
      for (const s of ink.strokes) {
        const p = allPages[s.n - 1];
        if (!p) continue;
        const flat = [], xs = [], ys = [];
        for (const [x, y] of s.p) { const [X, Y] = pt(p, x * p.scale, y * p.scale); flat.push(X, Y); xs.push(X); ys.push(Y); }
        const half = s.w / 2;
        add(p, { Subtype: "Ink", InkList: [flat], Rect: [Math.min(...xs) - half, Math.min(...ys) - half, Math.max(...xs) + half, Math.max(...ys) + half],
          C: hexRgb(s.c), BS: { W: s.w }, ...(s.hl ? { CA: 0.38 } : {}), Contents: text(s.hl ? "형광펜(손글씨)" : "손글씨") });
        strokes++;
      }
      // 요약: 1쪽 왼쪽 위 메모에 개념 구조를 들여쓰기로
      const cs = L.concepts;
      if (cs?.nodes?.length && allPages[0]) {
        const kids = new Map();
        for (const n of cs.nodes) { if (!kids.has(n.parent)) kids.set(n.parent, []); kids.get(n.parent).push(n); }
        const lines = [`[요약] ${cs.topic}`], seen = new Set();
        const walk = (pid, d) => { for (const n of kids.get(pid) || []) { if (seen.has(n.id)) continue; seen.add(n.id);
          lines.push(`${"  ".repeat(d)}${d ? "–" : "•"} ${n.term}${n.gloss ? ` — ${n.gloss}` : ""}`); walk(n.id, d + 1); } };
        walk(null, 0);
        for (const l of cs.links || []) { const a = cs.nodes.find((n) => n.id === l.from), b = cs.nodes.find((n) => n.id === l.to); if (a && b) lines.push(`↪ ${a.term} → ${b.term} (${l.label})`); }
        const p = allPages[0], [x1, y1] = pt(p, 6, 24), [x2, y2] = pt(p, 24, 6);
        add(p, { Subtype: "Text", Name: "Note", Open: false, Rect: [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)], C: [0.39, 0.4, 0.95], Contents: text(lines.join("\n")) });
      }
      const payload = { app: "notelayer", v: 1, savedAt: Date.now(), title: rec.name, data: L.record, paragraphs: L.paragraphs };
      await doc.attach(new TextEncoder().encode(JSON.stringify(payload)), NL_ATTACH, {
        mimeType: "application/json", description: "notelayer 기록 — notelayer PDF 노트에서 이 PDF 를 열면 표시·설명·번역·요약이 되살아납니다",
        creationDate: new Date(), modificationDate: new Date() });
      const out = await doc.save();
      download(new Blob([out], { type: "application/pdf" }), `${rec.name.replace(/\.pdf$/i, "")} (notelayer).pdf`);
      viewMsg(`내보냈습니다 · 주석 표시 ${marks}개, 메모 ${notes}개${strokes ? `, 손글씨 ${strokes}획` : ""}${cs?.nodes?.length ? ", 요약 메모 1개" : ""} · 기록 첨부`);
    } catch (err) {
      viewMsg(`내보내지 못했습니다: ${err?.message || err}`, true);
    } finally {
      btn.disabled = false;
    }
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
    const gapAt = new Map(); // 자를 줄 → { top, color }
    const dark = isDark();
    for (const it of items) {
      // 틈 색 = 자른 줄의 PDF 바탕색(다크 모드면 그림과 같은 규칙으로 바꾼 색). 그림을 아직 안 그렸으면 흰 종이로 본다
      if (!gapAt.has(it.cut)) {
        const paper = rec.rowColor ? rec.rowColor(Math.min(it.cut, rec.H - 1)) : [255, 255, 255];
        gapAt.set(it.cut, { top: it.cut + off, color: dark ? darkOf(paper) : paper });
      }
      cardVars(it.hd, gapAt.get(it.cut).color);
      const narrow = it.para.right - it.para.left < (br - bl) * 0.55 && (it.para.left > bl + (br - bl) * 0.3 || it.para.right < br - (br - bl) * 0.3);
      const [l, r] = narrow ? [it.para.left, Math.max(it.para.right, Math.min(rec.W - 8, it.para.left + 360))] : [bl, br];
      Object.assign(it.hd.style, { top: `${it.cut + off}px`, left: `${l}px`, width: `${Math.min(r, rec.W - 6) - l}px` });
      off += it.hd.offsetHeight;
      const last = shifts[shifts.length - 1];
      if (last && last.y === it.cut) last.off = off; else shifts.push({ y: it.cut, off });
    }
    const offAt = (y) => { let o = 0; for (const sh of shifts) if (y >= sh.y - 0.5) o = sh.off; return o; };
    rec.shifts = shifts; rec.offAt = offAt;
    // 틈: 쪽 너비 전체를 그 줄의 바탕색으로 칠한다(카드 양옆 여백까지 종이처럼 이어지게)
    while ((rec.gaps ||= []).length > gapAt.size) rec.gaps.pop().remove();
    [...gapAt].forEach(([y, g], i) => {
      let d = rec.gaps[i];
      if (!d) { d = el("div", { class: "gap" }); rec.box.append(d); rec.gaps.push(d); }
      Object.assign(d.style, { top: `${g.top}px`, height: `${offAt(y) - (g.top - y)}px`, background: `rgb(${g.color.join(",")})` });
    });
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
    if (rec.ink) drawInk(rec);
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
    const rows = new Uint8Array(sh), cols = new Uint8ClampedArray(sh * 3);
    for (let y = 0; y < sh; y++) {
      let lo = 255, hi = 0, r = 0, g = 0, b = 0;
      for (let x = 0; x < sw; x++) {
        const i = (y * sw + x) * 4, v = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
        if (v < lo) lo = v; if (v > hi) hi = v;
        r += d[i]; g += d[i + 1]; b += d[i + 2];
      }
      rows[y] = hi - lo < 14 ? 1 : 0;
      cols.set([r / sw, g / sw, b / sw], y * 3);
    }
    const at = (y) => Math.min(sh - 1, Math.max(0, Math.floor(y * sh / rec.H)));
    rec.blank = (y) => rows[at(y)] === 1;
    // 그 줄의 평균 색 = 바탕색(자를 줄은 고른 색 줄이므로 평균이 곧 바탕색이다)
    rec.rowColor = (y) => { const k = at(y) * 3; return [cols[k], cols[k + 1], cols[k + 2]]; };
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
          p.task = p.page.render({ canvasContext: full.getContext("2d"), viewport: p.vp, transform: dpr === 1 ? null : [dpr, 0, 0, dpr, 0, 0],
            annotationMode: p.hideAnnots ? window.pdfjsLib.AnnotationMode.DISABLE : undefined });
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
