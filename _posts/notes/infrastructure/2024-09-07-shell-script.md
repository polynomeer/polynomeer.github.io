---
title: Shell Script
date: 2024-09-05
categories: [Notes, Infrastructure]
tags: [Linux, Shell Script]
---

# Shell Script

## 쉘 스크립트

리눅스나 유닉스에서 커맨드라인 인터프리터에 의해 실행되는 프로그램이다.

터미널에서 한 줄씩 입력하던 명령을 파일에 모아 두고 한 번에 실행하는 것이라고 보면 된다. 서버 초기 설정, 배포, 로그 정리, 백업처럼 반복되는 운영 작업을 자동화할 때 가장 먼저 꺼내는 도구다. 쉘에는 sh(Bourne shell), bash, zsh 등이 있는데, 이 글은 리눅스 서버에서 가장 흔한 bash를 기준으로 정리한다.

쉘 스크립트의 첫 줄에는 샤뱅(`#!`)을 적고, 사용하고자하는 쉘을 적어준다. 예를 들어, 배시(Bash, Bourne Again SHell)를 사용하는 경우 다음과 같이 적는다. `#!/bin/bash`

샤뱅은 커널이 이 파일을 어떤 인터프리터로 실행할지 알려 주는 줄이다. 실행 방법은 두 가지다.

```sh
chmod +x hello.sh   # 실행 권한 부여
./hello.sh          # 샤뱅에 적힌 인터프리터로 실행

bash hello.sh       # 인터프리터를 직접 지정해 실행 (샤뱅 무시)
```

bash의 위치가 시스템마다 다를 수 있으므로 `#!/usr/bin/env bash`처럼 `PATH`에서 bash를 찾게 하는 방식도 자주 쓴다.

## 변수

변수 선언은 "=" 사용, 공백은 없어야한다.

```sh
name="hero"
age=30

echo ${hero}
echo $age
```

위 예제의 `echo ${hero}`는 `echo ${name}`의 오타다. `hero`라는 변수는 선언된 적이 없으므로 빈 문자열이 출력된다. bash는 선언하지 않은 변수를 참조해도 오류를 내지 않기 때문에 이런 실수를 알아차리기 어렵다. 아래에서 다룰 `set -u`를 켜면 이런 참조를 오류로 잡을 수 있다.

`=` 양옆에 공백이 있으면 안 되는 이유는 `name = "hero"`라고 쓰면 bash가 이를 `name`이라는 명령에 `=`와 `hero`를 인자로 넘긴 것으로 해석하기 때문이다.

변수를 쓸 때는 큰따옴표로 감싸는 습관이 중요하다. 따옴표가 없으면 값에 공백이 있을 때 여러 단어로 쪼개지고, `*` 같은 글자는 파일 이름으로 확장된다.

```sh
file="my report.txt"
rm $file      # rm my report.txt  → "my"와 "report.txt" 두 파일을 지우려 함
rm "$file"    # rm "my report.txt" → 의도한 한 파일
```

`${name}` 형태는 변수 이름의 경계를 분명히 할 때 쓴다(`"${name}_backup"`). 작은따옴표 안에서는 변수가 확장되지 않는다. 명령의 실행 결과를 변수에 담을 때는 `$(...)`를 쓴다.

```sh
today=$(date +%Y-%m-%d)
echo "오늘은 ${today}"
echo '오늘은 ${today}'   # 그대로 출력됨
```

### 특별한 변수

- $0 -> 배시 스크립트의 이름
- $1 ~ $9 -> 9개의 스크립트 인자값
- $# -> 몇 개의 인자가 전달되었는지
- $@ -> 모든 인자값
- $? -> 실행 결과가 정상인지
- $$ -> 현재 스크립트의 PID

- $USER -> 스크립트를 실행하는 사용자명
- $HOSTNAME -> 스크립트를 실행하는 호스트명
- $RANDOM -> 랜덤 숫자를 리턴

bash 매뉴얼을 기준으로 몇 가지를 보충한다.

- `$1`부터 `$9`까지만 있는 것이 아니라, 열 번째 인자부터는 `${10}`처럼 중괄호로 감싸서 쓴다.
- `$?`는 가장 최근에 실행한 포그라운드 파이프라인의 종료 상태다. 관례적으로 0이 성공이고 0이 아니면 실패다.
- `$@`와 `$*`는 모두 전체 인자로 확장되지만, 큰따옴표 안에서 다르게 동작한다. `"$@"`는 인자 하나하나를 별도의 단어로 유지하고, `"$*"`는 전부 이어 붙인 한 단어가 된다. 인자를 다른 명령에 그대로 넘길 때는 `"$@"`를 쓴다.
- `$!`는 가장 최근에 백그라운드로 실행한 명령의 PID다.
- `$RANDOM`은 참조할 때마다 0부터 32767 사이의 정수를 만든다.
- `$HOSTNAME`은 bash가 설정하는 변수지만, `$USER`는 bash가 아니라 로그인 과정에서 설정되는 환경 변수다. cron처럼 로그인 세션이 아닌 환경에서는 비어 있을 수 있으므로, 확실하게 사용자 이름이 필요하면 `$(whoami)`나 `$(id -un)`을 쓴다.

