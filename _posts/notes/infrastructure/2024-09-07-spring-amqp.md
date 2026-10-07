---
title: Spring AMQP
date: 2024-09-05
categories: [Notes, Infrastructure]
tags: [AMQP]
---

# Spring AMQP

- https://spring.io/projects/spring-amqp#overview
- https://preamtree.tistory.com/172

Spring AMQP는 AMQP 기반 메시징에 Spring의 핵심 개념을 적용한 프로젝트다. 프로젝트 소개 페이지는 메시지를 보내고 받는 고수준 추상화와 메시지 기반 POJO 지원을 제공한다고 설명한다. 두 번째 링크는 AMQP의 개념(생산자, 소비자, exchange, queue, binding)과 exchange 타입을 정리한 글이다. 이 개념 자체는 [RabbitMQ](/posts/rabbitmq/) 노트에 정리했으므로, 여기서는 Spring 쪽에서 무엇을 대신해 주는지를 중심으로 본다.

---

## 두 모듈

프로젝트는 두 부분으로 나뉜다.

- `spring-amqp`: 프로토콜에 독립적인 기본 추상화
- `spring-rabbit`: 그 추상화의 RabbitMQ 구현

프로젝트 페이지가 꼽는 주요 기능은 세 가지다. 들어오는 메시지를 비동기로 처리하는 리스너 컨테이너, 메시지를 보내고 받는 `RabbitTemplate`, 큐와 exchange와 바인딩을 자동으로 선언하는 `RabbitAdmin`이다. 구조는 Spring Framework의 JMS 지원과 비슷하다.

---

## Spring Boot에서 시작하기

