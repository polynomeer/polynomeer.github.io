---
layout: page
hero_title: true
icon: fas fa-diagram-project
order: 1
group: evidence
---

{% include lang.html %}

{% assign cm_ko = site.data.locales['ko-KR'].capability_map %}
{% assign cm_en = site.data.locales.en.capability_map %}

{% include page-hero.html
  lang=lang
  eyebrow_ko=cm_ko.eyebrow eyebrow_en=cm_en.eyebrow
  title_ko=cm_ko.directory_title title_en=cm_en.directory_title
  summary_ko=cm_ko.directory_description summary_en=cm_en.directory_description %}

{% include capability-map.html lang=lang head=false %}
