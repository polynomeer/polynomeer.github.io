---
layout: page
title: 출처
title_key: sources
hero_title: true
icon: fas fa-quote-left
order: 5
group: evidence
permalink: /sources/
---

{% include lang.html %}

{% assign c_ko = site.data.locales['ko-KR'].citation %}
{% assign c_en = site.data.locales.en.citation %}

{% include page-hero.html
  lang=lang
  eyebrow_ko=c_ko.eyebrow eyebrow_en=c_en.eyebrow
  title_ko=c_ko.index_title title_en=c_en.index_title
  summary_ko=c_ko.index_description summary_en=c_en.index_description %}

{% include sources-index.html lang=lang %}
