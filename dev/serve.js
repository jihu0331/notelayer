// notelayer 로컬 시험 서버 — 고친 파일을 공개 데모에 올리지 않고 바로 시험한다.
//   node dev/serve.js            (기본 포트 5199)
//   node dev/serve.js 5300       (포트 바꾸기)
// 브라우저로 http://localhost:5199 를 열고 「+ 새 문서 → 웹페이지」의 「이 페이지 위에 표시하기 (시험용)」을
// 즐겨찾기 막대로 한 번 끌어다 두면, 그다음부터는 파일을 고치고 블로그에서 그 즐겨찾기를 다시 누르기만 하면 된다.
//
// - 이 PC 안(127.0.0.1)에서만 접속된다
// - notelayer 화면과 즐겨찾기에 필요한 파일(아래 SERVE 목록)만 내준다. 이 파일들은 GitHub 에 공개된 코드와 같은 것이다.
//   .git 폴더·백업 파일·그 밖의 파일은 없는 것으로 답한다
// - 다른 사이트가 가져갈 수 있게 하는 허용 표시(CORS)는 붙이지 않는다. 시험용 즐겨찾기는 블로그 페이지가 이 서버에 직접 요청하지 않고,
//   시험용 저장 창(이 서버의 store.html)을 열어 그 창이 같은 서버에서 읽은 코드를 넘겨받는다.
//   그래서 크롬의 「로컬 네트워크 액세스」 허락도 필요 없다
// - 시험용 저장 창은 localhost 주소라 공개 데모의 저장 내용과 섞이지 않는다
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.argv[2]) || 5199;
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".png": "image/png",
};
const NO_CACHE = { "cache-control": "no-store" }; // 고친 파일이 바로 보이게

// 내줄 파일 목록(이름에 점으로 시작하는 조각·상위 폴더 이동이 들어갈 수 없는 모양만)
const SERVE = /^\/(?:index\.html|app\.js|app\.css|import\.js|prompt\.js|templates\.js|overlay\.js|store\.html|store\.js|storage\.js|pdf\.html|pdfnote\.js|documents\/[A-Za-z0-9_-]+\.js|docs\/[A-Za-z0-9_-]+\.png)$/;

http.createServer((req, res) => {
  let rel;
  try { rel = decodeURIComponent(new URL(req.url, "http://localhost").pathname); } catch { res.writeHead(400); res.end(); return; }
  if (rel === "/") rel = "/index.html";
  if (rel === "/favicon.ico") { res.writeHead(204, NO_CACHE); res.end(); return; } // 브라우저가 알아서 찾는 아이콘 — 없다고 오류를 남기지 않게
  const file = path.resolve(ROOT, `.${rel}`);
  const ok = SERVE.test(rel) && file.startsWith(ROOT + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile();
  if (!ok) { res.writeHead(404, NO_CACHE); res.end("not found"); return; }
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); res.end(); return; }
  res.writeHead(200, { ...NO_CACHE, "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
  if (req.method === "HEAD") { res.end(); return; }
  fs.createReadStream(file).pipe(res);
}).listen(PORT, "127.0.0.1", () => {
  console.log(`notelayer 시험 서버: http://localhost:${PORT}  (끄려면 Ctrl+C)`);
});
