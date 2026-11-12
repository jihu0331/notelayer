// RFC 9113 (HTTP/2) — 1. Introduction
// 출처: IETF RFC 9113 (2022) 1장 원문 그대로 · Copyright (c) 2022 IETF Trust and the persons identified as the document authors · 번역은 이 시연에서 붙임
window.NL_DOCS = window.NL_DOCS || [];
window.NL_DOCS.push({
  "id": "rfc",
  "title": "RFC 9113 (HTTP/2) — 1. Introduction",
  "lang": "en",
  "source": "IETF RFC 9113 (2022) 1장 원문 그대로 · Copyright (c) 2022 IETF Trust and the persons identified as the document authors · 번역은 이 시연에서 붙임",
  "templates": [
    "tech"
  ],
  "blocks": [
    {
      "p": 1,
      "text": "The performance of applications using the Hypertext Transfer Protocol (HTTP, [HTTP]) is linked to how each version of HTTP uses the underlying transport, and the conditions under which the transport operates.",
      "tr": "HTTP(하이퍼텍스트 전송 프로토콜)를 쓰는 애플리케이션의 성능은 각 HTTP 버전이 그 아래의 전송 계층을 어떻게 쓰는지, 그리고 그 전송 계층이 어떤 조건에서 동작하는지와 맞물려 있다."
    },
    {
      "p": 2,
      "text": "Making multiple concurrent requests can reduce latency and improve application performance. HTTP/1.0 allowed only one request to be outstanding at a time on a given TCP [TCP] connection. HTTP/1.1 [HTTP/1.1] added request pipelining, but this only partially addressed request concurrency and still suffers from application-layer head-of-line blocking. Therefore, HTTP/1.0 and HTTP/1.1 clients use multiple connections to a server to make concurrent requests.",
      "tr": "여러 요청을 동시에 보내면 지연을 줄이고 애플리케이션 성능을 높일 수 있다. HTTP/1.0 은 하나의 TCP 연결에서 응답을 기다리는 요청을 한 번에 하나만 허용했다. HTTP/1.1 은 요청 파이프라이닝을 더했지만, 이는 요청 동시성 문제를 일부만 해결했고 여전히 애플리케이션 계층의 HOL 블로킹을 겪는다. 그래서 HTTP/1.0 과 HTTP/1.1 클라이언트는 동시에 요청하려고 서버에 연결을 여러 개 연다."
    },
    {
      "p": 3,
      "text": "Furthermore, HTTP fields are often repetitive and verbose, causing unnecessary network traffic as well as causing the initial TCP congestion window to quickly fill. This can result in excessive latency when multiple requests are made on a new TCP connection.",
      "tr": "게다가 HTTP 필드(헤더)는 반복이 많고 장황해서 불필요한 네트워크 트래픽을 만들고, TCP 의 초기 혼잡 윈도를 금방 채운다. 그 결과 새 TCP 연결에서 요청을 여러 개 보낼 때 지연이 지나치게 커질 수 있다."
    },
    {
      "p": 4,
      "text": "HTTP/2 addresses these issues by defining an optimized mapping of HTTP's semantics to an underlying connection. Specifically, it allows interleaving of messages on the same connection and uses an efficient coding for HTTP fields. It also allows prioritization of requests, letting more important requests complete more quickly, further improving performance.",
      "tr": "HTTP/2 는 HTTP 의 의미 체계를 아래 연결에 옮기는 방식을 최적화해 이 문제들을 해결한다. 구체적으로, 같은 연결에서 메시지를 번갈아 끼워 보낼 수 있게 하고 HTTP 필드를 효율적으로 부호화한다. 또 요청에 우선순위를 매겨 더 중요한 요청이 더 빨리 끝나게 해 성능을 한층 높인다."
    },
    {
      "p": 5,
      "text": "The resulting protocol is more friendly to the network because fewer TCP connections can be used in comparison to HTTP/1.x. This means less competition with other flows and longer-lived connections, which in turn lead to better utilization of available network capacity. Note, however, that TCP head-of-line blocking is not addressed by this protocol.",
      "tr": "그 결과 이 프로토콜은 HTTP/1.x 보다 적은 수의 TCP 연결을 쓸 수 있어 네트워크에 더 우호적이다. 다른 흐름과 덜 경쟁하고 연결이 더 오래 유지되며, 이는 쓸 수 있는 네트워크 용량을 더 잘 활용하게 한다. 다만 TCP 의 HOL 블로킹은 이 프로토콜이 해결하지 않는다는 점에 유의해야 한다."
    },
    {
      "p": 6,
      "text": "Finally, HTTP/2 also enables more efficient processing of messages through use of binary message framing.",
      "tr": "끝으로, HTTP/2 는 이진 메시지 프레이밍을 써서 메시지를 더 효율적으로 처리할 수 있게 한다."
    }
  ],
  "annotations": {
    "tech": {
      "marks": [
        {
          "p": 2,
          "kind": "circle",
          "quote": "pipelining"
        },
        {
          "p": 2,
          "kind": "circle",
          "quote": "head-of-line blocking"
        },
        {
          "p": 3,
          "kind": "circle",
          "quote": "congestion window"
        },
        {
          "p": 4,
          "kind": "circle",
          "quote": "interleaving"
        },
        {
          "p": 6,
          "kind": "circle",
          "quote": "binary message framing"
        },
        {
          "p": 4,
          "kind": "highlight",
          "quote": "it allows interleaving of messages on the same connection and uses an efficient coding for HTTP fields"
        },
        {
          "p": 5,
          "kind": "highlight",
          "quote": "TCP head-of-line blocking is not addressed by this protocol"
        },
        {
          "p": 1,
          "kind": "wave",
          "quote": "the underlying transport"
        },
        {
          "p": 3,
          "kind": "wave",
          "quote": "causing the initial TCP congestion window to quickly fill"
        }
      ],
      "boxes": [
        {
          "p": 1,
          "label": "먼저 알아야 할 것",
          "text": "underlying transport 는 HTTP 아래에서 실제로 바이트를 나르는 계층이고, 여기서는 TCP 다. HTTP 는 무엇을 요청할지를, TCP 는 빠짐없이 순서대로 보내는 일을 맡는다."
        },
        {
          "p": 2,
          "label": "용어 풀이",
          "text": "head-of-line blocking(HOL 블로킹)은 줄 맨 앞이 막히면 뒤가 모두 기다리는 현상이다. pipelining 은 응답을 기다리지 않고 요청을 연달아 보내는 방식인데, 응답은 보낸 순서대로 와야 해서 앞 응답이 늦으면 뒤도 막힌다."
        },
        {
          "p": 2,
          "label": "예시",
          "text": "요청 A·B·C 를 연달아 보내도(pipelining) 응답은 A → B → C 순서로만 와야 한다. A 를 만드는 데 3초 걸리면 이미 준비된 B·C 도 3초를 기다린다."
        },
        {
          "p": 3,
          "label": "예시",
          "text": "새 TCP 연결의 초기 혼잡 윈도는 보통 약 14KB(세그먼트 10개)다. 쿠키를 포함한 헤더가 요청마다 1KB 라면 요청 몇 개만으로 이 창이 차서, 확인 응답을 기다리는 왕복이 생긴다."
        },
        {
          "p": 3,
          "label": "먼저 알아야 할 것",
          "text": "congestion window(혼잡 윈도)는 TCP 가 상대의 확인 응답 없이 한 번에 보낼 수 있는 데이터 양이다. 새 연결은 작게 시작해 점점 늘리므로, 연결 초반에 긴 헤더가 반복되면 그 작은 창을 헤더가 다 차지한다."
        },
        {
          "p": 4,
          "label": "예시",
          "text": "같은 연결에서 메시지 두 개를 번갈아 끼워 보내는 모습이다.",
          "pre": "HTTP/1.1: [메시지 A 전체] → [메시지 B 전체]\nHTTP/2  : [A 조각][B 조각][A 조각][B 조각] …  (스트림 번호로 구분)"
        },
        {
          "p": 4,
          "label": "보충",
          "text": "이 서론은 우선순위를 장점으로 들지만, 같은 문서 5.3.2절은 이전 판(RFC 7540)의 우선순위 신호 방식을 폐기(deprecated)했다. 지금은 HTTP 버전과 상관없이 쓰는 Priority 헤더 방식(RFC 9218)이 있다."
        },
        {
          "p": 5,
          "label": "따라 해 보기",
          "text": "크롬에서 F12 를 눌러 Network 탭을 연다. 열 제목줄을 오른쪽 클릭해 Protocol 을 켜고 새로고침한다. 같은 사이트에서 h2 요청이 연결 하나를 나눠 쓰는지는 Connection ID 열을 켜면 볼 수 있다."
        },
        {
          "p": 6,
          "label": "용어 풀이",
          "text": "HTTP/1.1 은 사람이 읽는 글자로 메시지를 주고받았지만, HTTP/2 는 길이·종류·스트림 번호가 정해진 자리에 들어간 이진 프레임으로 나눠 보낸다. 기계가 경계를 바로 알 수 있어 처리가 빠르다.",
          "pre": "프레임 머리(9바이트, 4.1절)\n길이 24비트 | 종류 8비트 | 플래그 8비트 | 예약 1비트 + 스트림 번호 31비트"
        },
        {
          "p": 6,
          "label": "예시",
          "text": "HTTP/1.1 은 'GET /index.html HTTP/1.1' 같은 글자 줄을 줄바꿈 기준으로 읽어야 머리(헤더)가 어디서 끝나는지 안다. HTTP/2 는 9바이트 프레임 머리에서 길이를 먼저 읽고 그만큼만 잘라 낸다."
        }
      ],
      "concepts": {
        "topic": "HTTP/2 가 나온 이유",
        "nodes": [
          {
            "id": "transport",
            "term": "underlying transport",
            "role": "전제",
            "parent": null,
            "def": {
              "p": 1,
              "quote": "the underlying transport"
            },
            "match": [
              "underlying transport",
              "the transport"
            ],
            "gloss": "HTTP 아래에서 실제로 데이터를 나르는 계층(여기서는 TCP)"
          },
          {
            "id": "problems",
            "term": "HTTP/1.x 의 문제",
            "role": "문제",
            "parent": null,
            "def": null,
            "match": [],
            "gloss": "HTTP/1.0·1.1 이 가진 성능 문제 두 가지"
          },
          {
            "id": "hol",
            "term": "head-of-line blocking",
            "role": "문제 1",
            "parent": "problems",
            "def": {
              "p": 2,
              "quote": "added request pipelining"
            },
            "match": [
              "head-of-line blocking"
            ],
            "gloss": "앞 요청이 막히면 뒤 요청이 모두 기다리는 현상"
          },
          {
            "id": "pipe",
            "term": "pipelining",
            "role": "부분 해결",
            "parent": "hol",
            "def": {
              "p": 2,
              "quote": "added request pipelining"
            },
            "match": [
              "pipelining"
            ],
            "gloss": "요청을 연달아 보내는 방식. 응답 순서 제약 때문에 절반의 해결"
          },
          {
            "id": "fields",
            "term": "반복되는 HTTP 필드",
            "role": "문제 2",
            "parent": "problems",
            "def": {
              "p": 3,
              "quote": "HTTP fields are often repetitive"
            },
            "match": [
              "HTTP fields"
            ],
            "gloss": "요청마다 길고 비슷한 헤더가 반복돼 낭비가 큼"
          },
          {
            "id": "cwnd",
            "term": "congestion window",
            "role": "관련 개념",
            "parent": "fields",
            "def": {
              "p": 3,
              "quote": "HTTP fields are often repetitive"
            },
            "match": [
              "congestion window"
            ],
            "gloss": "TCP 가 확인 없이 한 번에 보낼 수 있는 양. 새 연결에선 작음"
          },
          {
            "id": "h2",
            "term": "HTTP/2 의 해결",
            "role": "해결책",
            "parent": null,
            "def": {
              "p": 4,
              "quote": "HTTP/2 addresses these issues"
            },
            "match": [
              "HTTP/2"
            ],
            "gloss": "HTTP 의 의미는 그대로 두고 연결을 쓰는 방식을 바꿈"
          },
          {
            "id": "inter",
            "term": "interleaving",
            "role": "해결 1",
            "parent": "h2",
            "def": {
              "p": 4,
              "quote": "it allows interleaving of messages"
            },
            "match": [
              "interleaving"
            ],
            "gloss": "같은 연결에서 여러 메시지를 번갈아 끼워 보냄"
          },
          {
            "id": "coding",
            "term": "efficient coding for HTTP fields",
            "role": "해결 2",
            "parent": "h2",
            "def": {
              "p": 4,
              "quote": "it allows interleaving of messages"
            },
            "match": [
              "efficient coding"
            ],
            "gloss": "헤더를 효율적으로 부호화해 크기를 줄임"
          },
          {
            "id": "prio",
            "term": "prioritization",
            "role": "5.3.2 에서 폐기",
            "parent": "h2",
            "def": {
              "p": 4,
              "quote": "It also allows prioritization"
            },
            "match": [
              "prioritization"
            ],
            "gloss": "중요한 요청을 먼저 끝내게 하는 신호. 이 문서 5.3.2절에서 폐기"
          },
          {
            "id": "framing",
            "term": "binary message framing",
            "role": "처리 효율",
            "parent": "h2",
            "def": {
              "p": 6,
              "quote": "binary message framing"
            },
            "match": [
              "binary message framing"
            ],
            "gloss": "메시지를 이진 프레임으로 나눠 기계가 빠르게 처리"
          },
          {
            "id": "limit",
            "term": "TCP head-of-line blocking",
            "role": "남은 한계",
            "parent": null,
            "def": {
              "p": 5,
              "quote": "TCP head-of-line blocking is not addressed"
            },
            "match": [
              "TCP head-of-line blocking"
            ],
            "gloss": "TCP 층의 HOL 블로킹은 HTTP/2 로도 남음"
          }
        ],
        "links": [
          {
            "from": "inter",
            "to": "hol",
            "label": "해결"
          },
          {
            "from": "coding",
            "to": "fields",
            "label": "해결"
          },
          {
            "from": "limit",
            "to": "hol",
            "label": "TCP 층에 남음"
          }
        ]
      }
    }
  }
});
