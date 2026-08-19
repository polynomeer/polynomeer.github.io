---
title: "Go goroutine으로 202개 종목 동시 수집하기 — Market Gateway 설계"
date: 2026-06-05
categories: [Monticker, Realtime]
tags: [monticker, go, goroutine, kafka, market-gateway, concurrency]
series: monticker
series_title: monticker 설계와 구현 기록
series_order: 4
series_description: monticker를 구상하고 설계하고 구현해 가는 과정을 제품, 아키텍처, 인프라, 정량 분석 관점에서 정리한 시리즈.
status: draft
---

## 왜 Go인가

시세 수집기를 만들 때 가장 먼저 마주하는 문제는 **동시성**이다. 202개 종목의 가격 변화를 1초마다 처리하려면, 202개의 독립적인 루프가 동시에 돌아야 한다.

JVM(Kotlin/Spring) 위에서도 가능하지만, Go의 goroutine을 사용하면 비용이 훨씬 낮다.

| 동시성 단위 | 시작 스택 크기 | 1만 개 생성 시 메모리 |
|------------|--------------|---------------------|
| OS Thread | ~1-8 MB | ~10 GB |
| JVM Thread | ~512 KB~1 MB | ~5 GB |
| Kotlin Coroutine | ~수 KB | 수십 MB |
| Go Goroutine | **~2 KB** | **~20 MB** |

202개 종목 정도는 어떤 방식이든 처리할 수 있지만, 실제 거래소는 수천 개 종목을 다룬다. goroutine은 그 규모에서도 메모리 부담이 없다.

---

## 전체 구조

```
services/market-gateway/
├── main.go
├── go.mod
├── Dockerfile
└── internal/
    ├── stock/loader.go       # DB에서 활성 종목 로드
    ├── generator/generator.go # goroutine-per-stock 틱 루프
    ├── kafkaproducer/producer.go # Kafka 발행
    └── tick/tick.go          # 틱 메시지 구조체
```

의존성은 두 개뿐이다.

```
github.com/jackc/pgx/v5       # PostgreSQL 드라이버
github.com/segmentio/kafka-go  # Kafka 클라이언트
```

Spring 없이, CGo 없이. 최종 바이너리 크기는 약 12MB, Docker 이미지는 alpine 기반 약 20MB다.

---

## 진입점: main.go

```go
func main() {
    brokers := getenv("KAFKA_BROKERS", "localhost:9092")
    dbURL   := getenv("DB_URL", "postgres://monticker:monticker@localhost:5432/monticker?sslmode=disable")

    // SIGINT/SIGTERM 수신 시 ctx 취소 → 모든 goroutine 정상 종료
    ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
    defer stop()

    pool, err := pgxpool.New(ctx, dbURL)
    if err != nil {
        log.Fatalf("DB 연결 실패: %v", err)
    }
    defer pool.Close()

    stocks, err := stock.LoadActiveStocks(ctx, pool)
    if err != nil {
        log.Fatalf("종목 로드 실패: %v", err)
    }
    log.Printf("loaded %d active stocks", len(stocks))

    producer := kafkaproducer.New(brokers)
    defer producer.Close()

    generator.Run(ctx, stocks, producer, 1*time.Second)
}
```

`signal.NotifyContext`는 Go 1.16부터 표준 라이브러리에 포함된 패턴이다. SIGINT(Ctrl+C)나 SIGTERM을 받으면 ctx가 취소되고, 이를 select로 감지하는 모든 goroutine이 정상 종료된다.

---

## 종목 로드: stock/loader.go

```go
type Stock struct {
    ID        int64
    Symbol    string
    Market    string
    BasePrice float64
}

func LoadActiveStocks(ctx context.Context, pool *pgxpool.Pool) ([]Stock, error) {
    rows, err := pool.Query(ctx, `
        SELECT id, symbol, market, COALESCE(base_price, 10000.0) as base_price
        FROM stocks
        WHERE is_active = true
        ORDER BY id
    `)
    if err != nil {
        return nil, err
    }
    defer rows.Close()

    var stocks []Stock
    for rows.Next() {
        var s Stock
        if err := rows.Scan(&s.ID, &s.Symbol, &s.Market, &s.BasePrice); err != nil {
            return nil, err
        }
        stocks = append(stocks, s)
    }
    return stocks, rows.Err()
}
```

DB 연결은 애플리케이션 시작 시 1회만 수행한다. 이후 goroutine들은 DB에 접근하지 않으므로 커넥션 풀 부하가 없다.

---

## 핵심: goroutine-per-stock 틱 루프

```go
func Run(ctx context.Context, stocks []stock.Stock, pub Publisher, interval time.Duration) {
    var wg sync.WaitGroup
    for _, s := range stocks {
        wg.Add(1)
        go func(s stock.Stock) {
            defer wg.Done()
            tickLoop(ctx, s, pub, interval)
        }(s)
    }
    // ctx 취소 시 모든 goroutine이 tickLoop에서 return하면 wg.Wait() 통과
    wg.Wait()
}

func tickLoop(ctx context.Context, s stock.Stock, pub Publisher, interval time.Duration) {
    price := s.BasePrice
    ticker := time.NewTicker(interval)
    defer ticker.Stop()

    for {
        select {
        case <-ctx.Done():
            return  // graceful shutdown
        case <-ticker.C:
            price = nextPrice(price)
            t := tick.Tick{
                StockID:     s.ID,
                Symbol:      s.Symbol,
                Market:      s.Market,
                Price:       math.Round(price*100) / 100,
                Volume:      rand.Int63n(100000) + 1000,
                TradeTime:   time.Now().UTC(),
                GeneratedAt: time.Now().UTC(),
            }
            pub.Publish(ctx, strconv.FormatInt(s.ID, 10), t)
        }
    }
}
```