Spring Boot는 `spring-boot-starter-amqp`가 있으면 연결 팩토리와 `RabbitTemplate`(`AmqpTemplate`), `AmqpAdmin`을 자동으로 구성한다. 연결 정보는 `spring.rabbitmq.*` 속성으로 준다([Spring Boot: AMQP](https://docs.spring.io/spring-boot/reference/messaging/amqp.html)).

```properties
spring.rabbitmq.host=localhost
spring.rabbitmq.port=5672
spring.rabbitmq.username=admin
spring.rabbitmq.password=secret
```

로컬에 브로커를 띄우는 방법은 [RabbitMQ Installation](/posts/rabbitmq-installation/)에 있다.

---

## 큐, exchange, 바인딩 선언

Boot 문서에 따르면 빈으로 정의한 `Queue`는 RabbitMQ에 해당 큐를 선언하는 데 자동으로 쓰인다. exchange와 바인딩도 같은 방식으로 빈으로 둔다.

```java
@Configuration
public class OrderMessagingConfig {

    @Bean
    public TopicExchange orderExchange() {
        return new TopicExchange("order.exchange");
    }

    @Bean
    public Queue orderCreatedQueue() {
        return new Queue("order.created.queue", true); // durable
    }

    @Bean
    public Binding orderCreatedBinding(Queue orderCreatedQueue, TopicExchange orderExchange) {
        return BindingBuilder.bind(orderCreatedQueue).to(orderExchange).with("order.created");
    }
}
```

애플리케이션이 브로커에 연결될 때 `RabbitAdmin`이 이 빈들을 찾아 선언한다. 이미 같은 설정으로 존재하면 그대로 두고, 이름은 같은데 속성이 다르면 브로커가 채널 수준 예외(406 `PRECONDITION_FAILED`)로 선언을 거부한다([RabbitMQ: Queues](https://www.rabbitmq.com/docs/queues)). 운영 중인 큐의 속성을 바꿔야 한다면 코드만 고쳐서는 안 되고 큐를 새로 만드는 절차가 필요하다.

---

## 보내기: RabbitTemplate

```java
@Service
public class OrderEventPublisher {

    private final RabbitTemplate rabbitTemplate;

    public OrderEventPublisher(RabbitTemplate rabbitTemplate) {
        this.rabbitTemplate = rabbitTemplate;
    }

    public void publishCreated(OrderCreatedEvent event) {
        rabbitTemplate.convertAndSend("order.exchange", "order.created", event);
    }
}
```

`convertAndSend(exchange, routingKey, object)`는 객체를 메시지로 바꿔 지정한 exchange로 보낸다([Spring AMQP: AmqpTemplate](https://docs.spring.io/spring-amqp/reference/amqp/template.html)). 객체를 메시지 바이트로 바꾸는 일은 `MessageConverter`가 맡는다. 기본값인 `SimpleMessageConverter`는 텍스트, 직렬화된 Java 객체, 바이트 배열을 다룬다. 문서는 Java 직렬화에 기대는 방식을 권하지 않는다([Message Converters](https://docs.spring.io/spring-amqp/reference/amqp/message-converters.html)). 다른 언어의 소비자도 읽을 수 있게 JSON으로 보내려면 `Jackson2JsonMessageConverter`를 빈으로 등록한다.

```java
@Bean
public MessageConverter messageConverter() {
    return new Jackson2JsonMessageConverter();
}
```

---

## 받기: @RabbitListener

```java
@Component
public class OrderCreatedListener {

    @RabbitListener(queues = "order.created.queue")
    public void handle(OrderCreatedEvent event) {
        // 주문 생성 후속 처리
    }
}
```

`@RabbitListener`를 붙이면 그 뒤에서 메시지 리스너 컨테이너가 만들어져 큐를 구독한다. 일반 Spring에서는 `@EnableRabbit`이 필요하지만 Spring Boot는 이를 자동 구성한다([Annotation-driven Listener Endpoints](https://docs.spring.io/spring-amqp/reference/amqp/receiving-messages/async-annotation-driven.html)). `@QueueBinding`을 쓰면 리스너 선언 안에서 큐, exchange, 바인딩을 함께 선언할 수도 있다.

---

## 리스너 컨테이너의 기본값

리스너 컨테이너가 대신 해 주는 일 중 꼭 알아야 할 두 가지 기본값이 있다([Message Listener Container Configuration](https://docs.spring.io/spring-amqp/reference/amqp/containerAttributes.html)).

- ack 모드는 `AUTO`가 기본이다. 리스너 메서드가 예외 없이 끝나면 컨테이너가 ack를 보내고, 예외를 던지면 ack하지 않는다. `MANUAL`로 바꾸면 리스너가 `Channel.basicAck()`를 직접 호출해야 하고, `NONE`은 브로커가 전달 즉시 ack된 것으로 보는 RabbitMQ의 autoack에 해당한다.
- prefetch는 2.0부터 250이 기본이다. 소비자 하나가 ack하지 않은 채 받아 둘 수 있는 메시지 수다.

---

## 예외가 나면 메시지는 어떻게 되는가

여기서 가장 많이 놓치는 부분이 있다. Spring Boot 문서는 재시도를 끄고 리스너가 예외를 던지면 그 메시지가 무한히 재전달된다고 적는다. 형식이 잘못된 메시지 하나가 큐 앞에서 계속 실패하며 소비자를 붙잡는 상황이 생길 수 있다.

같은 문서가 제시하는 대응은 다음과 같다.

- `spring.rabbitmq.listener.simple.retry.enabled=true`로 컨테이너 재시도를 켠다. 재시도가 소진되면 메시지는 거부되고, 브로커에 dead letter exchange가 설정돼 있으면 그곳으로, 아니면 버려진다.
- `defaultRequeueRejected`를 `false`로 두면 거부된 메시지를 다시 큐에 넣지 않는다. Boot 속성으로는 `spring.rabbitmq.listener.simple.default-requeue-rejected`다.
- 특정 예외에서만 재전달을 막고 싶다면 리스너에서 `AmqpRejectAndDontRequeueException`을 던진다.

버려지는 메시지가 없게 하려면 큐에 dead letter exchange를 설정해 두고, 그 큐를 따로 모니터링한다.

---

## 보낸 메시지가 도착했는지 확인하기

`convertAndSend`가 예외 없이 끝났다고 브로커가 메시지를 받았다는 뜻은 아니다. 확인이 필요하면 두 기능을 켠다.

- publisher confirm: 브로커가 메시지를 받았는지 비동기로 알려 준다. Boot 속성 `spring.rabbitmq.publisher-confirm-type=correlated`로 켜고, `RabbitTemplate.setConfirmCallback()`으로 결과를 받는다.
- publisher return: 메시지가 어떤 큐로도 라우팅되지 못했을 때 돌려받는다. `spring.rabbitmq.publisher-returns=true`와 함께 템플릿의 `mandatory`를 켜고 `setReturnsCallback()`을 등록한다. 돌아온 메시지에는 `NO_ROUTE` 같은 사유가 담긴다.

템플릿 하나에는 `ConfirmCallback`과 `ReturnsCallback`을 각각 하나씩만 등록할 수 있다.

## 참고

- [Spring AMQP](https://spring.io/projects/spring-amqp#overview) — spring.io
- [Spring AMQP 맛보기 - 1. AMQP 개념](https://preamtree.tistory.com/172) — Tistory: preamtree
- [AMQP](https://docs.spring.io/spring-boot/reference/messaging/amqp.html) — Spring Boot Reference
- [Using AmqpTemplate](https://docs.spring.io/spring-amqp/reference/amqp/template.html) — Spring AMQP Reference
- [Annotation-driven Listener Endpoints](https://docs.spring.io/spring-amqp/reference/amqp/receiving-messages/async-annotation-driven.html) — Spring AMQP Reference
- [Message Listener Container Configuration](https://docs.spring.io/spring-amqp/reference/amqp/containerAttributes.html) — Spring AMQP Reference
- [Message Converters](https://docs.spring.io/spring-amqp/reference/amqp/message-converters.html) — Spring AMQP Reference
- [Queues](https://www.rabbitmq.com/docs/queues) — RabbitMQ Documentation
