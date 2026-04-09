---
# the default layout is 'page'
icon: fas fa-info-circle
order: 5
---

{% include lang.html %}

## Hi there 👋, I'm Polynomeer

![polynomeer@gmail.com](https://img.shields.io/badge/polynomeer@gmail.com-red.svg?&style=flat&logo=gmail&logoColor=white)

<h3 data-i18n="about.motto">{{ site.data.locales[lang].about.motto }}</h3>

<p data-i18n="about.intro_title">{{ site.data.locales[lang].about.intro_title }}</p>

<p data-i18n="about.intro_summary_1">{{ site.data.locales[lang].about.intro_summary_1 }}</p>

<p data-i18n="about.intro_summary_2">{{ site.data.locales[lang].about.intro_summary_2 }}</p>

<p data-i18n="about.intro_summary_3">{{ site.data.locales[lang].about.intro_summary_3 }}</p>

<h3 data-i18n="about.technical_focus">{{ site.data.locales[lang].about.technical_focus }}</h3>

- `Java`, `Kotlin`, `Go`, `Python`
- `Spring Boot`, `Spring Batch`, `JPA`, `QueryDSL`, `MyBatis`
- `MySQL`, `Redis`, `Amazon SQS`, `RabbitMQ`
- `AWS (EC2/RDS/ECS)`, `Docker`, `Jenkins`
- `Datadog`, `Sentry`, `JUnit 5`, `ArchUnit`

{% include about-profile-hub.html %}
