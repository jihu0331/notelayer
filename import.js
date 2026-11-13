// notelayer — 새 문서 넣기(글 붙여 넣기·파일·웹페이지)와 "AI 표시 만들기"(쓰는 LLM 과 복사·붙여 넣기로 주고받기).
// 화면 본체(app.js)와는 window.NL 창구로만 이야기한다.
(() => {
  const $ = (id) => document.getElementById(id);
  const ready = new Promise((res) => (window.NL ? res() : window.addEventListener("notelayer-ready", res, { once: true })));

  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove("show"), 3500);
  }

  // ── 글을 문단으로 나눈다: 빈 줄이 있으면 빈 줄 기준, 없으면 줄마다 ──
  function splitParagraphs(text) {
    const s = String(text).replace(/\r\n?/g, "\n").replace(/ /g, " ").trim();
    if (!s) return [];
    const parts = /\n[ \t]*\n/.test(s) ? s.split(/\n[ \t]*\n+/).map((p) => p.replace(/[ \t]*\n[ \t]*/g, " ")) : s.split("\n");
    return parts.map((p) => p.replace(/^#{1,6}\s+/, "").replace(/[ \t]+/g, " ").trim()).filter(Boolean).slice(0, 500);
  }
  function detectLang(text) {
    const s = String(text).slice(0, 4000);
    const count = (re) => (s.match(re) || []).length;
    const ko = count(/[가-힣]/g), kana = count(/[぀-ヿ]/g), han = count(/[一-鿿]/g), latin = count(/[A-Za-z]/g);
    const total = ko + kana + han + latin || 1;
    if (ko / total > 0.3) return "ko";
    if (kana / total > 0.1) return "ja";
    if (han / total > 0.3) return "zh";
    if (latin / total > 0.6) return "en";
    return "other";
  }

  // ── 새 문서 창 ──
  const newDlg = $("newDocDialog");
  function showTab(name) {
    newDlg.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === name)));
    newDlg.querySelectorAll(".pane").forEach((p) => (p.hidden = p.dataset.pane !== name));
  }
  newDlg.querySelectorAll(".tab").forEach((t) => (t.onclick = (e) => { e.preventDefault(); showTab(t.dataset.tab); }));
  $("newDocBtn").onclick = () => { showTab("paste"); $("ndMsg").textContent = ""; $("ndFileMsg").textContent = ""; newDlg.showModal(); };

  $("ndCreate").onclick = async (e) => {
    e.preventDefault();
    await ready;
    let paragraphs = splitParagraphs($("ndText").value);
    if (!paragraphs.length) { $("ndMsg").textContent = "본문을 붙여 넣어 주세요."; return; }
    let title = $("ndTitle").value.trim();
    // 제목을 비우면 짧은 첫 줄을 제목으로 쓰고 본문에서는 뺀다
    if (!title && paragraphs[0].length <= 80 && paragraphs.length > 1) title = paragraphs.shift();
    const langSel = $("ndLang").value;
    const lang = langSel === "auto" ? detectLang(paragraphs.join(" ")) : langSel;
    window.NL.addDocument({ title: title || paragraphs[0].slice(0, 40), lang, source: $("ndText").dataset.source || "내가 붙여 넣은 글", paragraphs });
    $("ndTitle").value = ""; $("ndText").value = ""; delete $("ndText").dataset.source;
    newDlg.close();
    toast(`문단 ${paragraphs.length}개로 새 문서를 만들었습니다. 수정 모드에서 직접 표시하거나 "AI 표시 만들기"로 LLM 에 맡기세요.`);
  };

  // ── 파일에서 글자 뽑기 (브라우저 안에서만 읽는다) ──
  const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
  const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const MAMMOTH = "https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js";
  const loaded = {};
  function loadScript(src) {
    loaded[src] ??= new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src; s.onload = res; s.onerror = () => rej(new Error("읽기 도구를 내려받지 못했습니다(인터넷 연결 확인)"));
      document.head.appendChild(s);
    });
    return loaded[src];
  }
  async function pdfText(buf) {
    await loadScript(PDFJS);
    const lib = window.pdfjsLib;
    lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    const pdf = await lib.getDocument({ data: buf }).promise;
    const paras = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const content = await (await pdf.getPage(n)).getTextContent();
      // 같은 높이의 글자 조각을 한 줄로 묶는다
      const lines = [];
      let line = null;
      for (const it of content.items) {
        if (typeof it.str !== "string") continue;
        const y = it.transform[5], h = Math.abs(it.transform[3]) || it.height || 10;
        if (!line || Math.abs(line.y - y) > h * 0.5) { line = { y, h, text: "" }; lines.push(line); }
        line.text += it.str;
        if (it.hasEOL) line = null;
      }
      const real = lines.filter((l) => l.text.trim());
      // 보통 줄 간격 = 간격들 가운데 아래쪽 4분의 1 값. 짧은 문단이 많으면 중간값은 문단 사이 간격이 되어 버린다
      const gaps = real.slice(1).map((l, i) => real[i].y - l.y).filter((g) => g > 0).sort((a, b) => a - b);
      const usual = gaps[Math.floor(gaps.length / 4)] || 14;
      // 줄 간격이 보통보다 1.4배 넘게 벌어지면 문단이 바뀐 것으로 본다. 모든 줄이 넓게 떨어져 있으면(한 줄짜리 문단들) 줄마다 문단이다
      const everyLine = gaps.length > 0 && gaps[gaps.length - 1] <= usual * 1.4 && usual > (real[0]?.h ?? 10) * 1.8;
      let cur = "";
      real.forEach((l, i) => {
        const gap = i ? real[i - 1].y - l.y : 0;
        const t = l.text.replace(/\s+/g, " ").trim();
        if (i && (everyLine || gap > usual * 1.4 || gap < 0)) { paras.push(cur); cur = ""; }
        cur = !cur ? t : /[A-Za-z]-$/.test(cur) ? cur.slice(0, -1) + t : `${cur} ${t}`;
      });
      if (cur) paras.push(cur);
    }
    return paras.join("\n\n");
  }
  async function docxText(buf) {
    await loadScript(MAMMOTH);
    return (await window.mammoth.extractRawText({ arrayBuffer: buf })).value;
  }
  async function readFile(file) {
    const msg = $("ndFileMsg");
    const name = file.name.toLowerCase();
    msg.textContent = `「${file.name}」 읽는 중…`;
    try {
      let text;
      if (name.endsWith(".pdf")) text = await pdfText(await file.arrayBuffer());
      else if (name.endsWith(".docx")) text = await docxText(await file.arrayBuffer());
      else if (/\.(txt|md|markdown)$/.test(name) || file.type.startsWith("text/")) text = await file.text();
      else throw new Error("텍스트·마크다운·PDF·워드(.docx) 파일만 읽을 수 있습니다");
      if (!text.trim()) throw new Error("글자를 찾지 못했습니다. 스캔한 PDF 이거나 그림으로 된 문서일 수 있습니다");
      $("ndTitle").value ||= file.name.replace(/\.[^.]+$/, "");
      $("ndText").value = text;
      $("ndText").dataset.source = `파일: ${file.name}`;
      showTab("paste");
      $("ndMsg").textContent = `글자 ${text.length.toLocaleString()}자를 뽑았습니다. 확인한 다음 "문서 만들기"를 누르세요.`;
    } catch (err) {
      msg.textContent = `읽지 못했습니다: ${err.message}`;
    }
  }
  $("ndFile").onchange = (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) readFile(f); };
  const drop = $("ndDrop");
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); const f = e.dataTransfer.files[0]; if (f) readFile(f); });

  // ── 웹페이지: 북마클릿이 본문을 추려 notelayer 새 창으로 보낸다 ──
  const target = location.origin + location.pathname;
  const code = `(()=>{const U=${JSON.stringify(target + "#import")};`
    + "const R=document.querySelector('article')||document.querySelector('main')||document.body;"
    + "const P=[...R.querySelectorAll('h1,h2,h3,h4,p,li,blockquote,pre')]"
    + ".filter(e=>!e.closest('nav,footer,aside,form,[role=navigation]')&&!(e.parentElement&&e.parentElement.closest('p,li,blockquote,pre')))"
    + ".map(e=>e.tagName==='PRE'?e.innerText.trim():e.innerText.replace(/\\s+/g,' ').trim()).filter(t=>t.length>1).slice(0,500);"
    + "if(!P.length){alert('본문을 찾지 못했습니다');return}"
    + "const D={type:'notelayer-import',title:document.title,url:location.href,lang:(document.documentElement.lang||'').slice(0,2),paragraphs:P};"
    + "const W=window.open(U,'_blank');if(!W){alert('팝업이 막혔습니다. 이 사이트에서 팝업을 허용해 주세요');return}"
    + "let n=0;const T=setInterval(()=>{if(++n>80){clearInterval(T);return}try{W.postMessage(D,'*')}catch(e){}},250);"
    + "addEventListener('message',e=>{if(e.source===W&&e.data==='notelayer-ack')clearInterval(T)})})()";
  $("bookmarklet").href = `javascript:${encodeURIComponent(code)}`;
  $("bookmarklet").onclick = (e) => { e.preventDefault(); toast("누르지 말고 즐겨찾기 막대로 끌어다 놓으세요."); };
  $("bmNote").textContent = location.protocol === "file:"
    ? "지금은 파일로 연 화면이라, 웹페이지가 이 창을 열 수 없어 이 버튼이 동작하지 않습니다. 인터넷 주소로 연 notelayer(예: README 의 공개 데모)에서 버튼을 만드세요."
    : "글이 article·main 영역에 있는 블로그·문서 사이트에서 잘 됩니다. 로그인해야 보이는 글도 지금 보이는 만큼 가져옵니다. 가져온 글은 이 브라우저에만 저장됩니다.";

  // 북마클릿이 연 창(#import)에서만, 첫 번째 본문 하나만 받는다
  const importMode = location.hash === "#import";
  let imported = false;
  window.addEventListener("message", async (e) => {
    const d = e.data;
    if (!importMode || imported || !d || d.type !== "notelayer-import" || !Array.isArray(d.paragraphs)) return;
    imported = true;
    try { e.source?.postMessage("notelayer-ack", "*"); } catch {}
    await ready;
    const paragraphs = d.paragraphs.filter((t) => typeof t === "string" && t.trim()).map((t) => t.slice(0, 20000)).slice(0, 500);
    if (!paragraphs.length) { toast("가져올 본문이 없습니다."); return; }
    const lang = ["ko", "en", "ja", "zh"].includes(d.lang) ? d.lang : detectLang(paragraphs.join(" "));
    window.NL.addDocument({ title: String(d.title || "").slice(0, 200), lang, source: String(d.url || "웹페이지").slice(0, 500), paragraphs });
    history.replaceState(null, "", location.pathname);
    toast(`웹페이지를 문단 ${paragraphs.length}개짜리 새 문서로 가져왔습니다.`);
  });
  if (importMode) toast("웹페이지 본문을 받는 중…");

  // ── AI 표시 만들기: 요청문 복사 → LLM → 답 붙여 넣기 ──
  // 요청문 만들기·답 읽기는 prompt.js(웹페이지 위 표시 층과 공용)에 있다
  function buildPrompt() {
    const { doc, templateId, template } = window.NL.current();
    const needTr = doc.lang !== "ko" && !doc.blocks.every((b) => b.tr);
    return window.NL_PROMPT.build({ title: doc.title, paragraphs: doc.blocks, templateId, template, needTr });
  }
  const parseAnswer = (text, templateId) => window.NL_PROMPT.parseAnswer(text, templateId);
  const aiDlg = $("aiDialog");
  $("aiBtn").onclick = async () => {
    await ready;
    const { doc, template } = window.NL.current();
    $("aiTarget").textContent = `문서: ${doc.title} · 템플릿: ${template.name} · 문단 ${doc.blocks.length}개`;
    $("aiPrompt").value = buildPrompt();
    $("aiAnswer").value = ""; $("aiMsg").textContent = ""; $("aiCopyMsg").textContent = "";
    aiDlg.showModal();
  };
  $("aiCopy").onclick = async (e) => {
    e.preventDefault();
    const ta = $("aiPrompt");
    try { await navigator.clipboard.writeText(ta.value); }
    catch { ta.closest("details").open = true; ta.select(); document.execCommand("copy"); }
    $("aiCopyMsg").textContent = `복사했습니다(${ta.value.length.toLocaleString()}자). LLM 에 붙여 넣으세요.`;
  };
  $("aiApply").onclick = (e) => {
    e.preventDefault();
    const { templateId, aiMarks } = window.NL.current();
    let result;
    try { result = parseAnswer($("aiAnswer").value, templateId); }
    catch (err) { $("aiMsg").textContent = `읽지 못했습니다: ${err.message}`; return; }
    if (aiMarks > 0 && !confirm("지금 있는 AI 표시·설명을 이 답으로 바꿀까요? 내가 단 표시와 메모는 남습니다.")) return;
    const r = window.NL.applyAnnotations(result);
    const parts = [`표시 ${r.marks}개, 설명 ${r.boxes}개를 얹었습니다`];
    if (r.concepts) parts.push(`개념 ${r.concepts}개`);
    if (r.translated) parts.push(`번역 ${r.translated}문단`);
    if (r.lost.length) parts.push(`원문과 글자가 달라 뺀 표시 ${r.lost.length}개: ${r.lost.slice(0, 5).map((q) => `“${q}”`).join(", ")}${r.lost.length > 5 ? " …" : ""}`);
    $("aiMsg").textContent = parts.join(" · ");
    if (!r.lost.length) { aiDlg.close(); toast(parts.join(" · ")); }
  };
})();
