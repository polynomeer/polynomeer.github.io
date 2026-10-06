---
title: "programmers. 직사각형 만들기"
date: 2020-04-08
categories: [ProblemSolving, Programmers]
tags: [Programmers, Implementation, Math]
---

## 1. 문제 요약

축에 평행한 직사각형의 네 꼭짓점 중 세 점의 좌표가 `[x, y]` 배열로 주어질 때, 남은 한 점의 좌표를 `[x, y]`로 돌려주는 함수를 작성한다. 좌표는 1 이상 10억 이하의 자연수이고, 항상 직사각형을 만들 수 있는 입력만 주어진다.

<br><hr/>

## 2. 문제 해석

직사각형을 그리기 위해서는 주어진 세 점에서 나머지 한 점을 어떻게 얻어낼 수 있는지 생각해보아야 한다. 예를 들어, (1,4),(3,10),(3,4)가 있다면 나머지 한 점은 (1,10)이다. (1,~~4~~)는 (3,~~4~~)와 y좌표가 같다. (~~3~~,10)은 (~~3~~,~~4~~)와 x좌표가 같다.
그러면 짝이 없는 x좌표 1과 y좌표 1이 각각 나머지 한점의 좌표가 된다. 

이를 통해, 직사각형에서 각 점의 x,y좌표는 반드시 다른 점의 x,y좌표와 같으며, 나머지 한점은 세 점의 x좌표와 y좌표 중에서 짝이 없는 것이다.

## 3. 문제 풀이

이 문제를 풀기 위해서는 모든 경우를 나누어보고 그대로 if문으로 구현하면 된다. 만약 v[0][0]과v[1][0]이 같다면 x좌표가 같다는 뜻이므로 나머지 한 점인 v[2][0]의 x좌표가 나머지 한점의 x좌표와 같다. 이렇게 쭉 나열하면 코드는 다음과 같다.

```cpp
#include <vector>
using namespace std;

vector<int> solution(vector<vector<int> > v) {
    vector<int> ans;
    ans.assign(2,0); // ans[0] : x, ans[1]: y
    
	if (v[0][0] == v[1][0]) ans[0] = v[2][0];
	else if (v[0][0] == v[2][0]) ans[0] = v[1][0];
	else if (v[1][0] == v[2][0]) ans[0] = v[0][0];

	if (v[0][1] == v[1][1])  ans[1] = v[2][1];
	else if (v[0][1] == v[2][1]) ans[1] = v[1][0];
	else if (v[1][1] == v[2][1]) ans[1] = v[0][0];

    return ans;
}
```

```java
class Solution {
    public int[] solution(int[][] v) {
        int[] answer = new int[2];
        
        if(v[0][0] == v[1][0]) answer[0] = v[2][0];
        else if(v[0][0] == v[2][0]) answer[0] = v[1][0];
        else if(v[1][0] == v[2][0]) answer[0] = v[0][0];
        
        if(v[0][1] == v[1][1]) answer[1] = v[2][1];
        else if(v[0][1] == v[2][1]) answer[1] = v[1][1];
        else if(v[1][1] == v[2][1]) answer[1] = v[0][1];
        
        return answer;
    }
}
```
