---
title: "너비 우선 탐색(BFS)"
date: 2020-03-30
categories: [Notes, Programming]
tags: [Algorithm, Graph, BFS, Queue]
---

너비 우선 탐색(breadth-first search, BFS)는 시작점에서 가까운 정점부터 순서대로 방문하는 탐색 알고리즘이다. 가까운 정점을 **모두** 저장해놓고 순서대로 방문해야 하므로, 스택 구조로는 구현이 어렵다. 따라서 **큐(Queue)** 자료구조를 사용한다. 

BFS의 동작은 큐를 이용해서 지금 위치에서 갈 수 있는 것을 모두 큐에 넣는 방식으로, 큐에 넣을 때 동시에 방문했다고 체크를 해야한다. (정확하게는 발견 여부를 체크한다.) DFS와는 달리 BFS에서는 발견과 방문이 동시에 이루어지지 않는다. 따라서 모든 정점은 다음과 같은 세 개의 상태를 순서대로 거쳐 가게 된다.

- 아직 발견되지 않은 상태
- 발견되었지만 아직 방문되지는 않은 상태 (이 상태의 정점들은 이미 큐에 저장됨)
- 방문된 상태

## 1. BFS 동작원리

![](https://images.velog.io/images/polynomeer/post/287a5949-1273-48c6-8d5e-41104d427a9d/BFS.gif)

위 그림은 1번 정점부터 시작해서 숫자가 작은 정점부터 차례대로 방문하는 BFS의 동작방식을 보여준다. 방문(발견) 여부를 표시하기 위해 check배열을 두고, 큐에 인접한 정점을 Push하면서 하나씩 방문해나간다. 이 진행과정을 나열하면 다음과 같다.

- 1번 정점을 큐에 넣고, check배열의 1번 값을 1로 바꾸고, 방문한다.
- 1번 정점과 인접한 2, 5번 정점을 큐에 넣고, check배열의 2, 5번 값을 1로 바꾼다.
- 2번 정점을 방문하고, 큐에서 1번 정점을 뺀다.
- 2번 정점과 인접한 3번 정점을 큐에 넣고, check배열의 3번 값을 1로 바꾼다.
- 5번 정점을 방문하고, 큐에서 2번 정점을 뺀다.
- 5번 정점과 인접한 4번 정점을 큐에 넣고, check배열의 4번 값을 1로 바꾼다.
- 3번 정점을 방문하고, 큐에서 5번 정점을 뺀다.
- 4번 정점을 방문하고, 큐에서 3번 정점을 뺀다.
- 4번 정점과 인접한 6번 정점을 큐에 넣고, check배열의 6번 값을 1로 바꾼다.
- 6번 정점을 방문하고, 큐에서 4번 정점을 뺀다.
- 6번 정점과 인접하면서 방문하지 않은 정점이 없으므로, 6번 정점을 큐에서 빼고 탐색을 종료한다.

<br><hr />

## 2. BFS 구현

DFS는 스택을 사용하는 재귀함수의 특성을 이용하여 재귀로 구현이 가능했지만, BFS는 큐를 사용하여 구현해야 한다. C++과 JAVA에서는 queue 라이브러리를 사용하면 된다.

### 인접 행렬을 이용한 BFS 구현
```cpp
queue<int> q;
check[1] = true; q.push(1);
while (!q.empty()) {
  int x = q.front(); q.pop();
  for (int i=1; i<=n; i++) {
    if (a[x][i] == 1 && check[i] == false) { // 연결여부와 방문여부를 확인
      check[i] = true;	// 방문했다고 표시(발견)
      q.push(i);	// 큐에 넣음
    }
  }
}
```

### 인접 리스트를 이용한 BFS 구현
```cpp
queue<int> q;
check[1] = true; q.push(1);
while (!q.empty()) {
  int x = q.front(); q.pop();
  for (int i=0; i<a[x].size(); i++) {
    int y = a[x][i];
    if (check[y] == false) { // 방문여부만 확인
      check[y] = true; q.push(y); // 방문했다고 표시하고, 큐에 넣음
    }
  }
}
```

### 시간 복잡도

- 인접 행렬 : O(V^2)
- 인접 리스트 : O(V+E)

<br><hr />

## 3. BFS를 활용한 문제풀이

- BFS의 목적은 임의의 정점에서 시작해서, **모든 정점을 한번 씩** 방문하는 것이다.
- BFS는 **최단거리**를 구하는 알고리즘이다.
- BFS는 **모든 가중치가 1일때,** 최단거리를 구하는 알고리즘이다.

• BFS를 이용해 해결할 수 있는 문제는 아래와 같은 조건을 만족 해야한다.
	1) **최소 비용** 문제이어야 한다
	2) 간선의 **가중치가 1** 이어야 한다
	3) 정점과 간선의 개수가 적어야 한다.(적다는 것은 문제의 조건에 맞춰서 해결할 수 있다는 것을 의미한다)
• 간선의 가중치가 문제에서 구하라고 하는 최소비용과 의미가 일치 해야한다.
• 즉,거리의 최소값을 구하는 문제라면 가중치는 거리를 의미해야 하고, 시간의 최소값을 구하는 문제라면 가중치는 시간을 의미해야 한다.


### BOJ 1260. DFS와 BFS

- 문제링크 : https://www.acmicpc.net/problem/1260

> 그래프를 DFS로 탐색한 결과와 BFS로 탐색한 결과를 출력하는 프로그램을 작성하시오. 단, 방문할 수 있는 정점이 여러 개인 경우에는 정점 번호가 작은 것을 먼저 방문하고, 더 이상 방문할 수 있는 점이 없는 경우 종료한다. 정점 번호는 1번부터 N번까지이다.

#### 인접 리스트 기반의 구현

```cpp
#include <cstdio>
#include <algorithm>
#include <cstring>
#include <vector>
#include <queue>
using namespace std;

vector<int> a[1001];	// 인접 리스트
bool check[1001];	// 방문 여부 저장

void dfs(int node) {
    ...
}
void bfs(int start) {
    queue<int> q;
    memset(check,false,sizeof(check)); // check배열 초기화
    check[start] = true;	// 방문표시 하고
    q.push(start);		// 큐에 넣음
    while (!q.empty()) {
        int node = q.front();	// 큐에서 하나씩 빼면서
        q.pop();
        printf("%d ",node);	// 방문하고
        for (int i=0; i<a[node].size(); i++) {
            int next = a[node][i];
            if (check[next] == false) {
                check[next] = true;	// 미리 방문표시하고
                q.push(next);		// 큐에 넣음
            }
        }
    }
}
int main() {
    int n, m, start;	// 정점의 개수, 간선의 개수, 탐색 시작점
    scanf("%d %d %d",&n,&m,&start);
    for (int i=0; i<m; i++) {
        int u,v;
        scanf("%d %d",&u,&v);
        a[u].push_back(v);	// 양방향 그래프이므로
        a[v].push_back(u);	// 양쪽에 연결
    }
    for (int i=1; i<=n; i++) {	// 각 인접 리스트 요소를 오름차순 정렬
        sort(a[i].begin(), a[i].end());
    }
    dfs(start); puts("");
    bfs(start); puts("");
    return 0;
}
```
