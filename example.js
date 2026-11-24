// notelayer 예시 화면 — 저장소의 예시 문서를 평범한 글 페이지로 펼치고, 그 위에 표시 층(overlay.js)을
// 읽던 페이지에서 켰을 때와 똑같은 모습으로 얹는다. 표시·설명·요약·중요도·번역은 예시 문서 파일에 든 것을 적용한다.
// 예시라 고친 내용은 저장하지 않는다(NL_HOST.ephemeral). 저장 창도 열지 않는다
(() => {
  const EXAMPLES = {
    exam: { name: "시험공부 노트", file: "documents/http-vs-http2.js", id: "http", tpl: "exam" },
    tech: { name: "기술 문서 입문", file: "documents/rfc9113-intro.js", id: "rfc", tpl: "tech" },
  };
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const key = EXAMPLES[params.get("t")] ? params.get("t") : "exam";
  const ex = EXAMPLES[key];

  $("switch").replaceChildren(...Object.entries(EXAMPLES).map(([k, e]) => {
    const a = document.createElement("a");
    a.href = `example.html?t=${k}`; a.textContent = e.name;
    if (k === key) a.setAttribute("aria-current", "page");
    return a;
  }));

  const loadScript = (src) => new Promise((ok, no) => {
    const s = document.createElement("script");
    s.src = `${src}?v=${Date.now()}`; s.onload = ok; s.onerror = () => no(new Error(src));
    document.head.appendChild(s);
  });
  const fail = (msg) => { $("doc").replaceChildren(Object.assign(document.createElement("p"), { className: "err", textContent: msg })); };

  (async () => {
    try {
      window.NL_DOCS = [];
      await loadScript("templates.js");
      await loadScript("prompt.js");
      await loadScript(ex.file);
    } catch (err) { fail(`예시 파일을 읽지 못했습니다: ${err.message}`); return; }
    const doc = window.NL_DOCS.find((d) => d.id === ex.id);
    const ann = doc?.annotations?.[ex.tpl];
    if (!doc || !ann) { fail("예시 문서를 찾지 못했습니다."); return; }

    // 글 페이지 펼치기: 제목·출처는 문단 번호에 넣지 않고, 본문 문단만 표시 층에 넘긴다(p 번호가 예시 문서와 같아야 표시가 제자리에 붙는다)
    document.title = `${doc.title} — notelayer 예시(${ex.name})`;
    const article = $("doc");
    const h1 = Object.assign(document.createElement("h1"), { textContent: doc.title });
    const src = Object.assign(document.createElement("p"), { className: "src", textContent: `출처: ${doc.source}` });
    const paragraphs = doc.blocks.map((b) => {
      const el = document.createElement("p");
      el.textContent = b.text;
      return { p: b.p, el, text: b.text };
    });
    article.replaceChildren(h1, src, ...paragraphs.map((x) => x.el));

    // 저장하지 않는 기록 칸: 표시 층의 인사·불러오기에만 답한다
    window.NL_HOST = {
      kind: "example", key: `${location.origin}${location.pathname}?t=${key}`, root: article, paragraphs,
      inline: true, compact: true, ephemeral: true,
      request: async (msg) => {
        if (msg?.type === "hello") return { type: "ready", folder: false };
        if (msg?.type === "load") return { type: "loaded", record: null };
        return { type: "saved", at: Date.now(), file: false };
      },
    };
    try { await loadScript("overlay.js"); } catch (err) { fail(`표시 층을 불러오지 못했습니다: ${err.message}`); return; }

    // 표시 층이 준비되면 예시 문서의 표시·설명·요약·중요도와(원문이 한국어가 아니면) 번역을 적용한다
    for (let i = 0; i < 40 && !window.NL_OVERLAY?.info().store; i++) await new Promise((ok) => setTimeout(ok, 100));
    const ov = window.NL_OVERLAY;
    if (!ov) { fail("표시 층을 켜지 못했습니다."); return; }
    const translations = doc.blocks.filter((b) => b.tr).map((b) => ({ p: b.p, text: b.tr }));
    ov.useTemplate(ex.tpl);
    // 설명 분량: 같은 글에 간단히·중간·상세히 판을 바꿔 얹어 비교한다(「AI 답 넣기」 의 설명 분량 고르기와 같은 세 단계)
    const sets = { brief: ann.detail?.brief, mid: ann.boxes, deep: ann.detail?.deep };
    const show = (k) => {
      const { detail, ...rest } = ann;
      // 예시는 묻지 않고 통째로 갈아 끼운다(apply 는 이미 있는 AI 설명을 바꿀지 매번 묻는다)
      const parsed = window.NL_PROMPT.parseAnswer(JSON.stringify({ ...rest, boxes: sets[k] || ann.boxes, ...(translations.length ? { translations } : {}) }), ex.tpl);
      ov.restore(parsed);
      for (const btn of $("detail").querySelectorAll("button")) btn.setAttribute("aria-pressed", String(btn.dataset.k === k));
    };
    $("detail").replaceChildren(
      Object.assign(document.createElement("span"), { className: "lab", textContent: "설명 분량" }),
      ...[["brief", "간단히"], ["mid", "중간"], ["deep", "상세히"]].map(([k, label]) => {
        const btn = Object.assign(document.createElement("button"), { type: "button", textContent: `${label} ${(sets[k] || []).length}` });
        btn.dataset.k = k;
        btn.onclick = () => show(k);
        return btn;
      }));
    show("mid");
  })();
})();
