---
layout: page
title: 기술 블로그·컨퍼런스 리뷰
title_key: tech_reviews
hero_title: true
icon: fas fa-newspaper
order: 3
group: evidence
redirect_from:
  - /tech-blogs/
---

{% include lang.html %}

{% assign hero_ko = site.data.locales['ko-KR'].page_hero.tech_reviews %}
{% assign hero_en = site.data.locales.en.page_hero.tech_reviews %}
{% assign lead_ko = site.data.locales['ko-KR'].tech_blogs.lead %}
{% assign lead_en = site.data.locales.en.tech_blogs.lead %}

{% include page-hero.html
  lang=lang
  eyebrow_ko=hero_ko.eyebrow eyebrow_en=hero_en.eyebrow
  title_ko=hero_ko.title title_en=hero_en.title
  summary_ko=lead_ko summary_en=lead_en %}

{% include tech-blog-map.html item_heading="h2" %}