```sh
#!/bin/bash
echo "스크립트: $0, 인자 수: $#"
for arg in "$@"; do
    echo "인자: $arg"
done
```

### 값이나 문자를 읽기

```sh
read var1 # var1으로 값을 읽음
read -n3 var1 # 문자 3개만 입력받아서 var1에 저장
read -p "input data: " var1 # 문자열 출력하면서 var1값을 읽음
```

`read`에는 `-r` 옵션을 함께 주는 것이 좋다. `-r`이 없으면 입력의 백슬래시가 이스케이프 문자로 해석되어 사라진다. 비밀번호처럼 화면에 보이면 안 되는 입력은 `-s`로 받는다. 파일을 한 줄씩 읽을 때도 `read`를 쓰는데, 이는 아래 반복문에서 다룬다.

## if 조건문

```sh
if [<some test>]
then
    <commands>
fi
```

```sh
```

위 형식에서 실제로 쓸 때 주의할 점은 `[`와 `]` 양쪽의 공백이다. `[`는 문법 기호가 아니라 `test`라는 명령의 다른 이름이고, `]`는 그 명령의 마지막 인자다. 그래서 `[$a -gt 1]`처럼 붙여 쓰면 `[$a`라는 명령을 찾다가 실패한다. 반드시 `[ "$a" -gt 1 ]`처럼 띄어 써야 한다. `then`을 같은 줄에 쓰려면 앞에 `;`를 붙인다.

```sh
#!/bin/bash
count=$1

if [ "$count" -gt 100 ]; then
    echo "많음"
elif [ "$count" -gt 10 ]; then
    echo "보통"
else
    echo "적음"
fi
```

자주 쓰는 비교 연산자는 다음과 같다. 숫자와 문자열의 비교 연산자가 다르다는 점에 주의한다.

| 구분 | 연산자 | 의미 |
| --- | --- | --- |
| 숫자 | `-eq`, `-ne` | 같다, 다르다 |
| 숫자 | `-lt`, `-le`, `-gt`, `-ge` | 작다, 작거나 같다, 크다, 크거나 같다 |
| 문자열 | `=`, `!=` | 같다, 다르다 |
| 문자열 | `-z`, `-n` | 길이가 0이다, 0이 아니다 |
| 파일 | `-e`, `-f`, `-d` | 존재한다, 일반 파일이다, 디렉터리다 |
| 파일 | `-r`, `-w`, `-x` | 읽기, 쓰기, 실행 권한이 있다 |

bash에는 `[[ ... ]]`라는 확장 조건식도 있다. 안에서 변수가 단어 분리되지 않아 따옴표 실수에 덜 민감하고, `&&`, `||`, 패턴 매칭(`==`의 와일드카드), 정규식 매칭(`=~`)을 쓸 수 있다. 다만 POSIX sh에는 없으므로 샤뱅이 `#!/bin/sh`인 스크립트에서는 쓰면 안 된다.

```sh
if [[ -f "$file" && "$file" == *.log ]]; then
    echo "로그 파일"
fi
```

if는 사실 조건식이 아니라 명령의 종료 상태를 본다. 그래서 어떤 명령이든 조건으로 쓸 수 있다.

```sh
if grep -q "ERROR" app.log; then
    echo "에러가 있다"
fi
```

## case 문

하나의 값을 여러 패턴과 비교할 때는 if를 늘어놓는 것보다 case가 읽기 쉽다.

```sh
case "$1" in
    start)   echo "시작" ;;
    stop)    echo "중지" ;;
    restart) echo "재시작" ;;
    *)       echo "사용법: $0 {start|stop|restart}"; exit 1 ;;
esac
```

## 반복문

```sh
# 목록 순회
for server in web1 web2 web3; do
    echo "배포: $server"
done

# 숫자 범위
for i in {1..5}; do
    echo "$i"
done

# 조건 반복
count=0
while [ "$count" -lt 3 ]; do
    count=$((count + 1))
done
```

파일을 한 줄씩 읽는 관용구는 다음과 같다. `IFS=`는 줄 앞뒤의 공백이 잘리지 않게 하고, `-r`은 백슬래시를 그대로 둔다.

```sh
while IFS= read -r line; do
    echo "읽은 줄: $line"
done < input.txt
```

`cat input.txt | while read line`처럼 파이프로 넘기면 while 루프가 서브쉘에서 실행되어, 루프 안에서 바꾼 변수가 루프가 끝난 뒤 사라진다. 리다이렉션(`<`)으로 넘기는 위 형태를 쓰는 이유다. 산술 연산은 `$((...))`로 한다.

