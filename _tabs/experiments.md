---
layout: page
title: 실측 기록
title_key: experiments
hero_title: true
icon: fas fa-flask
order: 2
group: evidence
---

{% include lang.html %}

{% assign hero_ko = site.data.locales['ko-KR'].page_hero.experiments %}
{% assign hero_en = site.data.locales.en.page_hero.experiments %}
{% assign intro_ko = site.data.experiments.intro['ko-KR'] %}
{% assign intro_en = site.data.experiments.intro.en %}

{% include page-hero.html
  lang=lang
  eyebrow_ko=hero_ko.eyebrow eyebrow_en=hero_en.eyebrow
  title_ko=hero_ko.title title_en=hero_en.title
  summary_ko=intro_ko summary_en=intro_en %}

{% include experiment-map.html %}
