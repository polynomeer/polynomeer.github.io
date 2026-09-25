---
layout: page
title: 시작하기
title_key: start_here
hero_title: true
icon: fas fa-compass
order: 1
permalink: /start/
---

{% include lang.html %}

{% assign hero_ko = site.data.locales['ko-KR'].page_hero.start %}
{% assign hero_en = site.data.locales.en.page_hero.start %}
{% assign title_ko = site.data.locales['ko-KR'].pages.start_here.title %}
{% assign title_en = site.data.locales.en.pages.start_here.title %}

{% include page-hero.html
  lang=lang
  eyebrow_ko=hero_ko.eyebrow eyebrow_en=hero_en.eyebrow
  title_ko=title_ko title_en=title_en
  summary_ko=hero_ko.summary summary_en=hero_en.summary %}

{% include start-here.html %}