## 함수

```sh
backup() {
    local src="$1"
    local dest="$2"
    cp -r "$src" "$dest" || return 1
    echo "백업 완료: $dest"
}

backup /etc/nginx "/backup/nginx-$(date +%F)"
```

함수 안에서도 인자는 `$1`, `$2`로 받는다. 변수는 기본적으로 전역이므로 함수 안에서만 쓸 변수는 `local`로 선언한다. `return`은 값을 돌려주는 것이 아니라 종료 상태(0~255)를 정하는 것이고, 문자열 결과는 `echo`로 출력해 호출하는 쪽에서 `$(...)`로 받는다.

## 종료 상태와 안전한 스크립트

bash는 기본적으로 중간에 명령이 실패해도 다음 줄을 계속 실행한다. 디렉터리 이동에 실패했는데 다음 줄의 삭제 명령이 엉뚱한 위치에서 실행되는 식의 사고가 여기서 생긴다. 운영 스크립트의 맨 위에는 보통 다음 설정을 둔다.

```sh
#!/bin/bash
set -euo pipefail
```

- `-e`: 명령이 실패하면(종료 상태가 0이 아니면) 스크립트를 즉시 멈춘다.
- `-u`: 선언하지 않은 변수를 참조하면 오류로 멈춘다. 앞의 `${hero}` 같은 오타를 잡는다.
- `-o pipefail`: 파이프라인 중간 명령이 실패해도 파이프라인 전체를 실패로 본다. 이 옵션이 없으면 마지막 명령의 상태만 본다.

스크립트가 끝날 때는 `exit 0`이나 `exit 1`로 종료 상태를 명시해 두면, 이 스크립트를 호출하는 cron이나 CI가 성공 여부를 판단할 수 있다. 정리 작업이 필요하면 `trap 'rm -f "$tmpfile"' EXIT`처럼 종료 시 실행할 명령을 등록한다.

## cron으로 주기 실행

쉘 스크립트는 cron과 함께 쓰는 경우가 많다. cron은 정해진 시각에 명령을 실행하는 데몬이고, crontab은 사용자별 실행 일정을 담은 파일이자 그것을 편집하는 명령이다.

```sh
crontab -e   # 현재 사용자의 crontab 편집
crontab -l   # 등록된 일정 확인
```

```text
# 분 시 일 월 요일 명령
0 3 * * * /home/deploy/scripts/backup.sh >> /var/log/backup.log 2>&1
```

cron 환경은 로그인 쉘과 달리 `PATH`가 최소한으로 설정되어 있고 `.bashrc`도 읽지 않는다. 터미널에서는 잘 되던 스크립트가 cron에서 실패한다면 대부분 이 차이 때문이므로, 스크립트 안에서는 명령을 절대 경로로 쓰거나 `PATH`를 직접 설정하고, 출력은 로그 파일로 남겨 둔다.

## 자주 하는 실수

- `=` 양옆에 공백을 넣는다: `name = "hero"`는 대입이 아니다.
- `[ ]` 안쪽에 공백을 빼먹는다: `[$a -gt 1]`은 동작하지 않는다.
- 변수를 따옴표 없이 쓴다: 공백이 있는 값이나 빈 값에서 조건식과 명령이 깨진다.
- 숫자 비교에 `>`를 쓴다: `[ ]` 안에서 `>`는 리다이렉션으로 해석되어 파일이 생긴다. 숫자는 `-gt`를 쓴다.
- 실패를 무시한다: `set -e` 없이 `cd` 실패 후 다음 명령을 실행한다.

작성한 스크립트는 ShellCheck 같은 정적 분석 도구로 검사하면 위 실수 대부분을 미리 잡을 수 있다.

## References

- https://www.youtube.com/watch?v=RIKJVIcYNqE&list=PLYRfEO8DA8gikpkXw8wF8kJZDod2lFrML
- https://mug896.github.io/bash-shell/index.html
- https://blog.gaerae.com/2015/01/bash-hello-world.html
- https://wiki.kldp.org/HOWTO/html/Adv-Bash-Scr-HOWTO/index.html
- https://tldp.org/LDP/Bash-Beginners-Guide/html/
- http://man.he.net/man1/HEAD
- https://stackoverflow.com/questions/21789148/difference-between-cron-and-crontab
- https://jhnyang.tistory.com/68
- https://www.lesstif.com/lpt/bash-shell-script-programming-26083916.html
- https://stackoverflow.com/questions/10929453/read-a-file-line-by-line-assigning-the-value-to-a-variable
- https://mug896.github.io/bash-shell/readline.html#
- https://jdm.kr/blog/2
- [GNU Bash Reference Manual](https://www.gnu.org/software/bash/manual/bash.html)
