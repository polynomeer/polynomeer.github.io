---
title: "순열(Permutation)"
date: 2020-04-20
categories: [Notes, Programming]
tags: [Algorithm, Permutation, Brute Force]
---

순열은 임의의 수열을 서로 다른 순서로 섞는 것이다. 순열은 브루트 포스 문제를 풀어야 하는데 순서가 매우 중요한 의미를 가질 때 사용할 수 있다. 예를 들어, 123과 132가 서도 다른 의미를 가지는 경우가 그렇다. N개의 수에 대한 순열을 사전순으로 나열하면 총 N!개가 나온다. 숫자로만 이루어진 4자리 비밀번호를 찾는 다면 0000에서부터 9999까지 0 1 2 ... 9999 까지 나열하면 될 것이다.

• 임의의 수열을 다른 순서로 섞는 연산
• A=[1,5,6]인 경우[1,5,6],[1,6,5],[5,1,6],[5,6,1],[6,1,5],[6,1,6]이 순열이다.

• 크기가N인수열의서로다른순열은총N!개가있다. 
• 모든순열을사전순으로나열했을때
• A=[1,2,3]인경우사전순은다음과같다
• 123 132 213 231 312 321

## 다음 순열(Next Permutation)

모든 순열을 찾기 위해서는 우선 첫 순열과 마지막 순열을 찾고 첫 순열에서 마지막 순열이 나올때 까지 다음 순열, 다음 순열, 다음 순열, ... 마지막 순열까지 반복하면 모든 순열을 만들 수 있다. C++과 Python은 이미 라이브러리에 구현되어있지만 JAVA는 직접 구현해야한다.

• 사전순으로다음에오는순열과이전에오는순열을찾는방법
• C++ STL의 algorithm에서 next_permutation과 prev_permutation이 구현

예를 들어, N = 4 이면, A[1,2,3,4] -> ... -> A[4,3,2,1]
만들 수 있는 순열의 수는 N! = 24이고 그 수를 나열하면 다음과 같다.

1234 1243 1324 1342 1423 1432 
2134 2143 2314 2341 2413 2341 2413 2431 ...

순열을 첫 순열부터 차례대로 만들어 간다고 하면 **모든 순열은 그 앞의 어떤수로 시작하는 마지막순열** 이 된다. 그리고 **그 다음순열은 그 다음의 어떤수로 시작하는 첫순열** 이 된다.

