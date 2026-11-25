// notelayer 첫 화면 — 「notelayer 켜기」 즐겨찾기 버튼을 만들고, 사용법 접기와 예시 탭을 다룬다.
// 첫 화면에는 문서 보기가 없다. 읽던 웹페이지 위에 바로 얹는 표시 층(overlay.js)과 PDF 노트(pdf.html)가 본체다
(() => {
  const $ = (id) => document.getElementById(id);

  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove("show"), 3500);
  }

  // ── 웹페이지 위 표시 층: 읽던 페이지에 templates.js·prompt.js·overlay.js 를 얹는다 ──
  // 이미 떠 있으면 다시 얹지 않고 패널만 접고 편다.
  // 저장 창(store.html)은 누르는 순간 먼저 연다. 파일을 다 받은 다음에 열면 팝업 차단에 걸린다. 열려 있어야 이 페이지에 저장해 둔 표시를 불러온다
  // 코드를 받는 길은 둘이다.
  //   (가) 페이지에 <script src> 로 직접 불러온다.
  //   (나) 저장 창이 자기 주소에서 읽어 넘겨준 코드를 실행한다.
  // 사이트 보안 설정(CSP)이 다른 주소의 스크립트 파일을 막으면 (가)가 실패한다(예: Microsoft Learn·위키백과). 공개용은 그때 (나)로 되살린다.
  // 시험용은 처음부터 (나)만 쓴다: 페이지가 localhost 에서 직접 받으면 크롬이 「로컬 네트워크 액세스」 허락을 요구한다(창끼리 주고받기는 허락이 필요 없다)
  // 로컬 시험 서버(dev/serve.js)로 연 화면이면 시험용 버튼이 된다. 저장 창 이름도 따로 써서 공개용 저장 창을 덮지 않는다
  const base = location.origin + location.pathname.replace(/[^/]*$/, "");
  const isLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const storeName = isLocal ? "notelayer-store-dev" : "notelayer-store";
  const bm = $("overlayBookmarklet");
  if (isLocal) bm.textContent = "notelayer 켜기 (시험용)";
  const openStore = `window.open(B+'store.html','${storeName}','popup=yes,width=380,height=560,left='+Math.max(0,screen.availWidth-400)+',top=60')`;
  const noCode = isLocal ? "notelayer 시험 서버에서 코드를 받지 못했습니다. 시험 서버(node dev/serve.js)가 켜져 있는지 확인해 주세요."
    : "notelayer 저장 창에서 코드를 받지 못했습니다. 저장 창이 열려 있는지 확인한 다음 다시 눌러 주세요.";
  // (나): 저장 창 W 에 코드를 달라고 묻고, 받은 코드를 실행한다. 실행까지 막는 사이트면 알린다
  const viaStore = "const S=()=>{window.NL_BASE=B+'overlay.js';"
    + `let n=0;const T=setInterval(()=>{if(++n>50){clearInterval(T);removeEventListener('message',H);alert(${JSON.stringify(noCode)});return}try{W.postMessage({nl:'dev-code-req'},O)}catch(e){}},300);`
    + "function H(e){if(e.origin!==O||e.source!==W||!e.data||e.data.nl!=='dev-code'||typeof e.data.code!=='string')return;clearInterval(T);removeEventListener('message',H);"
    + "try{(0,eval)(e.data.code)}catch(x){const s=document.createElement('script');s.textContent=e.data.code;document.head.appendChild(s)}"
    + "setTimeout(()=>{if(!window.NL_OVERLAY)alert('이 사이트의 보안 설정이 notelayer 를 막았습니다. 이 사이트에서는 쓸 수 없습니다.')},1000)}"
    + "addEventListener('message',H)};";
  const head = `(()=>{if(window.NL_OVERLAY){window.NL_OVERLAY.toggle();return}const B=${JSON.stringify(base)},O=${JSON.stringify(location.origin)};`;
  const overlayCode = isLocal
    ? head + viaStore + `const W=${openStore};`
      + "if(!W){alert('팝업이 막혀 시험용 저장 창을 열지 못했습니다. 주소창 오른쪽에서 이 사이트의 팝업을 허용해 주세요.');return}"
      + "window.__NL_STORE_WIN=W;S()})()"
    : head + viaStore + `let W=null;try{W=window.__NL_STORE_WIN=${openStore}}catch(e){}`
      + "const L=f=>new Promise((ok,no)=>{const s=document.createElement('script');s.src=B+f+'?v='+Date.now();s.onload=ok;s.onerror=()=>no(f);document.head.appendChild(s)});"
      + "L('templates.js').then(()=>L('prompt.js')).then(()=>L('overlay.js'))"
      + ".catch(()=>{if(!W){alert('이 사이트는 다른 주소의 스크립트를 막아서 저장 창을 거쳐 켜야 합니다. 주소창 오른쪽에서 이 사이트의 팝업을 허용한 다음 다시 눌러 주세요.');return}S()})})()";
  bm.href = `javascript:${encodeURIComponent(overlayCode)}`;
  bm.onclick = (e) => { e.preventDefault(); toast("누르지 말고 즐겨찾기 막대로 끌어다 놓으세요."); };

  // ── 사용법: 접으면 버튼만 남기고, 접은 상태를 기억한다 ──
  const hero = $("hero"), heroFold = $("heroFold");
  const setHeroFolded = (folded) => {
    hero.classList.toggle("folded", folded);
    heroFold.textContent = folded ? "사용법 보기" : "사용법 접기";
    heroFold.setAttribute("aria-expanded", String(!folded));
  };
  try { setHeroFolded(localStorage.getItem("notelayer:heroFolded") === "1"); } catch { setHeroFolded(false); }
  heroFold.onclick = () => {
    const folded = !hero.classList.contains("folded");
    setHeroFolded(folded);
    try { localStorage.setItem("notelayer:heroFolded", folded ? "1" : "0"); } catch {}
  };

  // ── 예시 탭: 끼운 예시 화면을 바꾼다. 「새 탭에서 크게」 주소도 같이 바꾼다 ──
  for (const tab of document.querySelectorAll(".ex-tab[data-t]")) {
    tab.onclick = () => {
      for (const t of document.querySelectorAll(".ex-tab[data-t]")) t.setAttribute("aria-selected", String(t === tab));
      $("exFrame").src = `example.html?t=${tab.dataset.t}&embed=1`;
      $("exOpen").href = `example.html?t=${tab.dataset.t}`;
    };
  }
})();
