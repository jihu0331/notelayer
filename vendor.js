// notelayer 외부 도구 불러오기 — PDF 노트(pdfnote.js)가 쓴다.
// 외부 주소(CDN)에서 받는 실행 코드는 모두 해시(SRI)로 확인한다. 받은 파일이 한 글자라도 다르면 실행하지 않는다.
// 판을 올릴 때는 주소와 해시를 같이 바꾼다: curl -s <주소> | openssl dgst -sha384 -binary | openssl base64 -A
(() => {
  const VENDOR = {
    pdfjs: { src: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js", sri: "sha384-/1qUCSGwTur9vjf/z9lmu/eCUYbpOTgSjmpbMQZ1/CtX2v/WcAIKqRv+U1DUCG6e" },
    pdfjsWorker: { src: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js", sri: "sha384-SnzOobpRMLXZ52iJvZm/C0fYw0OQemTXzTjIsdsfMcrCtCEe9qgzxTd3RSklO5x2" },
    pdflib: { src: "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js", sri: "sha384-weMABwrltA6jWR8DDe9Jp5blk+tZQh7ugpCsF3JwSA53WZM9/14PjS5LAJNHNjAI" },
    mammoth: { src: "https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js", sri: "sha384-/cXAMbzovUIKbBERjPmR3SnPTh8siWr5lsvFYj1Uq4XP0yaJUZJmsh0YXyGv5P0y" },
  };
  const loaded = {};
  // 스크립트 태그에 해시를 걸어 불러온다. 주소창의 경로(문서 id 등)는 외부로 보내지 않는다(no-referrer)
  function load(name) {
    const v = VENDOR[name];
    loaded[name] ??= new Promise((ok, no) => {
      const s = document.createElement("script");
      s.src = v.src; s.integrity = v.sri; s.crossOrigin = "anonymous"; s.referrerPolicy = "no-referrer";
      s.onload = ok;
      s.onerror = () => { delete loaded[name]; no(new Error("읽기 도구를 내려받지 못했습니다(인터넷 연결 확인, 또는 파일이 바뀌어 확인에 실패)")); };
      document.head.appendChild(s);
    });
    return loaded[name];
  }
  // pdf.js 는 일꾼 코드를 따로 띄운다. 일꾼 주소에는 해시를 걸 수 없어서, 해시를 확인하며 받아 온 다음 이 주소 안의 임시 주소(blob)로 띄운다
  let workerUrl = null;
  async function pdfjs() {
    await load("pdfjs");
    const lib = window.pdfjsLib;
    if (!workerUrl) {
      const w = VENDOR.pdfjsWorker;
      const r = await fetch(w.src, { integrity: w.sri, mode: "cors", credentials: "omit", referrerPolicy: "no-referrer" });
      if (!r.ok) throw new Error("PDF 읽기 도구를 내려받지 못했습니다");
      workerUrl = URL.createObjectURL(new Blob([await r.text()], { type: "text/javascript" }));
    }
    lib.GlobalWorkerOptions.workerSrc = workerUrl;
    return lib;
  }
  async function mammoth() { await load("mammoth"); return window.mammoth; }
  // pdf-lib: PDF 파일에 주석·첨부 파일을 써 넣는다(pdf.js 는 읽고 그리기만 한다)
  async function pdflib() { await load("pdflib"); return window.PDFLib; }
  window.NL_VENDOR = { pdfjs, mammoth, pdflib };
})();
