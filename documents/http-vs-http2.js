// HTTP/1.1과 HTTP/2, 무엇이 달라졌나
// 출처: 이 시연을 위해 새로 쓴 예시 글
window.NL_DOCS = window.NL_DOCS || [];
window.NL_DOCS.push({
  "id": "http",
  "title": "HTTP/1.1과 HTTP/2, 무엇이 달라졌나",
  "lang": "ko",
  "source": "이 시연을 위해 새로 쓴 예시 글",
  "templates": [
    "exam",
    "tech"
  ],
  "blocks": [
    {
      "p": 1,
      "text": "웹 브라우저는 페이지 하나를 그리기 위해 HTML, 스타일시트, 스크립트, 이미지 같은 파일을 수십 개씩 받아 온다. HTTP/1.1에서는 하나의 연결에서 요청을 보내면 그 응답이 끝나야 다음 응답을 받을 수 있었다. 앞의 응답이 늦어지면 뒤의 요청이 모두 기다리는 이 현상을 HOL 블로킹(Head-of-Line Blocking)이라고 부른다."
    },
    {
      "p": 2,
      "text": "브라우저는 이 문제를 줄이려고 도메인 하나에 연결을 여러 개 열었다. 크롬은 보통 6개까지 연다. 하지만 연결마다 TCP 핸드셰이크와 TLS 협상을 따로 해야 하므로 비용이 늘어난다. 파이프라이닝이라는 방식도 표준에 있었지만, 응답을 요청한 순서대로 돌려줘야 하는 제약 때문에 널리 쓰이지 못했다."
    },
    {
      "p": 3,
      "text": "HTTP/2는 하나의 TCP 연결 위에서 여러 요청과 응답을 동시에 주고받는다. 메시지를 프레임이라는 작은 조각으로 나누고, 각 프레임에 스트림 번호를 붙여 보낸다. 받는 쪽은 스트림 번호를 보고 조각을 다시 맞춘다. 이것을 멀티플렉싱이라고 한다."
    },
    {
      "p": 4,
      "text": "헤더도 압축한다. HTTP/2는 HPACK이라는 방식으로, 자주 쓰는 헤더는 미리 정한 표의 번호로 보내고, 한 번 보낸 헤더는 양쪽이 기억해 두었다가 다음에는 번호만 보낸다. 쿠키처럼 긴 헤더가 요청마다 반복될 때 효과가 크다."
    },
    {
      "p": 5,
      "text": "다만 HTTP/2도 TCP 위에서 돌기 때문에, 패킷 하나가 사라지면 그 뒤에 도착한 데이터도 재전송이 끝날 때까지 기다린다. HTTP 층의 HOL 블로킹은 사라졌지만 TCP 층의 HOL 블로킹은 남은 것이다. HTTP/3는 UDP 위의 QUIC을 써서 이 문제를 줄였다."
    },
    {
      "p": 6,
      "text": "브라우저에서는 보안 연결(HTTPS) 위의 HTTP/2만 쓸 수 있다. 브라우저와 서버는 TLS 핸드셰이크 중에 ALPN이라는 확장으로 h2를 쓸지 미리 정한다. 개발자 도구 Network 탭의 Protocol 열에서 h2가 보이면 HTTP/2로 받은 것이다."
    }
  ],
  "memos": [
    {
      "p": 3,
      "quote": "멀티플렉싱",
      "text": "한 연결, 여러 스트림. 지난 시험에 그림 그리기로 나왔음"
    },
    {
      "p": 5,
      "quote": "QUIC",
      "text": "QUIC 은 다음 주 범위"
    }
  ],
  "annotations": {
    "exam": {
      "marks": [
        {
          "p": 1,
          "kind": "circle",
          "quote": "HOL 블로킹"
        },
        {
          "p": 3,
          "kind": "circle",
          "quote": "멀티플렉싱"
        },
        {
          "p": 4,
          "kind": "circle",
          "quote": "HPACK"
        },
        {
          "p": 6,
          "kind": "circle",
          "quote": "ALPN"
        },
        {
          "p": 1,
          "kind": "highlight",
          "quote": "앞의 응답이 늦어지면 뒤의 요청이 모두 기다리는"
        },
        {
          "p": 3,
          "kind": "highlight",
          "quote": "하나의 TCP 연결 위에서 여러 요청과 응답을 동시에 주고받는다"
        },
        {
          "p": 5,
          "kind": "highlight",
          "quote": "TCP 층의 HOL 블로킹은 남은 것이다"
        },
        {
          "p": 2,
          "kind": "wave",
          "quote": "파이프라이닝이라는 방식도 표준에 있었지만"
        },
        {
          "p": 6,
          "kind": "wave",
          "quote": "보안 연결(HTTPS) 위의 HTTP/2만"
        }
      ],
      "boxes": [
        {
          "p": 1,
          "label": "핵심",
          "text": "HOL 블로킹은 두 층에서 따로 생긴다. 이 글 끝까지 이어지는 포인트다.",
          "pre": "HTTP 층: 앞 응답이 끝나야 다음 응답  → HTTP/2 가 해결\nTCP 층 : 잃은 패킷을 다시 받을 때까지 대기 → HTTP/2 로는 해결 안 됨"
        },
        {
          "p": 2,
          "label": "헷갈림 주의",
          "text": "파이프라이닝은 요청을 연달아 보내도 응답은 보낸 순서대로 받아야 한다. 그래서 HOL 블로킹을 없애지 못했다. 멀티플렉싱과 헷갈리지 말 것."
        },
        {
          "p": 3,
          "label": "그림으로",
          "text": "연결 하나에 여러 스트림의 프레임이 섞여 흐른다.",
          "pre": "HTTP/1.1  연결①: [요청A──응답A] [요청B──응답B]\n          연결②: [요청C──응답C]\nHTTP/2    연결 1개: [A1][C1][B1][A2][C2][B2] …\n                    스트림 번호로 A·B·C 를 다시 맞춤"
        },
        {
          "p": 5,
          "label": "직접 풀어 보기",
          "text": "HTTP/2 에서 패킷 하나가 사라지면, 같은 연결의 다른 스트림은 어떻게 될까?",
          "answer": "모두 기다린다. 스트림은 HTTP 층의 구분일 뿐이고, TCP 는 하나의 바이트 흐름으로 순서를 지키기 때문이다. HTTP/3 는 QUIC 으로 스트림마다 따로 순서를 지키게 했다."
        },
        {
          "p": 6,
          "label": "직접 풀어 보기",
          "text": "브라우저가 h2 를 쓸지 정하는 시점은 언제일까?",
          "answer": "TLS 핸드셰이크의 첫 메시지(ClientHello)에 실린 ALPN 확장으로 서버와 협상한다."
        }
      ],
      "concepts": {
        "topic": "HTTP/1.1 → HTTP/2",
        "nodes": [
          {
            "id": "hol",
            "term": "HOL 블로킹",
            "role": "문제",
            "parent": null,
            "def": {
              "p": 1,
              "quote": "앞의 응답이 늦어지면"
            },
            "match": [
              "HOL 블로킹",
              "Head-of-Line Blocking"
            ],
            "gloss": "앞 요청이 막히면 뒤 요청까지 줄줄이 기다리는 현상",
            "points": [
              "HTTP 층: 앞 응답이 끝나야 다음 응답을 받음",
              "TCP 층: 잃은 패킷을 다시 받을 때까지 뒤가 멈춤",
              "HTTP/2 는 HTTP 층만 해결 — 둘을 구분하는 문제가 잘 나옴"
            ]
          },
          {
            "id": "hol-http",
            "term": "HTTP 층 HOL 블로킹",
            "role": "종류",
            "parent": "hol",
            "def": {
              "p": 5,
              "quote": "HTTP 층의 HOL 블로킹은"
            },
            "match": [
              "HTTP 층의 HOL 블로킹"
            ],
            "gloss": "응답을 순서대로 받아야 해서 생기는 대기. HTTP/2 가 없앰",
            "points": [
              "원인: 한 연결에서 응답을 요청 순서대로만 받음",
              "HTTP/2 멀티플렉싱이 없앰"
            ]
          },
          {
            "id": "hol-tcp",
            "term": "TCP 층 HOL 블로킹",
            "role": "종류",
            "parent": "hol",
            "def": {
              "p": 5,
              "quote": "패킷 하나가 사라지면"
            },
            "match": [
              "TCP 층의 HOL 블로킹",
              "패킷 하나가 사라지면"
            ],
            "gloss": "잃은 패킷을 다시 받을 때까지 그 뒤 데이터가 멈추는 대기",
            "points": [
              "원인: TCP 는 바이트 순서를 맞춰야 앱에 넘김",
              "HTTP/2 로는 남음 → HTTP/3(QUIC)가 줄임"
            ]
          },
          {
            "id": "h1fix",
            "term": "HTTP/1.1 의 대응",
            "role": "임시 방편",
            "parent": null,
            "def": null,
            "match": [],
            "gloss": "HTTP/1.1 시절 HOL 블로킹을 피하려던 방법들",
            "points": [
              "연결 여러 개 열기 — 실제로 널리 쓰임",
              "파이프라이닝 — 표준엔 있었지만 거의 안 쓰임"
            ]
          },
          {
            "id": "multi",
            "term": "연결 여러 개",
            "role": "대응",
            "parent": "h1fix",
            "def": {
              "p": 2,
              "quote": "도메인 하나에 연결을 여러 개 열었다"
            },
            "match": [
              "연결을 여러 개"
            ],
            "gloss": "도메인마다 연결을 여럿(크롬은 6개) 열어 병렬로 받음. 연결 비용이 큼",
            "points": [
              "크롬은 도메인 하나에 연결을 6개까지",
              "연결마다 TCP·TLS 준비를 따로 해 비용이 큼"
            ]
          },
          {
            "id": "pipe",
            "term": "파이프라이닝",
            "role": "대응",
            "parent": "h1fix",
            "def": {
              "p": 2,
              "quote": "파이프라이닝이라는 방식도"
            },
            "match": [
              "파이프라이닝"
            ],
            "gloss": "응답을 기다리지 않고 요청을 연달아 보냄. 응답 순서 제약 때문에 안 쓰임",
            "points": [
              "요청은 연달아 보내도 응답은 보낸 순서대로",
              "그래서 HOL 블로킹이 그대로 — 멀티플렉싱과 헷갈리지 말 것"
            ]
          },
          {
            "id": "mux",
            "term": "멀티플렉싱",
            "role": "해결책",
            "parent": null,
            "def": {
              "p": 3,
              "quote": "하나의 TCP 연결 위에서"
            },
            "match": [
              "멀티플렉싱"
            ],
            "gloss": "연결 하나에 여러 요청·응답을 섞어 동시에 주고받는 방식",
            "points": [
              "연결 하나에서 여러 요청·응답을 동시에",
              "메시지를 프레임으로 쪼개고 스트림 번호로 구분",
              "HTTP 층 HOL 블로킹을 해결"
            ]
          },
          {
            "id": "frame",
            "term": "프레임",
            "role": "구성 요소",
            "parent": "mux",
            "def": {
              "p": 3,
              "quote": "메시지를 프레임이라는"
            },
            "match": [
              "프레임"
            ],
            "gloss": "메시지를 잘게 나눈 조각. HTTP/2 전송의 최소 단위",
            "points": [
              "HTTP/2 가 보내는 가장 작은 단위",
              "예: 헤더를 담은 HEADERS 프레임, 본문을 담은 DATA 프레임"
            ]
          },
          {
            "id": "stream",
            "term": "스트림",
            "role": "구성 요소",
            "parent": "mux",
            "def": {
              "p": 3,
              "quote": "받는 쪽은 스트림 번호를"
            },
            "match": [
              "스트림"
            ],
            "gloss": "요청 하나와 그 응답이 오가는 통로. 번호로 조각을 다시 맞춤",
            "points": [
              "요청 하나와 그 응답이 오가는 통로",
              "클라이언트가 여는 스트림은 홀수 번호(1, 3, 5 …)"
            ]
          },
          {
            "id": "hpack",
            "term": "HPACK",
            "role": "헤더 압축",
            "parent": null,
            "def": {
              "p": 4,
              "quote": "HPACK이라는 방식으로"
            },
            "match": [
              "HPACK"
            ],
            "gloss": "자주 쓰는 헤더는 표 번호로, 한 번 보낸 헤더는 번호만 보내는 압축",
            "points": [
              "자주 쓰는 헤더는 정적 표의 번호로 (예: :method GET = 2번)",
              "한 번 보낸 헤더는 동적 표에 저장해 다음엔 번호만",
              "긴 쿠키가 요청마다 반복될 때 효과가 큼"
            ]
          },
          {
            "id": "quic",
            "term": "QUIC (HTTP/3)",
            "role": "다음 해결책",
            "parent": null,
            "def": {
              "p": 5,
              "quote": "HTTP/3는 UDP 위의 QUIC"
            },
            "match": [
              "QUIC",
              "HTTP/3"
            ],
            "gloss": "UDP 위에서 스트림마다 따로 순서를 지켜 TCP 층 대기를 줄임",
            "points": [
              "HTTP/3 가 쓰는 전송 방식, UDP 위에서 동작",
              "스트림마다 순서를 따로 지켜 TCP 층 HOL 블로킹을 줄임"
            ]
          },
          {
            "id": "alpn",
            "term": "ALPN",
            "role": "사용 조건",
            "parent": null,
            "def": {
              "p": 6,
              "quote": "ALPN이라는 확장으로"
            },
            "match": [
              "ALPN"
            ],
            "gloss": "TLS 핸드셰이크 중에 h2 를 쓸지 미리 정하는 확장",
            "points": [
              "TLS 핸드셰이크의 첫 메시지(ClientHello)에 실림",
              "여기서 h2 를 쓸지 정함 → 브라우저는 HTTPS 위에서만 HTTP/2"
            ]
          }
        ],
        "links": [
          {
            "from": "hol-http",
            "to": "mux",
            "label": "해결"
          },
          {
            "from": "hol-tcp",
            "to": "quic",
            "label": "해결"
          },
          {
            "from": "pipe",
            "to": "hol",
            "label": "못 풂"
          }
        ]
      }
    },
    "tech": {
      "marks": [
        {
          "p": 2,
          "kind": "circle",
          "quote": "TCP 핸드셰이크"
        },
        {
          "p": 2,
          "kind": "circle",
          "quote": "TLS 협상"
        },
        {
          "p": 3,
          "kind": "circle",
          "quote": "프레임"
        },
        {
          "p": 3,
          "kind": "circle",
          "quote": "스트림 번호"
        },
        {
          "p": 5,
          "kind": "circle",
          "quote": "UDP"
        },
        {
          "p": 4,
          "kind": "highlight",
          "quote": "한 번 보낸 헤더는 양쪽이 기억해 두었다가 다음에는 번호만 보낸다"
        },
        {
          "p": 6,
          "kind": "highlight",
          "quote": "브라우저에서는 보안 연결(HTTPS) 위의 HTTP/2만 쓸 수 있다"
        },
        {
          "p": 2,
          "kind": "wave",
          "quote": "도메인 하나에 연결을 여러 개 열었다"
        },
        {
          "p": 5,
          "kind": "wave",
          "quote": "패킷 하나가 사라지면"
        }
      ],
      "boxes": [
        {
          "p": 1,
          "label": "예시",
          "text": "페이지가 style.css(만드는 데 2초)와 logo.png(0.1초)를 같은 연결로 받으면, logo.png 는 style.css 가 끝날 때까지 기다린다.",
          "pre": "0초    style.css 요청\n2초    style.css 응답 끝 → 이제 logo.png 차례\n2.1초  logo.png 응답 끝   (혼자였으면 0.1초)"
        },
        {
          "p": 2,
          "label": "먼저 알아야 할 것",
          "text": "연결을 여러 개 열면 왜 빨라지나: 연결 하나는 한 번에 응답 하나만 받으므로, 연결이 6개면 응답 6개를 동시에 받을 수 있다."
        },
        {
          "p": 2,
          "label": "용어 풀이",
          "text": "TCP 핸드셰이크는 데이터를 보내기 전에 양쪽이 세 번 주고받으며 연결을 여는 절차이고, TLS 협상은 그 위에서 암호화 방식과 키를 정하는 절차다. 연결을 새로 열 때마다 둘 다 다시 한다.",
          "pre": "클라이언트 ── SYN ──────▶ 서버\n클라이언트 ◀── SYN-ACK ── 서버\n클라이언트 ── ACK ──────▶ 서버   (여기까지 TCP, 이어서 TLS)"
        },
        {
          "p": 2,
          "label": "예시",
          "text": "그림 30장짜리 페이지를 연결 6개로 받으면 한 번에 6장씩 다섯 번에 나눠 받는다. 연결마다 TCP·TLS 준비를 따로 하니 준비도 여섯 번 한다."
        },
        {
          "p": 3,
          "label": "용어 풀이",
          "text": "프레임은 HTTP/2 가 보내는 가장 작은 단위이고, 스트림은 요청 하나와 그 응답이 오가는 논리적 통로다. 클라이언트가 여는 스트림은 홀수 번호를 쓴다."
        },
        {
          "p": 3,
          "label": "예시",
          "text": "index.html 과 app.js 를 동시에 요청하면 각각 스트림 1, 스트림 3 이 된다. 조각이 섞여 와도 번호로 다시 모은다.",
          "pre": "연결 위 흐름: [HEADERS 1][HEADERS 3][DATA 1][DATA 3][DATA 1] …\n받는 쪽:     스트림 1 조각끼리 → index.html\n             스트림 3 조각끼리 → app.js"
        },
        {
          "p": 4,
          "label": "예시",
          "text": "첫 요청의 긴 user-agent 헤더는 통째로 보내고 양쪽 표에 저장한다. 두 번째 요청부터는 그 표 번호만 보낸다. ':method: GET' 은 처음부터 정해진 표의 2번이라 늘 번호 하나로 간다.",
          "pre": "요청 1: user-agent: Mozilla/5.0 (Windows NT 10.0; …)   ← 통째로, 표에 저장\n요청 2: [62]                                         ← 표 번호만"
        },
        {
          "p": 5,
          "label": "예시",
          "text": "스트림 1·3·5 의 조각이 한 TCP 연결로 오다가 스트림 1 의 패킷 하나가 사라지면, 이미 도착한 스트림 3·5 의 데이터도 다시 받은 패킷이 올 때까지 앱에 넘어가지 않는다."
        },
        {
          "p": 5,
          "label": "먼저 알아야 할 것",
          "text": "TCP 는 받은 데이터를 보낸 순서대로만 위로 넘긴다. 중간 조각이 빠지면 그 뒤 조각이 이미 도착해 있어도 기다린다. 이 성질 때문에 HTTP/2 의 스트림도 함께 멈춘다."
        },
        {
          "p": 6,
          "label": "따라 해 보기",
          "text": "크롬에서 F12 를 눌러 Network 탭을 연다. 열 제목줄을 오른쪽 클릭해 Protocol 을 켜고 새로고침한다. h2 가 보이면 HTTP/2, h3 가 보이면 HTTP/3 로 받은 것이다."
        }
      ],
      "concepts": {
        "topic": "HTTP/2 를 읽기 위한 개념",
        "nodes": [
          {
            "id": "cost",
            "term": "연결 하나를 여는 비용",
            "role": "먼저 알 것",
            "parent": null,
            "def": {
              "p": 2,
              "quote": "하지만 연결마다 TCP 핸드셰이크"
            },
            "match": [
              "연결마다"
            ],
            "gloss": "새 연결마다 TCP·TLS 준비 과정을 다시 치러야 하는 부담",
            "points": [
              "연결 하나를 열려면 TCP 핸드셰이크 + TLS 협상",
              "새 연결마다 이 준비를 처음부터 다시 함",
              "예: 연결 6개를 열면 준비도 6번"
            ]
          },
          {
            "id": "tcp-hs",
            "term": "TCP 핸드셰이크",
            "role": "구성 요소",
            "parent": "cost",
            "def": {
              "p": 2,
              "quote": "하지만 연결마다 TCP 핸드셰이크"
            },
            "match": [
              "TCP 핸드셰이크"
            ],
            "gloss": "데이터를 보내기 전에 세 번 주고받아 연결을 여는 절차",
            "points": [
              "SYN → SYN-ACK → ACK, 세 번 주고받음",
              "이게 끝나야 데이터를 보낼 수 있음 (왕복 한 번이 듦)"
            ]
          },
          {
            "id": "tls",
            "term": "TLS 협상",
            "role": "구성 요소",
            "parent": "cost",
            "def": {
              "p": 2,
              "quote": "하지만 연결마다 TCP 핸드셰이크"
            },
            "match": [
              "TLS 협상",
              "TLS 핸드셰이크"
            ],
            "gloss": "암호화 방식과 키를 정하는 절차",
            "points": [
              "암호화 방식을 고르고 키를 나눠 갖는 절차",
              "TCP 연결이 열린 다음에 이어서 함",
              "이 단계에서 h2 사용도 함께 정함(ALPN)"
            ]
          },
          {
            "id": "unit",
            "term": "HTTP/2 의 전송 단위",
            "role": "핵심",
            "parent": null,
            "def": {
              "p": 3,
              "quote": "HTTP/2는 하나의 TCP 연결 위에서"
            },
            "match": [
              "하나의 TCP 연결"
            ],
            "gloss": "HTTP/2 는 연결 하나에 메시지를 조각내 섞어 보냄",
            "points": [
              "연결 하나에 여러 요청을 섞어 보냄",
              "단위: 프레임(조각) → 스트림(요청 하나의 통로)"
            ]
          },
          {
            "id": "frame",
            "term": "프레임",
            "role": "가장 작은 단위",
            "parent": "unit",
            "def": {
              "p": 3,
              "quote": "메시지를 프레임이라는"
            },
            "match": [
              "프레임"
            ],
            "gloss": "길이·종류·스트림 번호가 붙은 가장 작은 전송 조각",
            "points": [
              "9바이트 머리: 길이 · 종류 · 플래그 · 스트림 번호",
              "예: HEADERS 프레임(헤더), DATA 프레임(본문)"
            ]
          },
          {
            "id": "stream",
            "term": "스트림",
            "role": "논리적 통로",
            "parent": "unit",
            "def": {
              "p": 3,
              "quote": "받는 쪽은 스트림 번호를"
            },
            "match": [
              "스트림"
            ],
            "gloss": "요청 하나와 응답이 오가는 논리적 통로",
            "points": [
              "요청 하나와 그 응답이 오가는 논리적 통로",
              "번호로 구분, 클라이언트가 열면 홀수",
              "예: index.html = 스트림 1, app.js = 스트림 3"
            ]
          },
          {
            "id": "hpack",
            "term": "헤더 압축 (HPACK)",
            "role": "핵심",
            "parent": null,
            "def": {
              "p": 4,
              "quote": "한 번 보낸 헤더는"
            },
            "match": [
              "HPACK",
              "헤더"
            ],
            "gloss": "한 번 보낸 헤더는 양쪽이 기억해 두고 번호만 보냄",
            "points": [
              "정적 표: 자주 쓰는 헤더 61개에 미리 번호",
              "동적 표: 한 번 보낸 헤더를 62번부터 저장",
              "예: 두 번째 요청의 같은 user-agent → [62] 하나로"
            ]
          },
          {
            "id": "tcp-limit",
            "term": "TCP 위의 한계",
            "role": "주의",
            "parent": null,
            "def": {
              "p": 5,
              "quote": "패킷 하나가 사라지면"
            },
            "match": [
              "패킷 하나가 사라지면"
            ],
            "gloss": "TCP 는 순서를 지키느라 패킷 하나만 잃어도 뒤가 전부 멈춤",
            "points": [
              "TCP 는 받은 데이터를 순서대로만 앱에 넘김",
              "패킷 하나가 빠지면 다른 스트림 데이터도 대기",
              "HTTP/2 로는 못 고침"
            ]
          },
          {
            "id": "quic",
            "term": "UDP · QUIC (HTTP/3)",
            "role": "다음 단계",
            "parent": "tcp-limit",
            "def": {
              "p": 5,
              "quote": "HTTP/3는 UDP 위의 QUIC"
            },
            "match": [
              "UDP",
              "QUIC",
              "HTTP/3"
            ],
            "gloss": "UDP 위의 QUIC 로 스트림마다 순서를 따로 지킴",
            "points": [
              "HTTP/3 는 TCP 대신 UDP 위의 QUIC 를 씀",
              "스트림마다 순서를 따로 지켜 한 스트림의 손실이 다른 스트림을 막지 않음"
            ]
          },
          {
            "id": "https",
            "term": "HTTPS 필수",
            "role": "사용 조건",
            "parent": null,
            "def": {
              "p": 6,
              "quote": "브라우저에서는 보안 연결"
            },
            "match": [
              "HTTPS",
              "보안 연결"
            ],
            "gloss": "브라우저는 암호화된 연결 위의 HTTP/2 만 씀",
            "points": [
              "브라우저는 암호화된 연결(HTTPS) 위의 HTTP/2 만 지원",
              "암호화 없는 HTTP/2(h2c)는 브라우저가 쓰지 않음"
            ]
          },
          {
            "id": "alpn",
            "term": "ALPN",
            "role": "협상 방법",
            "parent": "https",
            "def": {
              "p": 6,
              "quote": "ALPN이라는 확장으로"
            },
            "match": [
              "ALPN"
            ],
            "gloss": "TLS 협상 중에 h2 사용을 미리 정함",
            "points": [
              "TLS 첫 메시지(ClientHello)에 'h2 가능' 을 실어 보냄",
              "서버가 h2 를 고르면 그 연결은 HTTP/2",
              "확인: 개발자 도구 Network 탭의 Protocol 열"
            ]
          }
        ],
        "links": [
          {
            "from": "unit",
            "to": "cost",
            "label": "연결 수를 줄임"
          },
          {
            "from": "tcp-limit",
            "to": "quic",
            "label": "해결"
          }
        ]
      }
    }
  }
});
