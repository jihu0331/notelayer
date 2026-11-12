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
      "outline": [
        {
          "title": "문제: HOL 블로킹",
          "items": [
            {
              "p": 1,
              "quote": "앞의 응답이 늦어지면"
            },
            {
              "p": 2,
              "quote": "파이프라이닝이라는 방식도"
            }
          ]
        },
        {
          "title": "해결: 멀티플렉싱",
          "items": [
            {
              "p": 3,
              "quote": "하나의 TCP 연결 위에서"
            },
            {
              "p": 3,
              "quote": "메시지를 프레임이라는"
            },
            {
              "p": 3,
              "quote": "이것을 멀티플렉싱이라고"
            }
          ]
        },
        {
          "title": "헤더 압축: HPACK",
          "items": [
            {
              "p": 4,
              "quote": "HPACK이라는 방식으로"
            }
          ]
        },
        {
          "title": "남은 한계",
          "items": [
            {
              "p": 5,
              "quote": "TCP 층의 HOL 블로킹은 남은 것이다"
            },
            {
              "p": 5,
              "quote": "HTTP/3는 UDP 위의 QUIC"
            }
          ]
        },
        {
          "title": "쓰는 조건: HTTPS 와 ALPN",
          "items": [
            {
              "p": 6,
              "quote": "보안 연결(HTTPS) 위의"
            },
            {
              "p": 6,
              "quote": "ALPN이라는 확장으로"
            }
          ]
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
            ]
          },
          {
            "id": "h1fix",
            "term": "HTTP/1.1 의 대응",
            "role": "임시 방편",
            "parent": null,
            "def": null,
            "match": []
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
          "p": 3,
          "label": "용어 풀이",
          "text": "프레임은 HTTP/2 가 보내는 가장 작은 단위이고, 스트림은 요청 하나와 그 응답이 오가는 논리적 통로다. 클라이언트가 여는 스트림은 홀수 번호를 쓴다."
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
      "outline": [
        {
          "title": "먼저: 연결 하나를 여는 비용",
          "items": [
            {
              "p": 2,
              "quote": "도메인 하나에 연결을"
            },
            {
              "p": 2,
              "quote": "하지만 연결마다 TCP 핸드셰이크"
            }
          ]
        },
        {
          "title": "HTTP/2 의 단위: 프레임과 스트림",
          "items": [
            {
              "p": 3,
              "quote": "HTTP/2는 하나의 TCP 연결 위에서"
            },
            {
              "p": 3,
              "quote": "메시지를 프레임이라는"
            },
            {
              "p": 3,
              "quote": "받는 쪽은 스트림 번호를"
            }
          ]
        },
        {
          "title": "헤더를 줄이는 방법",
          "items": [
            {
              "p": 4,
              "quote": "한 번 보낸 헤더는"
            }
          ]
        },
        {
          "title": "TCP 위라서 남는 문제",
          "items": [
            {
              "p": 5,
              "quote": "패킷 하나가 사라지면"
            },
            {
              "p": 5,
              "quote": "HTTP/3는 UDP 위의 QUIC"
            }
          ]
        },
        {
          "title": "실제로 쓰고 확인하려면",
          "items": [
            {
              "p": 6,
              "quote": "브라우저에서는 보안 연결"
            },
            {
              "p": 6,
              "quote": "개발자 도구 Network 탭"
            }
          ]
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