goroutine 클로저에서 루프 변수를 직접 캡처하면 모든 goroutine이 마지막 값을 공유하는 버그가 생긴다. Go 1.22부터 이 문제가 수정됐지만, 명시적으로 `s stock.Stock`을 파라미터로 넘기는 방어 코딩이 여전히 권장된다.

---

## 랜덤워크 가격

현재는 가격을 랜덤워크로 생성한다. 나중에 KIS WebSocket을 연동하면 이 부분만 교체하면 된다.

```go
func nextPrice(current float64) float64 {
    // ±0.1% 범위 내 랜덤 변동
    change := (rand.Float64() - 0.5) * 0.002
    next := current * (1 + change)
    return math.Max(next, 1.0) // 0원 미만 방지
}
```

주가가 양수를 유지하도록 `math.Max(next, 1.0)`로 보호한다.

---

## Kafka 발행: kafkaproducer/producer.go

```go
const TicksTopic = "market.ticks"

type Producer struct {
    writer *kafka.Writer
}

func New(brokers string) *Producer {
    return &Producer{
        writer: &kafka.Writer{
            Addr:         kafka.TCP(strings.Split(brokers, ",")...),
            Topic:        TicksTopic,
            Balancer:     &kafka.Hash{},       // 핵심: 키 해시 기반 파티션 선택
            RequiredAcks: kafka.RequireOne,    // leader ack만 기다림
        },
    }
}

func (p *Producer) Publish(ctx context.Context, key string, t tick.Tick) {
    payload, err := json.Marshal(t)
    if err != nil {
        log.Printf("직렬화 실패: %v", err)
        return
    }
    if err := p.writer.WriteMessages(ctx, kafka.Message{
        Key:   []byte(key),   // key = stockId
        Value: payload,
    }); err != nil {
        log.Printf("Kafka 발행 실패 [%s]: %v", key, err)
    }
}
```

`kafka.Hash{}` 밸런서가 핵심이다. key(stockId)를 해싱해 같은 종목의 틱이 항상 같은 파티션으로 간다. 파티션 내에서 메시지 순서가 보장되므로, 컨슈머가 캔들 집계를 할 때 시간 역전 오류가 없다.

---

## 틱 메시지 형식

```go
type Tick struct {
    StockID     int64     `json:"stockId"`
    Symbol      string    `json:"symbol"`
    Market      string    `json:"market"`
    Price       float64   `json:"price"`
    Volume      int64     `json:"volume"`
    TradeTime   time.Time `json:"tradeTime"`
    GeneratedAt time.Time `json:"generatedAt"`
}
```

`GeneratedAt`은 나중에 지연(latency) 추적에 사용된다. 컨슈머에서 `time.Now() - GeneratedAt`을 계산하면 Kafka 파이프라인의 엔드투엔드 지연을 측정할 수 있다.

---

## 실행 확인

202개 종목이 로드되고 틱이 발행되는지 확인한다.

```bash
# 환경변수 설정
export KAFKA_BROKERS=localhost:29092
export DB_URL="postgres://monticker:monticker@localhost:5432/monticker?sslmode=disable"

# 실행
cd services/market-gateway
go run .

# 출력
# 2025/07/01 10:00:00 loaded 202 active stocks
# 2025/07/01 10:00:01 [005930] published tick: 73200.00
# 2025/07/01 10:00:01 [AAPL] published tick: 218.50
# ...

# Kafka 토픽 확인
kafka-console-consumer \
  --bootstrap-server localhost:29092 \
  --topic market.ticks \
  --from-beginning \
  --max-messages 3
```

```json
{"stockId":1,"symbol":"005930","market":"KOSPI","price":73200.5,"volume":45231,"tradeTime":"2025-07-01T10:00:01Z","generatedAt":"2025-07-01T10:00:01Z"}
```

---

## KIS WebSocket 연동 경로

현재 `tickLoop`의 `nextPrice()` 호출을 KIS WebSocket 수신 채널로 교체하면 실시간 시세로 전환된다.

```go
// 현재 (mock)
price = nextPrice(price)

// KIS 연동 후
msg := <-kisMessageChannel  // KIS H0STASP0 호가 메시지
price = parseKisPrice(msg)
```

goroutine-per-stock 구조는 KIS의 종목별 WebSocket 구독과 자연스럽게 대응된다.

---

## 정리

- Go goroutine은 2KB 시작 스택으로 202개(~수천 개)를 동시에 실행해도 메모리 부담이 없다.
- `kafka.Hash{}` 밸런서로 같은 종목의 틱이 같은 파티션에 순서대로 쌓인다.
- `signal.NotifyContext`로 Ctrl+C 시 모든 goroutine을 정상 종료한다.

다음 편에서는 이 틱이 Kafka 토픽을 거쳐 **Kotlin Worker**에서 어떻게 소비되는지, 토픽 설계와 at-least-once 처리를 다룬다.
