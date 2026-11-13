// notelayer 저장 창 — 웹페이지 위 표시 층(overlay.js)이 표시·설명을 이 PC 에 저장하고 다시 꺼낼 때 쓰는 창.
// notelayer 주소에서 열리므로 저장한 내용은 표시를 단 사이트가 읽지 못한다. 서버로 보내지 않는다.
// - 기본: 이 브라우저의 notelayer 칸(IndexedDB)
// - 선택: 사용자가 고른 PC 폴더에 페이지마다 파일 하나(크롬·엣지의 폴더 쓰기 기능). 동기화 폴더에 두면 다른 PC 에서도 열린다
// 보안: 메시지를 보낸 창이 이 창을 연 페이지(opener)이고, 요청한 기록의 주소가 그 페이지와 같은 출처일 때만 응답한다.
//       그래서 다른 사이트가 이 창을 열어도 남의 페이지 기록은 꺼내 가지 못한다. 받은 내용은 글자로만 그린다.
(() => {
  const $ = (id) => document.getElementById(id);
  const MAX_BYTES = 4 * 1024 * 1024;

  // ── 이 브라우저의 notelayer 칸 ──
  let dbp = null;
  const db = () => (dbp ??= new Promise((ok, no) => {
    const r = indexedDB.open("notelayer-store", 1);
    r.onupgradeneeded = () => { r.result.createObjectStore("pages", { keyPath: "key" }); r.result.createObjectStore("meta"); };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
  }));
  const req = (r) => new Promise((ok, no) => { r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
  const os = async (name, mode = "readonly") => (await db()).transaction(name, mode).objectStore(name);
  const getPage = async (key) => req((await os("pages")).get(key));
  const putPage = async (rec) => req((await os("pages", "readwrite")).put(rec));
  const delPage = async (key) => req((await os("pages", "readwrite")).delete(key));
  const allPages = async () => req((await os("pages")).getAll());
  const getMeta = async (k) => req((await os("meta")).get(k));
  const putMeta = async (k, v) => req((await os("meta", "readwrite")).put(v, k));
  const delMeta = async (k) => req((await os("meta", "readwrite")).delete(k));

  // ── 내 PC 폴더 ──
  const canFolder = "showDirectoryPicker" in window;
  let folderState = "none"; // none | granted | prompt
  async function folder(ask = false) {
    const dir = await getMeta("dir").catch(() => null);
    if (!dir) { folderState = "none"; return null; }
    let p = await dir.queryPermission({ mode: "readwrite" });
    if (p !== "granted" && ask) p = await dir.requestPermission({ mode: "readwrite" });
    folderState = p === "granted" ? "granted" : "prompt";
    return p === "granted" ? dir : null;
  }
  function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
  // 파일 이름은 주소로 정해진다. 다른 PC 에서 같은 폴더를 연결하면 같은 이름으로 찾는다
  function fileName(key) {
    const u = new URL(key);
    const slug = `${u.host}${u.pathname}${u.search}`.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 80);
    return `${slug}-${hash(key)}.notelayer.json`;
  }
  async function writeFile(dir, rec) {
    const w = await (await dir.getFileHandle(fileName(rec.key), { create: true })).createWritable();
    await w.write(JSON.stringify(rec, null, 1));
    await w.close();
  }
  async function readFile(dir, key) {
    try { return JSON.parse(await (await (await dir.getFileHandle(fileName(key))).getFile()).text()); } catch { return null; }
  }
  async function removeFile(dir, key) { try { await dir.removeEntry(fileName(key)); } catch {} }

  // ── 표시 층과 주고받기 ──
  let current = null; // { key, url, title }
  const sameOrigin = (key, origin) => { try { return new URL(key).origin === origin; } catch { return false; } };
  const httpUrl = (u) => { try { const x = new URL(u); return x.protocol === "https:" || x.protocol === "http:" ? x.href : null; } catch { return null; } };
  function clean(data) {
    const s = JSON.stringify(data ?? null);
    if (s.length > MAX_BYTES) throw new Error("저장할 내용이 너무 큽니다");
    return JSON.parse(s);
  }
  const counts = (data) => ({ marks: Array.isArray(data?.marks) ? data.marks.length : 0, boxes: Array.isArray(data?.boxes) ? data.boxes.length : 0 });

  window.addEventListener("message", async (e) => {
    const d = e.data;
    if (!d || d.nl !== "page" || !window.opener || e.source !== window.opener) return;
    const reply = (msg) => e.source.postMessage({ nl: "store", id: d.id, ...msg }, e.origin);
    if (typeof d.key !== "string" || !sameOrigin(d.key, e.origin)) { reply({ type: "error", message: "요청한 주소가 이 페이지의 주소와 맞지 않습니다" }); return; }
    try {
      if (d.type === "hello") {
        current = { key: d.key, url: httpUrl(d.url) || d.key, title: String(d.title || "").slice(0, 300) };
        reply({ type: "ready", folder: !!(await folder()) });
        render();
      } else if (d.type === "load") {
        let rec = await getPage(d.key), from = "browser";
        if (!rec) {
          const dir = await folder();
          const f = dir && await readFile(dir, d.key);
          if (f && f.key === d.key) { rec = f; from = "folder"; await putPage(rec); }
        }
        reply({ type: "loaded", record: rec ? { data: rec.data, savedAt: rec.savedAt } : null, from });
        render();
      } else if (d.type === "save") {
        const rec = { v: 1, key: d.key, url: httpUrl(d.url) || d.key, title: String(d.title || "").slice(0, 300), savedAt: Date.now(),
          data: clean(d.data), paragraphs: Array.isArray(d.paragraphs) ? clean(d.paragraphs.filter((t) => typeof t === "string")) : [] };
        await putPage(rec);
        let file = false;
        const dir = await folder();
        if (dir) try { await writeFile(dir, rec); file = true; } catch {}
        reply({ type: "saved", at: rec.savedAt, file });
        render();
      } else if (d.type === "delete") {
        await delPage(d.key);
        const dir = await folder();
        if (dir) await removeFile(dir, d.key);
        reply({ type: "deleted" });
        render();
      }
    } catch (err) {
      reply({ type: "error", message: String(err?.message || err) });
    }
  });

  // ── 화면 ──
  const fmt = (t) => new Date(t).toLocaleString();
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k.startsWith("on")) n.addEventListener(k.slice(2), v); else if (k === "class") n.className = v; else n.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) n.append(kid instanceof Node ? kid : String(kid));
    return n;
  };
  function download(rec) {
    const a = el("a", { href: URL.createObjectURL(new Blob([JSON.stringify(rec, null, 1)], { type: "application/json" })), download: fileName(rec.key) });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  async function render() {
    const pages = (await allPages().catch(() => [])).sort((a, b) => b.savedAt - a.savedAt);
    await folder().catch(() => null);
    // 지금 페이지
    const cur = current && pages.find((p) => p.key === current.key);
    const opener = window.opener;
    $("curBody").replaceChildren(
      !current ? (opener ? "표시 층과 연결을 기다리는 중…" : "웹페이지에서 「이 페이지 위에 표시하기」를 누르면 이 창이 그 페이지와 연결됩니다.")
        : el("div", {}, el("div", { class: "title" }, current.title || current.key),
          el("div", { class: cur ? "muted ok" : "muted" }, cur
            ? `저장됨 · ${fmt(cur.savedAt)} · 표시 ${counts(cur.data).marks}개 · 설명 ${counts(cur.data).boxes}개`
            : "아직 저장한 표시가 없습니다. 답을 적용하거나 고치면 자동으로 저장됩니다."),
          opener?.closed ? el("div", { class: "muted" }, "원래 페이지가 닫혔습니다. 이 창은 닫아도 됩니다.") : null,
          cur ? el("div", { class: "row" }, el("button", { onclick: () => download(cur) }, "이 페이지 파일로 내려받기")) : null));
    // 폴더
    const btns = [];
    if (!canFolder) {
      $("folderBody").textContent = "이 브라우저는 폴더에 직접 쓰는 기능이 없습니다(크롬·엣지에서 됩니다). 대신 「이 페이지 파일로 내려받기」와 「파일 불러오기」를 쓰세요.";
    } else if (folderState === "none") {
      $("folderBody").textContent = "폴더를 한 번 고르면 저장할 때마다 페이지마다 파일 하나씩 그 폴더에도 씁니다. 브라우저 기록을 지워도 남고, OneDrive·구글 드라이브 같은 동기화 폴더에 두면 다른 PC 에서도 같은 표시가 열립니다.";
      btns.push(el("button", { class: "primary", onclick: pickFolder }, "폴더 고르기"));
    } else {
      const dir = await getMeta("dir");
      $("folderBody").replaceChildren(el("span", { class: folderState === "granted" ? "ok" : "err" },
        folderState === "granted" ? `${dir.name ? `「${dir.name}」` : "고른"} 폴더에도 저장하고 있습니다.` : `${dir.name ? `「${dir.name}」` : "고른"} 폴더를 쓰려면 다시 허용해야 합니다(브라우저를 새로 열면 다시 묻습니다).`));
      if (folderState !== "granted") btns.push(el("button", { class: "primary", onclick: async () => { await folder(true); await syncFolder(); render(); } }, "폴더 다시 허용"));
      btns.push(el("button", { onclick: pickFolder }, "다른 폴더로 바꾸기"));
      btns.push(el("button", { onclick: async () => { await delMeta("dir"); render(); } }, "연결 끊기"));
    }
    $("folderBtns").replaceChildren(...btns);
    // 목록
    $("count").textContent = pages.length ? `${pages.length}개` : "";
    $("list").replaceChildren(...(pages.length ? pages.map((p) => {
      const url = httpUrl(p.url);
      const c = counts(p.data);
      let host = ""; try { host = new URL(p.key).host; } catch {}
      return el("li", { class: current?.key === p.key ? "here" : "" },
        el("div", { class: "grow" },
          url ? el("a", { href: url, target: "_blank", rel: "noopener noreferrer", title: url }, p.title || url) : el("span", { class: "title" }, p.title || p.key),
          el("div", { class: "muted" }, `${host} · ${fmt(p.savedAt)} · 표시 ${c.marks} · 설명 ${c.boxes}`)),
        el("button", { title: "파일로 내려받기", onclick: () => download(p) }, "⤓"),
        el("button", { title: "지우기", onclick: async () => {
          if (!confirm(`「${p.title || p.key}」 에 저장한 표시를 지울까요?`)) return;
          await delPage(p.key);
          const dir = await folder();
          if (dir) await removeFile(dir, p.key);
          render();
        } }, "✕"));
    }) : [el("li", { class: "muted" }, "아직 없습니다.")]));
  }

  async function pickFolder() {
    try {
      const dir = await window.showDirectoryPicker({ id: "notelayer", mode: "readwrite" });
      await putMeta("dir", dir);
      await folder(true);
      await syncFolder();
    } catch (err) {
      if (err?.name !== "AbortError") alert(`폴더를 연결하지 못했습니다: ${err?.message || err}`);
    }
    render();
  }
  // 폴더를 처음 연결하거나 다시 허용하면, 이 브라우저에만 있던 기록을 폴더에도 써 둔다
  async function syncFolder() {
    const dir = await folder();
    if (!dir) return;
    for (const rec of await allPages()) {
      const f = await readFile(dir, rec.key);
      if (!f || (f.savedAt || 0) < rec.savedAt) await writeFile(dir, rec).catch(() => {});
    }
  }

  $("importBtn").onclick = () => $("importFile").click();
  $("importFile").onchange = async (e) => {
    let n = 0;
    for (const f of e.target.files) {
      try {
        const rec = JSON.parse(await f.text());
        if (typeof rec?.key !== "string" || !httpUrl(rec.key) || typeof rec.data !== "object") continue;
        const old = await getPage(rec.key);
        if (!old || (old.savedAt || 0) <= (rec.savedAt || 0)) { await putPage({ ...rec, data: clean(rec.data), savedAt: Number(rec.savedAt) || Date.now() }); n++; }
      } catch {}
    }
    e.target.value = "";
    alert(`${n}개 페이지의 표시를 불러왔습니다.`);
    render();
  };

  // 원래 페이지가 닫혔는지 가끔 확인한다
  let closedShown = false;
  setInterval(() => { if (current && !closedShown && window.opener?.closed) { closedShown = true; render(); } }, 3000);
  render();
})();
