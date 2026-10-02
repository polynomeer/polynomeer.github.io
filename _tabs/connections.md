---
layout: page
title: 연결 지도
title_key: connections
hero_title: true
icon: fas fa-circle-nodes
order: 6
group: evidence
permalink: /connections/
---

{% include lang.html %}

{% assign c_ko = site.data.locales['ko-KR'].connection_map %}
{% assign c_en = site.data.locales.en.connection_map %}

{% include page-hero.html
  lang=lang
  eyebrow_ko=c_ko.eyebrow eyebrow_en=c_en.eyebrow
  title_ko=c_ko.title title_en=c_en.title
  summary_ko=c_ko.summary summary_en=c_en.summary %}

{% include connection-map.html lang=lang %}