![](https://images.velog.io/images/polynomeer/post/d408f956-c4a2-4bdf-bccc-b3c3bd126c5e/%E1%84%89%E1%85%AE%E1%86%AB%E1%84%8B%E1%85%A7%E1%86%AF.png)


첫 순열: 오름차순, 마지막 순열 : 내림차순

> **1. `A[i-1] < A[i]`를 만족하는 가장 큰 i를 찾는다. -> N
 2. `j≥i`이면서 `A[j] > A[i-1]`를 만족하는 가장 큰 j를 찾는다. -> N 
 3. `A[i-1]`과 `A[j]`를 swap한다. -> 1
 4. `A[i]`부터 순열을 뒤집는다. -> N **

이 과정을 반복하는 시간복잡도는 O(N)이다.

`A=[7,2,3,6,5,4,1]` 로 구성된 순열에서 위 과정을 살펴보면 다음과 같다.


1.
• 순열 : 7 2 3 6 5 4 1
• `A[i-1] < A[i]`를 만족하는 가장 큰 i를 찾는다. -> `A[4] = 6`
• 즉, 순열의 마지막 수에서 끝나는 가장 긴 감소수열을 찾아야한다.
• 순열 : 7 2 3 **6 5 4 1**

7 2 3 **6** 5 4 1
 < < < > > >

맨뒤에서 앞으로, 1부터 인접한 수를 하나씩 비교하면 6에서 앞의 3보다 크기때문에 감소수열이 끝난다. 따라서 6이 위치한 3번 인덱스가 i가 된다.
총 N개를 비교하므로 복잡도는 O(N)
`723으로 시작하는 마지막 순열` 다음에는 -> `72?로 시작하는 첫순열` 이 온다.

2.
• 순열 : 7 2 **`3`** 6 5 4 1
• `j≥i`이면서 `A[j] > A[i-1]`를 만족하는 가장 큰 j를 찾는다. 
• 순열 : 7 2 **`3`** 6 5 **`4`** 1

1번에서 찾은 감소수열이 끝나는 지점(i)에서 부터 뒤로 탐색하면서 `A[i-1]`보다는 크면서 그 중에서 맨뒤에 있는 `A[j]`를 찾는다. 이 예시에서는 4가 3보다 크면서 맨 뒤에 있으므로 `A[j] = 4`가 된다.

3.
• 순열 : 7 2 **`3`** 6 5 **`4`** 1
• `A[i-1]과 A[j]`를 swap한다 
• 순열 : 7 2 **`4`** 6 5 **`3`** 1

4와 3을 swap하면 7 2 4로 시작하는 첫 순열이 시작된다. 그런데 뒷부분이 6 5 3 1로 내림차순이다. 이 순열은 7 2 4로 시작하는 마지막 순열이 된다. 이것을 첫순열로 바꾸어 주기 위해서는 뒷부분을 뒤집으면 된다.

4.
• 순열 : 7 2 **`4`** 6 5 **`3`** 1
• `A[i]`부터 순열을 뒤집는다 
• 순열 : 7 2 **`4`** 1 3 5 6

뒤집으면 7 2 4로 시작하는 첫 순열이 완성된다. 이렇게 하나씩 반복하면서 다음 순열을 N!번 구하게 되면 최종적으로 모든 순열을 구할 수 있게된다. 다음 순열을 구하는 함수의 코드는 아래와 같다.

```cpp
bool next_permutation(int *a, int n) { 
    int i = n-1;
    while (i > 0 && a[i-1] >= a[i]) i -= 1; // 1. A[i-1]<A[i]를 만족하는 가장 큰 i를 찾는다.
    if (i <= 0) return false; // i가 0까지 갔다면 모두 내림차순이므로 마지막 순열 
    int j = n-1; // 2. j≥i이면서 A[j] > A[i-1]를 만족하는 가장 큰 j를 찾는다. 

    while (a[j] <= a[i-1]) j -= 1; 
    swap(a[i-1], a[j]); // 3. A[i-1]과 A[j]를 swap한다.

    j = n-1; // 4. A[i]부터 순열을 뒤집는다.
    while (i < j) {
        swap(a[i], a[j]);
        i += 1; j -= 1; 
    }
        return true;
}
```

다음 순열을 구하는 시간복잡도는 O(N)이다. 전체 순열을 모두 구하는 시간복잡도는 이 과정을 N!번 반복하므로 O(N!×N)이다.

## BOJ 10972. 다음 순열

- 문제링크 : https://www.acmicpc.net/problem/10972

> 1부터 N까지의 수로 이루어진 순열이 있다. 이때, 사전순으로 다음에 오는 순열을 구하는 프로그램을 작성하시오.
>
사전 순으로 가장 앞서는 순열은 **오름차순**으로 이루어진 순열이고, 가장 마지막에 오는 순열은 **내림차순**으로 이루어진 순열이다.
>
N = 3인 경우에 사전순으로 순열을 나열하면 다음과 같다.
>
1, 2, 3
1, 3, 2
2, 1, 3
2, 3, 1
3, 1, 2
3, 2, 1

### next_permutation 직접 구현

```cpp
#include <iostream>
#include <vector>
using namespace std;

bool next_permutation(vector<int> &a, int n) {
    int i = n-1;
    while (i > 0 && a[i-1] >= a[i]) i -= 1; // 1. A[i-1]<A[i]를 만족하는 가장 큰 i를 찾는다.
    if (i <= 0) return false; // 마지막 순열
    int j = n-1; // 2. j≥i이면서 A[j] > A[i-1]를 만족하는 가장 큰 j를 찾는다.
    while (a[j] <= a[i-1]) j -= 1;
    swap(a[i-1], a[j]); // 3. A[i-1]과 A[j]를 swap한다.
    j = n-1; // 4. A[i]부터 순열을 뒤집는다.
    while (i < j) {
        swap(a[i], a[j]);
        i += 1; j -= 1;
    }
    return true;
}

int main() {
    int n;
    cin >> n;
    vector<int> a(n);
    for (int i=0; i<n; i++) cin >> a[i];
    if (next_permutation(a,n)) { // 다음 순열이 있다면 출력
        for (int i=0; i<n; i++) cout << a[i] << ' ';
    } else { // 다음 순열이 없다면 -1 출력
        cout << "-1";
    }
    cout << '\n';
    return 0;
}
```

### 라이브러리 사용

```cpp
#include <iostream>
#include <algorithm> // next_permutation
#include <vector>
using namespace std;

int main() {
    int n;
    cin >> n;
    vector<int> a(n);
    for (int i=0; i<n; i++) cin >> a[i];
    if (next_permutation(a.begin(),a.end())) {
        for (int i=0; i<n; i++) cout << a[i] << ' ';
    } else {
        cout << "-1";
    }
    cout << '\n';
    return 0;
}
```

## BOJ 10973. 이전 순열

- 문제링크 : https://www.acmicpc.net/problem/10973

>1부터 N까지의 수로 이루어진 순열이 있다. 이때, 사전순으로 바로 이전에 오는 순열을 구하는 프로그램을 작성하시오.
>
사전 순으로 가장 앞서는 순열은 **오름차순**으로 이루어진 순열이고, 가장 마지막에 오는 순열은 **내림차순**으로 이루어진 순열이다.
>
N = 3인 경우에 사전순으로 순열을 나열하면 다음과 같다.
>
1, 2, 3
1, 3, 2
2, 1, 3
2, 3, 1
3, 1, 2
3, 2, 1

다음 순열을 구하는 과정은 다음과 같다.

1. `A[i-1]<A[i]`를 만족하는 가장 큰 i를 찾는다.
2. `j≥i`이면서 `A[j]<A[i-1]`를 만족하는 가장 큰 `j`를 찾는다.
3. `A[i-1]`과 `A[j]`를 swap한다.
4. `A[i]`부터 순열을 뒤집는다.
 
이전 순열을 구하는 것은 다음 순열을 구하는 것에서 부등호만 바꾸어 주면 된다. 

1. **`A[i-1]>A[i]`**를 만족하는 가장 큰 `i`를 찾는다.
2. `j≥i`이면서 **`A[j]>A[i-1]`**를 만족하는 가장 큰 `j`를 찾는다.
3. `A[i-1]`과 `A[j]`를 swap한다.
4. `A[i]`부터 순열을 뒤집는다.

7 2 3 6 5 4 1 이 주어졌다면 
1. 끝에서 부터 검사하는데 4 > 1 이므로 i는 그대로 6이다.
2. 끝에서 부터 검사하면 A[6]이 A[5]보다 작기 때문에 j는 6이다.
3. A[6]과 A[5]를 swap한다. -> 1과 4가 바뀐다.
4. `7 2 3 6 5 1 4` 인 상태에서 i==j이므로 그대로 끝난다.  


### prev_permutation 직접 구현

```cpp
#include <iostream>
#include <vector>
using namespace std;

bool prev_permutation(vector<int> &a, int n) {
    int i = n-1;
    while (i > 0 && a[i-1] <= a[i]) i -= 1; // 1. A[i-1]>A[i]를 만족하는 가장 큰 i를 찾는다.
    if (i <= 0) return false; // 마지막 순열
    
    int j = n-1; // 2. j≥i이면서 A[j] > A[i-1]를 만족하는 가장 큰 j를 찾는다.
    while (a[j] >= a[i-1]) j -= 1;
    
    swap(a[i-1], a[j]); // 3. A[i-1]과 A[j]를 swap한다.
    
    j = n-1; // 4. A[i]부터 순열을 뒤집는다.
    while (i < j) {
        swap(a[i], a[j]);
        i += 1; j -= 1;
    }
    return true;
}

int main() {
    int n;
    cin >> n;
    vector<int> a(n);
    for (int i=0; i<n; i++) cin >> a[i];
    if (prev_permutation(a,n)) {
        for (int i=0; i<n; i++) 
        	cout << a[i] << ' ';
    } else {
        cout << "-1";
    }
    cout << '\n';
    return 0;
}

```

### 라이브러리 사용

```cpp
#include <iostream>
#include <algorithm>
#include <vector>
using namespace std;

int main() {
    int n;
    cin >> n;
    vector<int> a(n);
    for (int i=0; i<n; i++) cin >> a[i];
    if (prev_permutation(a.begin(),a.end())) {
        for (int i=0; i<n; i++) 
        	cout << a[i] << ' ';
    } else {
        cout << "-1";
    }
    cout << '\n';
    return 0;
}
```

## BOJ 10974. 모든 순열
- 문제링크 : https://www.acmicpc.net/problem/10974

> N이 주어졌을 때, 1부터 N까지의 수로 이루어진 순열을 사전순으로 출력하는 프로그램을 작성하시오.

모든 순열을 출력하기 위해서는 do ~ while문으로 첫 순열부터 마지막 순열까지 빠짐없이 출력할 수 있다.

```cpp
#include <iostream>
#include <algorithm>
#include <vector>
using namespace std;
int main() {
    int n;
    cin >> n;
    vector<int> a(n);
    for (int i=0; i<n; i++) {
        a[i] = i+1;
    }
    do {
        for (int i=0; i<n; i++) {
            cout << a[i] << ' ';
        }
        cout << '\n';
    } while (next_permutation(a.begin(), a.end()));
    return 0;
}
```
