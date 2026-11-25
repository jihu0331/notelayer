// notelayer 저장 창 — 웹페이지 위 표시 층(overlay.js)이 표시·설명을 이 PC 에 저장하고 다시 꺼낼 때 쓰는 창.
// notelayer 주소에서 열리므로 다른 사이트는 저장한 내용을 꺼내 가지 못한다. 서버로 보내지 않는다.
// 다만 표시는 그 페이지 위에 그려지므로, 그 사이트 자신은 자기 페이지에 단 메모를 볼 수 있다(화면 문구도 그렇게 쓴다).
// - 기본: 이 브라우저의 notelayer 칸(IndexedDB)
// - 선택: 사용자가 고른 PC 폴더에 페이지마다 파일 하나(크롬·엣지의 폴더 쓰기 기능). 동기화 폴더에 두면 다른 PC 에서도 열린다
// 보안: 메시지를 보낸 창이 이 창을 연 페이지(opener)이고, 요청한 기록의 주소가 그 페이지와 같은 출처일 때만 응답한다.
//       또 이 창 하나는 처음 인사한 페이지 한 개의 기록만 다룬다(같은 사이트의 다른 글 기록을 줄줄이 꺼내 가지 못하게).
//       그래서 다른 사이트가 이 창을 열어도 남의 페이지 기록은 꺼내 가지 못한다. 받은 내용은 글자로만 그린다.
(() => {
  const $ = (id) => document.getElementById(id);
  const S = window.NL_STORAGE;
  const { getPage, putPage, delPage, allPages, getMeta, putMeta, delMeta, canFolder, fileName, readFile, removeFile, httpUrl, clean, counts } = S;

  // ── 내 PC 폴더 ──
  // 블로그 같은 다른 사이트가 띄운 작은 저장 창(팝업) 안에서는 크롬이 폴더 고르는 창을 열지 않고 곧바로 「취소」를 돌려준다
  // (실제 크롬 157 에서 확인: 팝업 0.04초 만에 취소, 일반 탭은 정상). 그래서 폴더 고르기·다시 허용은 저장 창을 일반 탭으로 열어 거기서 하고,
  // 고른 결과는 같은 출처끼리 쓰는 알림 통로(BroadcastChannel)로 작은 저장 창에 알린다
  // 새 탭으로 연 저장 창: ?folder=1(폴더 고르기) 또는 ?import=1(파일 불러오기). 작은 팝업에서는 크롬이 고르는 창을 바로 취소한다
  const IMPORT_TAB = new URLSearchParams(location.search).has("import");
  const FOLDER_TAB = new URLSearchParams(location.search).has("folder") || IMPORT_TAB;
  const IN_POPUP = !!window.opener && !FOLDER_TAB;
  const bc = "BroadcastChannel" in window ? new BroadcastChannel("notelayer-store") : null;
  let folderState = "none", folderName = ""; // none | granted | prompt | stuck(확인이 끝나지 않음)
  async function folder(ask = false) {
    const r = await S.folder(ask);
    folderState = r.state; folderName = r.name || "";
    return r.dir;
  }

  // ── 표시 층과 주고받기 ──
  let current = null; // { key, url, title, origin }
  const sameOrigin = (key, origin) => { try { return new URL(key).origin === origin; } catch { return false; } };

  // 즐겨찾기가 표시 층 코드를 달라고 하면 이 창이 자기 주소에서 읽어 넘겨준다. 넘겨주는 것은 공개된 앱 코드뿐이다.
  // - 시험용: 블로그 페이지가 localhost 에서 직접 파일을 받으면 크롬이 사이트마다 「로컬 네트워크 액세스」 허락을 요구한다.
  //   따로 연 창끼리 주고받는 것은 허락이 필요 없다
  // - 공개용: 사이트 보안 설정(CSP)이 다른 주소의 스크립트 파일을 막으면(예: Microsoft Learn·위키백과) 즐겨찾기가 이 길로 되살린다
  const appCode = async () => (await Promise.all(["templates.js", "prompt.js", "overlay.js"]
    .map((f) => fetch(`${f}?v=${Date.now()}`, { cache: "no-store" }).then((r) => { if (!r.ok) throw new Error(f); return r.text(); })))).join("\n;\n");

  window.addEventListener("message", async (e) => {
    const d = e.data;
    if (d?.nl === "dev-code-req") { // 이름은 시험용 때 붙인 그대로 둔다(이미 끌어다 둔 시험용 즐겨찾기가 이 이름으로 묻는다)
      if (window.opener && e.source === window.opener) appCode().then((code) => e.source.postMessage({ nl: "dev-code", code }, e.origin)).catch(() => {});
      return;
    }
    if (!d || d.nl !== "page" || !window.opener || e.source !== window.opener) return;
    const reply = (msg) => e.source.postMessage({ nl: "store", id: d.id, ...msg }, e.origin);
    if (typeof d.key !== "string" || !sameOrigin(d.key, e.origin)) { reply({ type: "error", message: "요청한 주소가 이 페이지의 주소와 맞지 않습니다" }); return; }
    // 닫힌 쪽이 기본: 인사로 페이지가 정해지기 전에는 다른 요청을 받지 않고, 정해진 다음에는 그 페이지 하나만 다룬다
    if (!current && d.type !== "hello") { reply({ type: "error", message: "아직 연결되지 않았습니다" }); return; }
    if (current && d.key !== current.key) { reply({ type: "error", message: "이 저장 창은 다른 페이지와 연결되어 있습니다" }); return; }
    try {
      if (d.type === "hello") {
        // 연결된 다음 다시 오는 인사(같은 페이지가 되풀이해 보낸 것)는 연결을 바꾸지 않고 답만 한다
        current ??= { key: d.key, url: httpUrl(d.key) || d.key, title: String(d.title || "").slice(0, 300), origin: e.origin };
      }
      if (["hello", "load", "save", "delete"].includes(d.type)) {
        reply(await S.handle(d));
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

  // 화면은 블로그 쪽 메시지가 올 때마다 다시 그린다. 내용이 그대로인 칸은 다시 만들지 않는다 —
  // 누르는 도중에 버튼이 새것으로 바뀌면 클릭이 사라졌다(창이 막 열려 연결 인사가 여러 번 오는 동안)
  const drawn = {};
  const changed = (part, sig) => (drawn[part] === sig ? false : ((drawn[part] = sig), true));
  // 처음 화면 그리기가 끝나지 않으면(브라우저 저장소가 답하지 않으면) 「연결을 기다리는 중」에 말없이 멈춰 있지 않고 알린다
  let drawnOnce = false;
  setTimeout(() => { if (!drawnOnce) status("이 브라우저의 notelayer 저장소가 답하지 않습니다. 크롬 창을 모두 닫았다가 다시 연 다음 즐겨찾기를 다시 눌러 주세요.", true); }, 6000);
  async function render() {
    const pages = (await allPages().catch(() => [])).sort((a, b) => b.savedAt - a.savedAt);
    await folder().catch(() => null);
    const dirName = folderState === "none" ? "" : folderName;
    drawnOnce = true;
    // 지금 페이지
    const cur = current && pages.find((p) => p.key === current.key);
    const opener = window.opener;
    if (changed("cur", JSON.stringify([current?.key, current?.title, !!opener, opener?.closed, cur?.savedAt, cur && counts(cur.data)]))) $("curBody").replaceChildren(
      !current ? (opener ? "표시 층과 연결을 기다리는 중…" : "웹페이지에서 「notelayer 켜기」를 누르면 이 창이 그 페이지와 연결됩니다.")
        : el("div", {}, el("div", { class: "title" }, current.title || current.key),
          el("div", { class: cur ? "muted ok" : "muted" }, cur
            ? `저장됨 · ${fmt(cur.savedAt)} · 표시 ${counts(cur.data).marks}개 · 설명 ${counts(cur.data).boxes}개`
            : "아직 저장한 표시가 없습니다. 답을 적용하거나 고치면 자동으로 저장됩니다."),
          opener?.closed ? el("div", { class: "muted" }, "원래 페이지가 닫혔습니다. 이 창은 닫아도 됩니다.") : null,
          cur ? el("div", { class: "row" }, el("button", { onclick: () => download(cur) }, "이 페이지 파일로 내려받기")) : null));
    // 폴더
    if (changed("folder", JSON.stringify([canFolder, folderState, dirName]))) renderFolder(dirName);
    // 목록
    if (changed("list", JSON.stringify([current?.key, pages.map((p) => [p.key, p.savedAt, p.title])]))) renderList(pages);
  }
  function renderFolder(dirName) {
    const btns = [];
    if (!canFolder) {
      $("folderBody").textContent = "이 브라우저는 폴더에 직접 쓰는 기능이 없습니다(크롬·엣지에서 됩니다). 대신 「이 페이지 파일로 내려받기」와 「파일 불러오기」를 쓰세요.";
    } else if (folderState === "none") {
      $("folderBody").textContent = "폴더를 한 번 고르면 저장할 때마다 페이지마다 파일 하나씩 그 폴더에도 씁니다. 브라우저 기록을 지워도 남고, OneDrive·구글 드라이브 같은 동기화 폴더에 두면 다른 PC 에서도 같은 표시가 열립니다."
        + (IN_POPUP ? " 이 작은 창에서는 크롬이 폴더 창을 열지 않아서, 누르면 새 탭에서 고릅니다." : "");
      btns.push(folderAction("폴더 고르기", true, pickFolder));
    } else {
      const label = dirName ? `「${dirName}」` : "고른";
      $("folderBody").replaceChildren(el("span", { class: folderState === "granted" ? "ok" : "err" },
        folderState === "granted" ? `${label} 폴더에도 저장하고 있습니다.`
          : folderState === "stuck" ? `${label} 폴더의 권한 확인이 끝나지 않아 지금은 폴더 없이 이 브라우저에만 저장합니다. 계속 이러면 「연결 끊기」를 누른 다음 폴더를 다시 고르세요.`
          : `${label} 폴더를 쓰려면 다시 허용해야 합니다(브라우저를 새로 열면 다시 묻습니다).`));
      if (folderState === "prompt") btns.push(folderAction("폴더 다시 허용", true, async () => { await folder(true); await syncFolder(); folderChanged(); render(); }));
      btns.push(folderAction("다른 폴더로 바꾸기", false, pickFolder));
      btns.push(el("button", { onclick: async () => { await delMeta("dir"); folderChanged(); render(); } }, "연결 끊기"));
    }
    $("folderBtns").replaceChildren(...btns);
  }
  // 작은 저장 창에서는 폴더 일을 새 탭으로 넘기는 링크, 일반 탭에서는 바로 하는 버튼
  function folderAction(label, primary, run) {
    if (!IN_POPUP) return el("button", { class: primary ? "primary" : "", onclick: run }, label);
    return el("a", { class: primary ? "btnlink primary" : "btnlink", href: "store.html?folder=1", target: "_blank", rel: "noopener",
      onclick: () => status("새 탭에서 폴더를 고르세요. 고르고 나면 이 창이 저절로 알아챕니다.") }, `${label} (새 탭에서)`);
  }
  function folderChanged() { try { bc?.postMessage({ type: "folder" }); } catch {} }
  function renderList(pages) {
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

  // 버튼을 누른 결과는 무엇이든 창 위쪽에 글로 남긴다(전에는 취소·실패가 조용히 지나가 눌러도 반응이 없는 것처럼 보였다)
  function status(text, err = false) { $("status").className = err ? "muted err" : "muted ok"; $("status").textContent = text; }
  async function pickFolder() {
    if (!canFolder) { status("이 브라우저는 폴더에 직접 쓰는 기능이 없습니다(크롬·엣지에서 됩니다).", true); return; }
    status("폴더 고르는 창을 여는 중… (안 보이면 다른 창 뒤에 열렸을 수 있습니다)");
    try {
      const dir = await window.showDirectoryPicker({ id: "notelayer", mode: "readwrite" });
      await putMeta("dir", dir);
      await folder(true);
      await syncFolder();
      status(folderState === "granted"
        ? `${dir.name ? `「${dir.name}」` : "고른"} 폴더를 연결했습니다. 이제 저장할 때마다 이 폴더에도 파일로 씁니다.${FOLDER_TAB ? " 이 탭은 닫아도 됩니다." : ""}`
        : `${dir.name ? `「${dir.name}」` : "고른"} 폴더에 쓰기 허락을 받지 못했습니다. 「폴더 다시 허용」을 눌러 주세요.`, folderState !== "granted");
      folderChanged();
    } catch (err) {
      status(err?.name === "AbortError"
        // 크롬은 바탕 화면·다운로드·사용자 폴더 자체·드라이브 맨 위처럼 시스템과 겹치는 폴더를 막고, 그런 폴더를 고르면 취소로 돌려준다
        ? "폴더 고르기가 취소됐습니다. 바탕 화면·다운로드처럼 크롬이 통째로 막는 폴더를 골랐다면, 그 안의 폴더(예: 문서\\notelayer)를 고르세요."
        : `폴더를 연결하지 못했습니다: ${err?.name || ""} ${err?.message || err}`, true);
    }
    render();
  }
  // 폴더를 처음 연결하거나 다시 허용하면, 이 브라우저에만 있던 기록을 폴더에도 써 둔다(PDF 노트의 원본도 함께)
  const syncFolder = () => S.syncFolder();

  $("importBtn").onclick = () => {
    // 다른 사이트가 띄운 작은 저장 창에서는 크롬이 파일 고르는 창도 열지 않고 바로 「취소」를 돌려준다(폴더 고르기와 같은 제약).
    // 새 탭에서 고르게 하고, 불러온 결과는 알림 통로로 받아 이 창과 연결된 페이지에 반영한다
    if (IN_POPUP) {
      const forPage = current ? `#for=${encodeURIComponent(JSON.stringify({ key: current.key, title: current.title }))}` : "";
      window.open(`store.html?import=1${forPage}`, "_blank", "noopener");
      status("새 탭에서 파일을 고르세요. 불러오면 이 창과 연결된 페이지에 바로 반영됩니다.");
      return;
    }
    status("파일 고르는 창을 여는 중… (안 보이면 다른 창 뒤에 열렸을 수 있습니다)");
    try { $("importFile").click(); } catch (err) { status(`파일 고르는 창을 열지 못했습니다: ${err?.message || err}`, true); }
  };
  $("importFile").oncancel = () => status("파일 고르기가 취소됐습니다.");
  // 불러오기를 시작한 페이지: 작은 저장 창이면 연결된 페이지, 새 탭이면 작은 창이 주소 #for= 로 넘긴 페이지
  const target = current || (() => {
    try { const j = JSON.parse(decodeURIComponent((/[#&]for=([^&]*)/.exec(location.hash) || [])[1] || "")); return httpUrl(j?.key) ? { key: j.key, title: String(j.title || "") } : null; } catch { return null; }
  })();
  // 다른 페이지의 기록: 「그 페이지 기록으로 저장」 또는 「이 페이지에 붙이기」 를 고르게 한다
  const pending = [];
  function renderChoices() {
    $("choices").hidden = !pending.length;
    $("choiceList").replaceChildren(...pending.map((rec) => el("div", { class: "choice" },
      el("div", {}, "이 파일은 ", el("b", {}, `「${rec.title || rec.key}」`), " 페이지의 기록입니다."),
      el("div", { class: "url" }, rec.url || rec.key),
      el("div", { class: "muted" }, `지금 페이지: 「${target.title || target.key}」`),
      el("div", { class: "row" },
        el("button", { onclick: () => resolve(rec, false) }, "그 페이지 기록으로 저장"),
        el("button", { class: "primary", title: "주소가 달라도 같은 글이면 이 페이지 기록으로 옮겨 바로 칠합니다. 표시 자리는 글자로 다시 찾습니다", onclick: () => resolve(rec, true) }, "이 페이지에 붙이기"),
        el("button", { onclick: () => { pending.splice(pending.indexOf(rec), 1); renderChoices(); status("불러오지 않았습니다."); } }, "취소")))));
  }
  async function resolve(rec, attach) {
    pending.splice(pending.indexOf(rec), 1);
    const out = attach ? { ...rec, key: target.key, url: httpUrl(target.key) || target.key, title: target.title || rec.title, savedAt: Date.now() } : rec;
    await putPage({ ...out, data: clean(out.data), savedAt: Number(out.savedAt) || Date.now() });
    announce([out.key]);
    status(attach ? "이 페이지 기록으로 붙였습니다. 열려 있는 페이지에 바로 칠합니다." : `「${rec.title || rec.key}」 페이지 기록으로 저장했습니다. 그 페이지를 열고 즐겨찾기를 누르면 칠해집니다.`);
    renderChoices(); render();
  }
  // 불러온 기록을 지금 페이지(작은 저장 창이면 그 페이지)와 다른 탭의 작은 저장 창들에 알린다
  function announce(keys) {
    if (current && keys.includes(current.key) && window.opener && !window.opener.closed) {
      try { window.opener.postMessage({ nl: "store", type: "updated", id: 0 }, current.origin); } catch {}
    }
    try { bc?.postMessage({ type: "imported", keys }); } catch {}
  }

  $("importFile").onchange = async (e) => {
    let n = 0, here = false, other = 0;
    const keys = [];
    for (const f of e.target.files) {
      try {
        const rec = JSON.parse(await f.text());
        if (typeof rec?.key !== "string" || !httpUrl(rec.key) || typeof rec.data !== "object") continue;
        // 불러오기를 시작한 페이지가 있고 그 페이지 기록이 아니면 바로 넣지 않고 고르게 한다
        if (target && rec.key !== target.key) { pending.push(rec); other++; continue; }
        const old = await getPage(rec.key);
        if (!old || (old.savedAt || 0) <= (rec.savedAt || 0)) {
          await putPage({ ...rec, data: clean(rec.data), savedAt: Number(rec.savedAt) || Date.now() });
          n++; keys.push(rec.key);
          if (target && rec.key === target.key) here = true;
        }
      } catch {}
    }
    const total = e.target.files.length;
    e.target.value = "";
    // 지금 연결된 페이지의 기록을 불러왔으면 그 페이지에 알려 바로 다시 칠하게 한다.
    // 페이지는 처음 연결될 때 한 번만 저장본을 꺼내므로, 알리지 않으면 저장 창에는 「저장됨」인데 페이지에는 아무것도 안 보였다
    const live = here && window.opener && !window.opener.closed;
    if (keys.length) announce(keys);
    renderChoices();
    if (other && !n) status(`고른 파일은 지금 페이지가 아닌 다른 페이지의 기록입니다. 아래에서 어떻게 할지 골라 주세요.`);
    else status(`파일 ${total}개 중 ${n}개 페이지의 표시를 불러왔습니다${n + other < total ? "(notelayer 저장 파일이 아니거나 더 새 기록이 이미 있는 것은 건너뛰었습니다)" : ""}.`
      + (live ? " 지금 연결된 페이지에 바로 칠했습니다." : IMPORT_TAB && here ? " 열려 있는 페이지에 바로 칠했습니다. 이 탭은 닫아도 됩니다." : n ? " 그 페이지를 열고 「notelayer 켜기」를 누르면 칠해집니다." : "")
      + (other ? ` 다른 페이지의 기록 ${other}개는 아래에서 골라 주세요.` : ""), n === 0 && !other);
    render();
  };

  // 원래 페이지가 닫혔는지 가끔 확인한다
  // 다른 탭에서 폴더를 고르거나 끊으면 다시 그린다(알림 통로가 없는 브라우저는 창으로 돌아올 때)
  const refreshFolder = async () => { drawn.folder = null; await syncFolder().catch(() => {}); render(); };
  bc?.addEventListener("message", (e) => {
    if (e.data?.type === "folder") refreshFolder();
    // 다른 탭에서 파일을 불러왔다: 지금 연결된 페이지의 기록이 들어 있으면 그 페이지에 다시 칠하라고 알린다
    if (e.data?.type === "imported" && Array.isArray(e.data.keys)) {
      drawn.list = null; drawn.cur = null; render();
      if (current && e.data.keys.includes(current.key) && window.opener && !window.opener.closed) {
        try { window.opener.postMessage({ nl: "store", type: "updated", id: 0 }, current.origin); } catch {}
        status("새 탭에서 불러온 기록을 연결된 페이지에 칠했습니다.");
      }
    }
  });
  window.addEventListener("focus", () => { drawn.folder = null; render(); });
  if (IMPORT_TAB) status("이 탭에서 「파일 불러오기」를 눌러 저장 파일(.notelayer.json)을 고르세요.");
  else if (FOLDER_TAB) status("이 탭에서 폴더를 고르세요. 문서 안의 notelayer 폴더처럼 직접 만든 폴더를 고르면 됩니다.");

  let closedShown = false;
  setInterval(() => { if (current && !closedShown && window.opener?.closed) { closedShown = true; render(); } }, 3000);
  render();
})();
