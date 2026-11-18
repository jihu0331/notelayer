// notelayer — LLM 요청문 만들기와 답 읽기. notelayer 화면(import.js)과 웹페이지 위 표시 층(overlay.js)이 함께 쓴다.
// 화면 상태에 기대지 않는 순수 함수만 둔다.
(() => {
  const EXTRA = {
    exam: "직접 풀어 보기는 text 에 질문, answer 에 답을 쓴다.",
    tech: "핵심 용어와 개념마다 '예시' 상자를 단다(실제 값·요청 이름·단계별 글자 그림을 pre 에). 흐름은 단계 순서대로 보인다.",
    contract: "법률 판단을 하지 않는다. 불리할 수 있는 조항은 '확인 필요' 까지만 쓰고, 확실한 근거 조문이 있을 때만 단다.",
    onboarding: "담당자 메모는 사람이 쓰는 칸이니 만들지 않는다.",
    review: "고친 예시(제안)는 pre 에 '고치기 전: … / 고친 예시: …' 로 쓴다.",
  };

  // title: 문서 제목, paragraphs: [{p, text}], needTr: 번역도 요청할지
  function build({ title, paragraphs, templateId, template: t, needTr = false }) {
    const labels = Object.keys(t.boxes);
    const shape = `{"marks":[{"p":1,"kind":"circle","quote":"원문 그대로"}],"boxes":[{"p":1,"label":"${labels[0]}","text":"설명","pre":"(선택) 글자 그림","answer":"(선택) 답"}],"concepts":{"topic":"문서 주제","nodes":[{"id":"a","term":"개념 이름","role":"문제/해결책/구성 요소 등","parent":null,"def":{"p":1,"quote":"정의 문장 안의 원문 글자 그대로 일부"},"match":["본문에 나오는 낱말 그대로"],"gloss":"쉬운 말로 쓴 한 줄 풀이","points":["이 개념의 핵심 1","핵심 2 (예시 포함)"]},{"id":"b","term":"하위 개념","role":"구성 요소","parent":"a","rel":"종류","def":{"p":2,"quote":"…"},"match":["…"],"gloss":"…"}],"links":[{"from":"b","to":"a","label":"해결"}]}${needTr ? ',"translations":[{"p":1,"text":"한국어 번역"}]' : ""}}`;
    return [
      "너는 notelayer 의 표시와 설명을 만든다. notelayer 는 원문을 고치지 않고 그 위에 표시·설명 층을 얹어 보여 준다.",
      `아래 문서에 「${t.name}」 템플릿을 적용해서, 다른 말 없이 JSON 하나만 돌려줘.`,
      "",
      `템플릿: ${t.name} (읽는 사람: ${t.reader})`,
      `- circle(동그라미): ${t.marks.circle}`,
      `- highlight(형광펜): ${t.marks.highlight}`,
      `- wave(물결 밑줄): ${t.marks.wave}`,
      `- 설명 종류(label, 이 중에서만): ${labels.join(", ")}`,
      `- 템플릿 규칙: ${[...t.rules, EXTRA[templateId]].filter(Boolean).join(" / ")}`,
      "",
      "지킬 것",
      "1. quote 는 그 문단 text 안에 글자 그대로 있는 부분이어야 한다(띄어쓰기·문장부호까지 같게). 뜻이 서는 단위로 고르고 한두 글자짜리는 피한다.",
      "2. 문단당 표시 1-2개, 전체 표시는 문단 수의 1.5배 이하. 앞쪽에 몰리지 않게 끝까지 고르게. 목차·주소만 있는 줄·메뉴·댓글·저작권 표시처럼 본문이 아닌 문단에는 표시하지 않는다.",
      "3. 설명(boxes)은 쉬운 문단이면 한두 문장으로 짧게 쓴다. 어려운 문단(수식·정의·정리·증명·알고리즘 단계·기호가 많은 줄)에는 설명을 2-3개까지 단다: 그 문단이 무엇을 말하는지 쉬운 말 풀이 하나, 그리고 작은 수로 직접 해 본 예시 하나(pre 에 단계마다 실제 값을 적는다. 계산은 검산해서 맞는 것만 쓴다). 기호는 처음 나올 때 무엇을 뜻하는지 풀어 준다. 더 필요하면 pre 에 글자 그림이나 비교를 넣는다. 선·화살표로 그리는 글자 그림은 영문·숫자·기호로만 그린다(한글은 고정폭 글꼴에서 폭이 맞지 않아 그림이 어긋난다). 한글 풀이는 그림 아래 줄에 따로 쓴다. 설명은 그 문단 바로 아래에 붙어 보이므로 문단 내용을 되풀이하지 말고 덧붙이는 내용만 쓴다. 물결(wave)을 친 곳에는 왜 쳤는지 알 수 있게 설명을 하나 붙인다(예: 풀이 없이 넘어간 용어면 그 용어 풀이).",
      "4. 확실하지 않은 사실·숫자·조문·명령어는 쓰지 않는다. HTML 은 쓰지 않는다. 설명은 한국어로 쓴다. 설명 글과 pre 안에서 따옴표가 필요하면 큰따옴표 대신 「」를 쓰고, pre 의 JSON 예시는 따옴표를 빼고 {name: hak} 처럼 쓴다(답을 복사할 때 역슬래시가 빠져 JSON 이 깨지는 것을 막는다). 원문에 틀렸거나 앞뒤가 맞지 않는 주장이 있으면, 네가 확실히 알 때만 알맞은 설명 종류로 짚는다(무엇이 다른지와 근거를 함께).",
      "5. concepts 는 개념 구조도다. 문서의 주요 개념을 5-14개 고르고, 어떤 개념의 하위 개념·구성 요소면 parent 에 그 개념의 id 를, 같은 높이(동등)면 같은 parent 를 준다. 맨 위 개념은 parent 를 null 로 둔다. parent 가 있는 개념은 rel 에 상위 개념과의 관계를 2-6자로 쓴다(종류·구성 요소·예·단계·원인·결과 등, 구조도의 갈라지는 선에 붙는다). 여러 개념을 묶는 분류 개념(def 없음)을 만들어도 된다. 위아래가 아닌 관계(해결, 원인, 대비, 전제 등)는 links 에 짧은 label 로 쓴다. def.quote 는 그 개념을 설명하는 문장 안의 원문 글자 그대로 일부, match 는 본문에서 그 개념을 가리키는 낱말을 원문 표기 그대로 적는다. gloss 는 그 개념을 처음 보는 사람을 위한 한 줄 풀이로, 원문을 옮기지 말고 쉬운 한국어로 40자 안팎에 쓴다(요약의 본문이 된다). points 는 그 개념을 누르면 펼쳐지는 핵심 내용 2-4줄로, 개념마다 서로 다른 내용(정의·이유·숫자·예시)을 쓰고 원문 문장을 그대로 옮기지 않는다.",
      ...(needTr ? ["6. 원문이 한국어가 아니므로 translations 에 문단마다 자연스러운 한국어 번역을 넣는다."] : []),
      "",
      `돌려줄 모양: ${shape}`,
      "",
      `문서 「${title}」 (p 는 문단 번호):`,
      JSON.stringify(paragraphs.map((b) => ({ p: b.p, text: b.text }))),
    ].join("\n");
  }

  // 고른 문단만 더 자세히 설명해 달라는 짧은 요청문. 문서 전체 요청은 답 길이 한계 때문에 어려운 문단마다 예시를 넉넉히 달기 어렵다.
  // targets: 설명할 문단 [{p, text}], context: 앞뒤 문맥 문단 [{p, text}], existing: 그 문단에 이미 단 설명 글
  function buildFocus({ title, targets, context = [], existing = [], template: t }) {
    const labels = Object.keys(t.boxes);
    const ps = targets.map((x) => x.p);
    return [
      "너는 notelayer 의 설명을 만든다. notelayer 는 원문을 고치지 않고 그 위에 설명을 얹어 보여 준다.",
      `아래 문서에서 읽는 사람이 어려워한 문단(p ${ps.join(", ")})을 더 자세히 설명해서, 다른 말 없이 JSON 하나만 돌려줘.`,
      "",
      `읽는 사람: ${t.reader}`,
      `설명 종류(label, 이 중에서만): ${labels.join(", ")}`,
      "",
      "지킬 것",
      "1. 문단마다 설명 2-4개: 그 문단이 무엇을 말하는지 쉬운 말 풀이, 작은 수로 직접 해 본 예시(pre 에 단계마다 실제 값을 적는다. 계산은 검산해서 맞는 것만), 필요하면 먼저 알아야 할 것.",
      "2. 기호는 처음 나올 때 무엇을 뜻하는지 풀어 준다. 왜 그렇게 되는지(직관)를 한 문장 넣는다.",
      "3. 이미 단 설명과 겹치지 않게, 덧붙이는 내용만 쓴다.",
      "4. 확실하지 않은 사실·숫자는 쓰지 않는다. HTML 은 쓰지 않는다. 설명은 한국어로 쓴다. 따옴표가 필요하면 큰따옴표 대신 「」를 쓴다. 선·화살표 그림은 영문·숫자·기호로만 그린다.",
      "",
      `돌려줄 모양: {"add":true,"boxes":[{"p":${ps[0]},"label":"${labels[0]}","text":"설명","pre":"(선택) 단계별 예시"}]}`,
      "",
      ...(existing.length ? ["이미 단 설명:", ...existing.map((e) => `- (p ${e.p}) ${e.text}`), ""] : []),
      `문서 「${title}」 의 해당 부분 (p 는 문단 번호, 설명할 문단 앞뒤는 문맥으로만 본다):`,
      JSON.stringify([...context, ...targets].sort((a, b) => a.p - b.p).map((b) => ({ p: b.p, text: b.text, ...(ps.includes(b.p) ? { explain: true } : {}) }))),
    ].join("\n");
  }

  // LLM 답에서 JSON 을 꺼낸다. 코드 블록·앞뒤 말·문서 파일 모양(window.NL_DOCS.push)도 받아 준다
  function parseAnswer(text, templateId) {
    const s = String(text).replace(/```(?:json|js|javascript)?/gi, "");
    const a = s.indexOf("{"), z = s.lastIndexOf("}");
    if (a < 0 || z <= a) throw new Error("답에서 JSON 을 찾지 못했습니다");
    const body = s.slice(a, z + 1);
    let obj;
    try { obj = JSON.parse(body); }
    catch (err) {
      // 깨진 자리 앞뒤 글자를 보여 줘야 사람이 어디를 고칠지 안다
      const at = Number(/position (\d+)/.exec(err.message)?.[1]);
      const near = Number.isFinite(at) ? ` — 깨진 자리 근처: …${body.slice(Math.max(0, at - 30), at)}⟦여기⟧${body.slice(at, at + 15)}…` : "";
      throw new Error(`JSON 모양이 깨졌습니다${near}`);
    }
    if (obj.annotations) {
      const ann = obj.annotations[templateId] ?? Object.values(obj.annotations)[0] ?? {};
      const translations = (obj.blocks ?? []).filter((b) => b.tr).map((b) => ({ p: b.p, text: b.tr }));
      return { ...ann, translations };
    }
    return obj;
  }

  window.NL_PROMPT = { build, buildFocus, parseAnswer };
})();
