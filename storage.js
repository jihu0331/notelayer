// notelayer 저장 코드 — 저장 창(store.html)과 PDF 노트(pdf.html)가 함께 쓴다. 서버로 보내지 않는다.
// - 표시·설명 기록: 이 브라우저의 notelayer 칸(IndexedDB "notelayer-store" 의 pages), 연결한 폴더의 *.notelayer.json
// - PDF 원본: IndexedDB "notelayer-pdf" 의 files, 연결한 폴더의 pdf-<id>.pdf
// 누가 요청했는지 확인하는 일(보안)은 부르는 쪽이 한다. 저장 창은 자기를 연 페이지만, PDF 노트는 같은 주소의 자기 화면만 부른다
(() => {
  const MAX_BYTES = 4 * 1024 * 1024;

  // ── 이 브라우저의 notelayer 칸 ──
  // 기록 칸은 저장 창이 처음 만든 판(1)을 그대로 쓴다. PDF 원본은 판 올리기 없이 따로 칸을 둔다
  // (판을 올리면 예전 저장 창이 열려 있는 동안 막히거나, 캐시에 남은 예전 코드가 열지 못한다)
  const opener = (name, setup) => {
    let p = null;
    return () => (p ??= new Promise((ok, no) => {
      const r = indexedDB.open(name, 1);
      r.onupgradeneeded = () => setup(r.result);
      r.onsuccess = () => ok(r.result);
      r.onerror = () => no(r.error);
    }));
  };
  const recDb = opener("notelayer-store", (d) => { d.createObjectStore("pages", { keyPath: "key" }); d.createObjectStore("meta"); });
  const pdfDb = opener("notelayer-pdf", (d) => { d.createObjectStore("files", { keyPath: "id" }); });
  const req = (r) => new Promise((ok, no) => { r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
  const os = async (db, name, mode = "readonly") => (await db()).transaction(name, mode).objectStore(name);
  const getPage = async (key) => req((await os(recDb, "pages")).get(key));
  const putPage = async (rec) => req((await os(recDb, "pages", "readwrite")).put(rec));
  const delPage = async (key) => req((await os(recDb, "pages", "readwrite")).delete(key));
  const allPages = async () => req((await os(recDb, "pages")).getAll());
  const getMeta = async (k) => req((await os(recDb, "meta")).get(k));
  const putMeta = async (k, v) => req((await os(recDb, "meta", "readwrite")).put(v, k));
  const delMeta = async (k) => req((await os(recDb, "meta", "readwrite")).delete(k));
  const getPdf = async (id) => req((await os(pdfDb, "files")).get(id));
  const putPdf = async (rec) => req((await os(pdfDb, "files", "readwrite")).put(rec));
  const delPdf = async (id) => req((await os(pdfDb, "files", "readwrite")).delete(id));
  const allPdfs = async () => req((await os(pdfDb, "files")).getAll());

  // ── 내 PC 폴더 ── state: none(안 고름) | granted(쓸 수 있음) | prompt(다시 허용해야 함) | stuck(확인이 끝나지 않음)
  const canFolder = "showDirectoryPicker" in window;
  // 폴더 확인(저장해 둔 폴더 꺼내기·권한 묻기)이 끝나지 않는 일이 있었다. 저장 창은 연결 인사·저장·화면 그리기가
  // 모두 이 확인을 기다리므로 창 전체가 「연결을 기다리는 중」에 멈췄다. 시간 제한을 넘기면 폴더 없이 진행한다
  const late = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error("timeout")), ms))]);
  async function folder(ask = false) {
    const dir = await late(getMeta("dir"), 3000).catch(() => null);
    if (!dir) return { dir: null, state: "none", name: "" };
    let p;
    try { p = await late(dir.queryPermission({ mode: "readwrite" }), 2000); }
    catch { return { dir: null, state: "stuck", name: dir.name || "" }; }
    if (p !== "granted" && ask) p = await dir.requestPermission({ mode: "readwrite" });
    return p === "granted" ? { dir, state: "granted", name: dir.name || "" } : { dir: null, state: "prompt", name: dir.name || "" };
  }
  function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
  // notelayer 자기 주소의 PDF 노트(pdf.html?doc=…)인지. 맞으면 문서 id 를 돌려준다.
  // 다른 사이트가 주소 끝을 pdf.html?doc=… 로 꾸며도 PDF 노트 기록과 같은 파일 이름을 얻지 못하게 출처와 경로를 함께 본다
  const PDF_PAGE = new URL("pdf.html", location.href);
  function pdfDocId(key) {
    try {
      const u = new URL(key);
      return u.origin === PDF_PAGE.origin && u.pathname === PDF_PAGE.pathname ? u.searchParams.get("doc") || null : null;
    } catch { return null; }
  }
  const safeId = (id) => String(id).replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 90);
  // 파일 이름은 주소로 정해진다. 다른 PC 에서 같은 폴더를 연결하면 같은 이름으로 찾는다. 물음표 뒤는 이름에 넣지 않고 끝의 짧은 해시로만 구분한다.
  // PDF 노트의 기록은 원본 파일(pdf-<id>.pdf) 옆에 pdf-<id>.notelayer.json 으로 둔다
  function fileName(key) {
    const doc = pdfDocId(key);
    if (doc) return `pdf-${safeId(doc)}.notelayer.json`;
    const u = new URL(key);
    const slug = `${u.host}${u.pathname}`.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 80);
    return `${slug}-${hash(key)}.notelayer.json`;
  }
  const pdfFileName = (id) => `pdf-${safeId(id)}.pdf`;
  async function writeFile(dir, rec) {
    const w = await (await dir.getFileHandle(fileName(rec.key), { create: true })).createWritable();
    await w.write(JSON.stringify(rec, null, 1));
    await w.close();
  }
  // 파일 안에 적힌 주소가 찾는 주소와 같을 때만 돌려준다(이름이 같아도 다른 주소의 기록은 믿지 않는다)
  async function readFile(dir, key) {
    try {
      const rec = JSON.parse(await (await (await dir.getFileHandle(fileName(key))).getFile()).text());
      return rec?.key === key ? rec : null;
    } catch { return null; }
  }
  async function removeFile(dir, key) { try { await dir.removeEntry(fileName(key)); } catch {} }
  async function writeBlob(dir, name, blob) {
    const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
    await w.write(blob);
    await w.close();
  }
  async function readBlob(dir, name) { try { return await (await dir.getFileHandle(name)).getFile(); } catch { return null; } }
  async function removeEntry(dir, name) { try { await dir.removeEntry(name); } catch {} }
  async function listNames(dir) { const out = []; try { for await (const [name, h] of dir.entries()) if (h.kind === "file") out.push(name); } catch {} return out; }

  const httpUrl = (u) => { try { const x = new URL(u); return x.protocol === "https:" || x.protocol === "http:" ? x.href : null; } catch { return null; } };
  function clean(data) {
    const s = JSON.stringify(data ?? null);
    if (s.length > MAX_BYTES) throw new Error("저장할 내용이 너무 큽니다");
    return JSON.parse(s);
  }
  const counts = (data) => ({ marks: Array.isArray(data?.marks) ? data.marks.length : 0, boxes: Array.isArray(data?.boxes) ? data.boxes.length : 0 });

  // ── 기록 꺼내기·저장·지우기 (표시 층이 보낸 요청 하나를 처리해 답을 돌려준다) ──
  async function handle(d) {
    if (d.type === "hello") return { type: "ready", folder: !!(await folder()).dir };
    if (d.type === "load") {
      let rec = await getPage(d.key), from = "browser";
      if (!rec) {
        const { dir } = await folder();
        const f = dir && await readFile(dir, d.key);
        if (f && f.key === d.key) { rec = f; from = "folder"; await putPage(rec); }
      }
      return { type: "loaded", record: rec ? { data: rec.data, savedAt: rec.savedAt } : null, from };
    }
    if (d.type === "save") {
      const rec = { v: 1, key: d.key, url: httpUrl(d.key) || d.key, title: String(d.title || "").slice(0, 300), savedAt: Date.now(),
        data: clean(d.data), paragraphs: Array.isArray(d.paragraphs) ? clean(d.paragraphs.filter((t) => typeof t === "string")) : [] };
      await putPage(rec);
      let file = false;
      const { dir } = await folder();
      if (dir) try { await writeFile(dir, rec); file = true; } catch {}
      return { type: "saved", at: rec.savedAt, file };
    }
    if (d.type === "delete") {
      await delPage(d.key);
      const { dir } = await folder();
      if (dir) await removeFile(dir, d.key);
      return { type: "deleted" };
    }
    return { type: "error", message: "모르는 요청입니다" };
  }

  // 폴더를 처음 연결하거나 다시 허용하면, 이 브라우저에만 있던 기록·PDF 원본을 폴더에도 써 둔다
  async function syncFolder() {
    const { dir } = await folder();
    if (!dir) return;
    for (const rec of await allPages()) {
      const f = await readFile(dir, rec.key);
      if (!f || (f.savedAt || 0) < rec.savedAt) await writeFile(dir, rec).catch(() => {});
    }
    const names = new Set(await listNames(dir));
    for (const p of await allPdfs().catch(() => [])) {
      if (!names.has(pdfFileName(p.id))) await writeBlob(dir, pdfFileName(p.id), p.blob).catch(() => {});
    }
  }

  window.NL_STORAGE = {
    getPage, putPage, delPage, allPages, getMeta, putMeta, delMeta,
    getPdf, putPdf, delPdf, allPdfs,
    canFolder, folder, fileName, pdfFileName, pdfDocId, writeFile, readFile, removeFile, writeBlob, readBlob, removeEntry, listNames,
    httpUrl, clean, counts, handle, syncFolder,
  };
})();
