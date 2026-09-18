---
layout: page
title: 기술 블로그·컨퍼런스 리뷰
title_key: tech_reviews
hero_title: true
icon: fas fa-book-open
order: 7
redirect_from:
  - /tech-blogs/
---

{% include lang.html %}

<p class="tech-blog-lead" data-i18n="tech_blogs.lead">{{ site.data.locales[lang].tech_blogs.lead }}</p>

<h2 id="korea-tech-blogs" data-l10n-ko="국내 빅테크 기술 블로그" data-l10n-en="Korean Tech Blogs">국내 빅테크 기술 블로그</h2>

{% include tech-blog-map.html data=site.data.tech_blogs group_id="korea" item_heading="h3" %}

<h2 id="global-tech-blogs" data-l10n-ko="해외 빅테크 기술 블로그" data-l10n-en="Global Tech Blogs">해외 빅테크 기술 블로그</h2>

{% include tech-blog-map.html data=site.data.global_tech_blogs group_id="global" item_heading="h3" %}

<h2 id="expert-blogs" data-l10n-ko="권위자와 개인 기술 블로그" data-l10n-en="Expert and Personal Blogs">권위자와 개인 기술 블로그</h2>

{% include tech-blog-map.html data=site.data.expert_blogs group_id="experts" item_heading="h3" %}

<h2 id="conference-talks" data-l10n-ko="기술 컨퍼런스" data-l10n-en="Conferences">기술 컨퍼런스</h2>

{% include tech-blog-map.html data=site.data.conferences group_id="conferences" item_heading="h3" %}
