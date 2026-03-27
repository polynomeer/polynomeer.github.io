---
title: Single Flight
date: 2025-09-02
categories: [Archive, Programming]
tags: [Single Flight]
---

## Single Flight?

개발을 하면서 종종 동일한 리소스에 대한 여러 요청이 동시에 발생하는 상황에 직면하게 된다. 이는 중복 작업, 서비스 부하 증가, 그리고 전반적인 비효율성과 성능 저하로 이어질 수 있다. Go에서는 singleflight 패키지([golang.org/x/sync/singleflight](https://pkg.go.dev/golang.org/x/sync/singleflight))로 이에 대한 해결책을 제시한다.

"**Single flight**"라는 용어는 Go 언어의 `singleflight` 패키지에서 알려졌으며, 이 개념이 널리 퍼지면서 일반적인 소프트웨어 패턴 이름처럼 쓰이게 되었다. single flight의 목적은 중복된 함수를 동시에 여러 고루틴이 실행하지 않도록 **"하나의 실행(flight)"만 허용**하는 기능을 제공하는 것이다.

비유적 의미로 "단 한 번의 비행만 허용"한다는 뜻이다. 공항에서 대기하는 승객들을 상상해보자. 비행기의 입장에서 여러 요청이 동시에 들어오지만, 그 중 **하나만 실제 비행(작업)을 수행**하고, 나머지는 **그 비행의 결과를 기다리는 승객들**처럼 대기한다는 뜻이다. 승객마다 일일이 비행기를 띄우지 않는다 정도로 이해하면 될 것 같다. 기술적인 의미로는 하나의 키(key)에 대해 여러 요청이 몰리더라도, "단 한 번의 비행(flight)"만 하도록 제한한다는 뜻이다. 

------

## Singleflight는 어떻게 작동하나?

`singleflight` 패키지에서는 single flight 메커니즘의 핵심인 Group 타입을 제공한다. A는 중복 작업을 방지하려는 작업 클래스를 나타낸다. A의 기본 작동 방식은 다음과 같다.

1. 첫 번째 호출 시작: 리소스에 대한 첫 번째 요청이 이루어지면 `singleflight`리소스를 가져오거나 계산하는 함수에 대한 호출을 시작한다.
2. 동시 요청 처리: 초기 요청이 진행 중인 동안 동일한 리소스에 대한 추가 요청이 들어오면 `singleflight`해당 호출을 보류한다.
3. 결과 공유: 첫 번째 요청이 완료되면 결과가 원래 호출자에게 반환되고 동시에 대기 중이던 다른 모든 호출자와 공유된다.
4. 중복 방지: 이 프로세스 전체에서 `singleflight`함수 호출이 한 번만 수행되도록 하여 중복 작업을 효과적으로 방지한다.

---

## Go에서 Singleflight를 사용하는 이점

- 효율성: 단 하나의 요청만 작업을 수행하도록 보장함으로써 서비스와 데이터베이스에 불필요한 부하가 발생하는 것을 방지할 수 있다.
- 단순성: `singleflight`동일한 리소스에 대한 동시 요청을 처리하는 데 따른 복잡성을 추상화하여 코드를 더 깔끔하고 이해하기 쉽게 만든다.
- 리소스 최적화: 동일한 계산을 여러 번 반복하지 않으므로 메모리와 CPU 사용을 최적화하는 데 도움이 된다.

---

## Singleflight 구현: 간단한 예

Go에서 이 어떻게 사용되는지 보기위해 `singleflight`간단한 예를 살펴보자.

```go
package main

import (
	"fmt"
	"golang.org/x/sync/singleflight"
	"time"
)

var group singleflight.Group

func expensiveOperation(key string) (interface{}, error) {
	// Simulate an expensive operation
	time.Sleep(2 * time.Second)
	return fmt.Sprintf("Data for %s", key), nil
}

func main() {
	for i := 0; i < 5; i++ {
		go func(i int) {
			val, err, _ := group.Do("my_key", func() (interface{}, error) {
				return expensiveOperation("my_key")
			})
			if err == nil {
				fmt.Printf("Goroutine %d got result: %v\n", i, val)
			}
		}(i)
	}
	time.Sleep(3 * time.Second) // Wait for all goroutines to finish
}
```

이 예에서 여러 고루틴은 동일한 "expensiveOperation"을 요청한다. `singleflight`를 사용하면 해당 작업은 한 번만 실행되고 결과는 모든 호출자 간에 공유된다.

---

## 고려 사항 및 모범 사례

- 오류 처리: 공유 함수 호출로 인해 오류가 발생하는 시나리오를 애플리케이션이 올바르게 처리하는지 확인한다.
- 키 관리: 효율성은 `singleflight`고유한 작업을 나타내는 키를 적절히 식별하고 차별화하는 데 달려 있다.
- 모니터링: 호출에 대한 적절한 로깅 및 모니터링을 구현하여 `singleflight`애플리케이션에서의 호출 영향과 동작을 파악한다.

---

## 고급 예제

Go에서 이 패키지를 사용하는 고급 예제는 `singleflight`외부 API 또는 데이터베이스에서 데이터를 가져오는 실제 시나리오를 포함한다. 이 예제에서는 가상의 날씨 서비스에 대한 캐싱 계층을 생성한다. 이 서비스는 특정 도시의 날씨 데이터를 가져옵니다. 같은 도시에 대한 여러 요청이 동시에 발생하는 경우, `singleflight`외부 서비스에 대한 요청은 하나만 전송되고 결과는 모든 호출자에게 공유된다.

```go
package main

import (
	"fmt"
	"golang.org/x/sync/singleflight"
	"net/http"
	"io/ioutil"
	"time"
	"sync"
)

// A struct to hold the singleflight group and a cache.
type WeatherService struct {
	requestGroup singleflight.Group
	cache        sync.Map
}

// Function to simulate fetching weather data from an external service.
func (w *WeatherService) fetchWeatherData(city string) (string, error) {
	resp, err := http.Get("http://example.com/weather/" + city)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	return string(body), nil
}

// Function to get weather data with caching and singleflight control.
func (w *WeatherService) GetWeather(city string) (string, error) {
	// First, check if the data is already in the cache.
	if data, ok := w.cache.Load(city); ok {
		return data.(string), nil
	}

	// If not, use singleflight to ensure only one fetch is happening for the same city.
	data, err, _ := w.requestGroup.Do(city, func() (interface{}, error) {
		// Fetch the data.
		result, err := w.fetchWeatherData(city)
		if err == nil {
			// Store the result in the cache.
			w.cache.Store(city, result)
		}
		return result, err
	})

	if err != nil {
		return "", err
	}
	return data.(string), nil
}

func main() {
	service := &WeatherService{}

	// Simulate multiple concurrent requests for the same city.
	for i := 0; i < 10; i++ {
		go func(i int) {
			weather, err := service.GetWeather("NewYork")
			if err == nil {
				fmt.Printf("Goroutine %d got weather data: %s\n", i, weather)
			} else {
				fmt.Printf("Goroutine %d encountered an error: %s\n", i, err)
			}
		}(i)
	}
	time.Sleep(5 * time.Second) // Wait for all goroutines to finish.
}
```

이 고급 예제에서는:

- 외부 API에서 데이터를 가져오는 날씨 서비스를 시뮬레이션한다.
- 구조체  `WeatherService`는 `singleflight.Group`와 `sync.Map`로 구현된 캐시를 보유한다.
- `GetWeather`메서드는 먼저 캐시에서 기존 데이터를 확인한다. 데이터가 없으면 `singleflight`동일한 도시에 대해 외부 서비스에 대한 요청이 하나만 이루어지도록 한다.
- 여러 개의 고루틴이 같은 도시의 날씨 데이터에 대한 동시 요청을 시뮬레이션한다.

`singleflight`이 고급 예제는 웹 서비스 및 마이크로서비스 아키텍처에서 흔하고 실용적인 시나리오인 중복된 외부 API 호출을 방지하는 방법을 보여준다 . 또한 캐싱을 추가하여 성능을 더욱 최적화하고 불필요한 작업을 줄인다.

---

## 자바에서는?

자바에서는 Go처럼 공식적으로 지원하는 내장된 singleflight 기능은 없다. 따라서 직접 ConcurrentHashMap과 CompletableFuture로 구현해볼 수 있다. 

```java
import java.util.concurrent.*;
import java.util.function.Supplier;

public class SingleFlight<T> {
    private final ConcurrentHashMap<String, CompletableFuture<T>> inFlight = new ConcurrentHashMap<>();

    public T doCall(String key, Supplier<T> task) throws ExecutionException, InterruptedException {
        CompletableFuture<T> future = inFlight.computeIfAbsent(key, k -> {
            CompletableFuture<T> f = new CompletableFuture<>();
            CompletableFuture.runAsync(() -> {
                try {
                    T result = task.get();
                    f.complete(result);
                } catch (Exception e) {
                    f.completeExceptionally(e);
                } finally {
                    inFlight.remove(k); // Remove after completion
                }
            });
            return f;
        });

        return future.get();  // Wait for result
    }
}
```

위와 같이 ConcurrentHashMap을 여러 개의 작업을 담아둔다. (Go singleflight의 Group 역할) 그리고 CompletableFuture로 key가 없을때만 실행하므로 최초로 실행 완료한 스레드가 finally문에서 key를 제거한다. 그리고 다른 스레드들은 동일한 key가 이미 존재하므로 CompletableFuture의 결과를 바로 리턴받아서 공유하게 된다.

```java
public class Main {
    public static void main(String[] args) {
        SingleFlight<String> singleFlight = new SingleFlight<>();

        ExecutorService executor = Executors.newFixedThreadPool(5);

        // 여러 스레드가 동시에 같은 키로 호출
        for (int i = 0; i < 5; i++) {
            int id = i;
            executor.submit(() -> {
                try {
                    String result = singleFlight.doCall("myKey", () -> {
                        System.out.println("실제 작업 실행 by thread-" + id);
                        try {
                            Thread.sleep(1000);  // 비용이 큰 작업 시뮬레이션
                        } catch (InterruptedException e) {
                            e.printStackTrace();
                        }
                        return "결과 from thread-" + id;
                    });

                    System.out.println("Thread-" + id + " result: " + result);
                } catch (Exception e) {
                    e.printStackTrace();
                }
            });
        }

        executor.shutdown();
    }
}
```

실제로 Main 클래스를 실행해보면 다음과 같이 출력된다.

```
실제 작업 실행 by thread-0
Thread-2 result: 결과 from thread-0
Thread-3 result: 결과 from thread-0
Thread-4 result: 결과 from thread-0
Thread-1 result: 결과 from thread-0
Thread-0 result: 결과 from thread-0
```

즉, 실제 작업은 한 번만(thread-0) 수행되고, 나머지 스레드는 해당 결과를 공유한다.

---

## 참고자료

- [Understanding Singleflight in Go: A Solution for Eliminating Redundant Work](https://www.codingexplorations.com/blog/understanding-singleflight-in-golang-a-solution-for-eliminating-redundant-work)
- [Go Singleflight Melts in Your Code, Not in Your DB](https://victoriametrics.com/blog/go-singleflight/?utm_source=chatgpt.com)
- [Singleflight in Go : A Clean Solution to Cache Stampede](https://medium.com/pickme-engineering-blog/singleflight-in-go-a-clean-solution-to-cache-stampede-02acaf5818e3)
- [singleflight](https://pkg.go.dev/golang.org/x/sync/singleflight)
- [동시성 패턴: Fail-fast와 Single Flight 패턴 비교](https://dataportal.kr/동시성-패턴-Fail-fast와-Single-Flight-패턴-비교/)