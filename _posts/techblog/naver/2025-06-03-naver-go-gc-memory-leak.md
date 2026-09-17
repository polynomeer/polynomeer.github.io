---
title: "네이버 D2 「Go GC를 너무 믿지 마세요 - 메모리 누수 탐지와 GC 주기 조절」 리뷰 — RES와 heap의 차이가 크면 Go 바깥을 의심하고, GC는 자주 돌린다고 메모리가 주는 게 아니다"
date: 2025-06-03
status: draft
categories: [TechBlog, Naver]
tags: [Tech Blog Review, Naver, Go, Garbage Collection, Memory Leak, cgo, valgrind, Profiling, GOGC]
series: bigtech-blog-reviews
series_title: 빅테크 기술 블로그 리뷰
series_order: 7
source_url: https://d2.naver.com/helloworld/5316262
---

원문: [Go GC를 너무 믿지 마세요 - 메모리 누수 탐지와 GC 주기 조절](https://d2.naver.com/helloworld/5316262) — NAVER D2, 신우진, 2025-02-10

## 한 줄 요약

네이버 메일·메시지 검색 엔진 Noir(Go)는 메모리가 재시작할 때까지 천천히 계속 늘었다. 원인은 둘이었다. **cgo로 쓰는 C++ 라이브러리의 메모리 누수**(Go GC가 모르는 영역)와 **GC가 회수하는 속도보다 할당이 빠른 것**. 전자는 valgrind로 cgo 부분만 따로 검사해 잡았고, 후자는 GOGC를 올려 해결했다. 직관과 반대로 GOGC를 낮춰 GC를 자주 돌리면 CPU도 더 쓰고 heap도 더 커졌다. 마지막으로 heap 프로파일로 13KB 이상 큰 객체를 대량 할당하는 코드를 찾아 고쳐 전체 메모리 30%를 줄였다.

## 배경: RES와 heap은 다른 것이다

먼저 두 숫자를 구분한다. **RES**(RSS)는 OS가 보기에 프로세스가 실제로 점유한 물리 메모리다. 공유 라이브러리와 프로세스가 요청해 쓰는 메모리를 합친 것으로 `top`에서 본다. **heap**은 Go 런타임이 관리하는 메모리로 `runtime` 패키지나 `GODEBUG=gctrace=1`로 본다. RES는 heap을 포함해 프로세스가 도는 데 필요한 모든 메모리다.

여기서 원문의 첫 번째 진단 규칙이 나온다. **RES와 heap의 차이가 크면 Go가 관리하지 않는 곳이 메모리를 쓰고 있을 가능성이 높다.**

한 가지 함정도 짚는다. Go 1.12~1.15는 커널에 메모리를 돌려줄 때 `madvise(MADV_FREE)`를 썼다. 이 모드는 빠르지만 메모리 압박이 없으면 커널이 실제 해제를 미루므로, heap에서는 해제됐어도 RES에는 남아 있을 수 있다. 그 전후 버전은 `MADV_DONTNEED`라 바로 줄어든다. Dgraph의 비교 그래프가 이를 보여 준다. Noir는 최신 버전이라 해당 없었지만, 그 구간의 Go를 쓰면 RES만 보고 누수라 오해할 수 있다.

## 원인 1: cgo 메모리 누수를 valgrind로

Noir는 RES와 heap의 차이가 컸고 C++ 라이브러리를 cgo로 쓴다. cgo에서는 C처럼 할당·해제를 개발자가 직접 해야 하니 해제를 빼먹으면 그대로 누수다.

valgrind가 유용한데, Go 바이너리를 통째로 넣으면 경고가 쏟아진다. valgrind는 Go 런타임의 동작을 모르기 때문이다. 요령은 **cgo 코드만 쓰는 테스트 코드를 따로 빌드해서** valgrind에 넣는 것이다. 결과에서 `possibly lost`는 Go 런타임이 관리하는 메모리를 valgrind가 의심한 것이라 누수가 아니고, `definitely lost`는 가리키는 포인터가 없는데 해제되지 않은 heap이라 명백한 누수다. 확인하니 cgo 코드에서 String 객체를 할당한 뒤 해제하는 로직이 빠져 있었다. 해제 함수를 넣고 `definitely lost`가 사라졌다.

## 원인 2: GC 주기

Go의 GC는 Mark와 Sweep이고, gctrace 로그에는 세 구간이 찍힌다. Sweep 종료(STW) → Mark and Scan(동시 실행) → Mark 종료(STW). 로그 한 줄을 원문이 뜯어 준다.

```
gc 45093285 @891013.129s 8%: 0.54+13+0.53 ms clock, 21+0.053/17/0+21 ms cpu, 336->448->235 MB, 392 MB goal
```

45,093,285번째 GC, 시작 후 891,013초, 지금까지 GC가 쓴 시간 비율 8%, 벽시계로 0.54 + 13 + 0.53ms, heap은 시작 시 336MB → 끝 448MB → live 235MB, 목표 392MB. 끝났을 때 448MB로 목표 392MB를 못 맞췄다. Mark 중에도 애플리케이션이 할당하기 때문이다. 다음 목표는 live heap 235MB를 기준으로 정해지고, heap이 그 목표를 넘을 것 같으면 다음 GC가 뜬다.

조절 손잡이는 둘이다.

- **GOGC**: 목표 heap = live heap + (live heap + GC roots) × GOGC/100. 기본 100이니 대략 live의 2배. 실제 다음 로그의 목표가 471MB로 235의 2배와 맞는다. 올리면 GC가 드물어지고 내리면 잦아진다.
- **GOMEMLIMIT**: 목표 heap의 상한. 피크가 있는 앱은 OOM을 피하려 GOGC를 낮춰야 하는데, 그러면 평소에 GC가 너무 잦다. 상한을 두면 GOGC를 높게 둘 수 있다.

## 숫자: 2주 실험

테스트 환경의 Noir에 약 2주 동안 검색 요청을 쏟으며 gctrace로 heap을 봤다. 기본값(GOGC=100)에서는 heap이 계속 늘었고, GOGC를 높이자 증가가 사라졌다.

| 설정 | GC CPU | live heap 평균 | GC 직전 heap 평균 | live heap 변화(전후) | GC 직전 heap 변화(전후) |
| --- | ---: | ---: | ---: | ---: | ---: |
| GOGC=50 | 9% | 342.01MiB | 470.22MiB | -4.26MiB | -4.6MiB |
| GOGC=50, GOMEMLIMIT=800MiB | 17% | 640.48MiB | 697.12MiB | -19.23MiB | -12.35MiB |
| GOGC=100(기본) | 8% | 149.95MiB | 260.16MiB | +32.01MiB | +55.79MiB |
| GOGC=200 | 6% | 102.95MiB | 273.76MiB | +0.95MiB | +2.96MiB |
| GOGC=200, GOMEMLIMIT=800MiB | 5% | 99.94MiB | 267.46MiB | -0.87MiB | -0.89MiB |
| GOGC=300 | 4% | 98.45MiB | 358.30MiB | -1.08MiB | -2.67MiB |
| GOGC=300, GOMEMLIMIT=800MiB | 4% | 95.71MiB | 350.82MiB | +0.63MiB | +4.44MiB |
| GOGC=400 | 3% | 97.60MiB | 451.43MiB | +1.79MiB | +6.5MiB |
| GOGC=400, GOMEMLIMIT=800MiB | 3% | 90.74MiB | 425.45MiB | -3.2MiB | -10.29MiB |
| GOGC=600 | 2% | 93.91MiB | 623.61MiB | +1.75MiB | +9.48MiB |
| GOGC=600, GOMEMLIMIT=800MiB | 8% | 500.11MiB | 677.98MiB | -91.57MiB | -33.89MiB |

읽을 점 세 가지. 첫째, GOGC=100에서만 live heap이 +32MiB로 뚜렷이 늘었고 200 이상에서는 거의 0이다. 둘째, **GOGC가 작을수록 GC CPU가 높아지는데 live heap도 커진다**(50에서 342MiB, 200에서 103MiB). GC가 잦으면 오버헤드가 커져 메모리가 오히려 빨리 는다는 원문 서두의 경고가 수치로 보인다. 셋째, GOMEMLIMIT은 GOGC가 적당할 때(200·300·400)는 heap을 조금 줄여 주지만, 극단(50·600)에서는 CPU와 heap이 함께 튄다. 결론은 "반드시 실험으로 값을 찾아라"다.

## 덤: 큰 객체와 내부 단편화

Go 할당기는 크기에 따라 다르게 동작한다. 8byte 이하는 mcache, 8byte~32KB는 67개 크기 클래스 중 하나의 span에, 32KB 이상은 mheap이 페이지를 직접 할당한다. 이때 내부 단편화가 생긴다.

- 13KB 객체는 13,568byte 클래스에 들어가 약 4.2% 낭비. 그 클래스의 span(40,960byte)에는 3개가 들어가고 256byte가 남는다. 극단적으로 그 크기 객체가 하나뿐이면 span의 68%가 빈다.
- 35KB 객체는 8KB 페이지 5개(40KB)를 받아 12.5% 낭비.

크기 클래스가 촘촘해 보통은 문제가 안 되지만, 불필요한 복사가 겹치면 커진다. 확인법은 heap 프로파일의 `inuse_space / inuse_objects`로 함수별 평균 객체 크기를 구하는 것이다. 큰 객체를 많이 만드는 함수부터 줄이면 된다.

같은 크기 객체를 대량 할당한 뒤 일부만 붙잡는 것도 위험하다. 16byte 객체 포인터 슬라이스에서 512의 배수 인덱스만 남기면, 16 × 512 = 8KB(페이지 크기)라 **페이지마다 객체 하나씩** 살아남아 span이 하나도 해제되지 않는다. 포인터 8MB는 돌려받지만 객체 16MB는 그대로 남는다.

Noir는 프로파일로 13KB 이상 객체를 대량 할당하는 곳을 찾았고, 불필요한 메모리 복사를 고쳐 전체 메모리의 30%를 줄였다.

## 읽고 남는 질문

- GOGC를 올리면 GC 직전 heap이 커진다(600에서 624MiB). 컨테이너 메모리 제한이 빡빡한 환경에서는 GOGC를 올리는 대신 GOMEMLIMIT만으로 가는 편이 안전할 텐데, 최종 운영값이 무엇이었는지가 없다.
- GOGC=600 + GOMEMLIMIT=800MiB에서 live heap이 500MiB로 튄 이유가 설명되지 않는다. 상한에 자주 부딪혀 GC가 연속으로 도는 "GC 폭주" 상태로 보이는데, 그 로그가 있으면 좋았다.
- valgrind를 cgo 테스트에만 쓰는 방식은 좋은데, C++ 쪽 라이브러리가 내부적으로 캐시를 키우는 경우(누수는 아니지만 계속 느는 경우)는 어떻게 구분했는지 궁금하다.

## 한 줄로 가져가기

Go의 메모리가 계속 늘면 먼저 RES와 heap을 비교해 Go 바깥(cgo)을 가려내고, 안쪽이면 GC를 자주 돌릴 게 아니라 GOGC를 올리며 실험하고, 프로파일에서 평균 객체 크기가 큰 함수부터 잡아라.
