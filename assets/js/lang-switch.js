(function () {
  const storageKey = 'preferred-lang';
  const supported = ['ko-KR', 'en'];
  const localeScript = document.getElementById('ui-locales');

  if (!localeScript) return;

  let locales = {};

  try {
    locales = JSON.parse(localeScript.textContent);
  } catch (_error) {
    return;
  }

  const lookup = (source, path) =>
    path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : null), source);

  const pickLanguage = () => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get('lang');
    const stored = window.localStorage.getItem(storageKey);

    if (supported.includes(requested)) return requested;
    if (supported.includes(stored)) return stored;
    return document.documentElement.lang || 'ko-KR';
  };

  const applyText = (lang) => {
    const locale = locales[lang] || locales['ko-KR'];
    const searchInput = document.getElementById('search-input');

    document.documentElement.lang = lang;
    document.documentElement.dataset.uiLang = lang;

    document.querySelectorAll('[data-i18n]').forEach((element) => {
      const value = lookup(locale, element.dataset.i18n);
      if (typeof value === 'string') {
        element.textContent = value;
      }
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
      const value = lookup(locale, element.dataset.i18nPlaceholder);
      if (typeof value === 'string') {
        element.setAttribute('placeholder', value + '...');
      }
    });

    document.querySelectorAll('[data-i18n-aria-label]').forEach((element) => {
      const value = lookup(locale, element.dataset.i18nAriaLabel);
      if (typeof value === 'string') {
        element.setAttribute('aria-label', value);
      }
    });

    document.querySelectorAll('[data-l10n-ko]').forEach((element) => {
      const value = lang === 'en' ? element.dataset.l10nEn : element.dataset.l10nKo;
      if (value) {
        element.textContent = value;
      }
    });

    document.querySelectorAll('[data-lang-option]').forEach((button) => {
      const isActive = button.dataset.langOption === lang;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });

    if (searchInput) {
      searchInput.setAttribute('aria-label', lookup(locale, 'search.hint') || 'search');
    }

    const currentTitle = document.querySelector('.dynamic-title, #topbar-title');
    const siteTitle = lookup(locale, 'title') || document.title;

    if (currentTitle) {
      const titleText = currentTitle.textContent.trim();
      document.title = titleText === siteTitle ? siteTitle : titleText + ' | ' + siteTitle;
    }
  };

  const initialLang = pickLanguage();
  applyText(initialLang);

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-lang-option]');
    if (!button) return;

    const { langOption } = button.dataset;
    if (!supported.includes(langOption)) return;

    window.localStorage.setItem(storageKey, langOption);

    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('lang', langOption);
    window.history.replaceState({}, '', nextUrl);

    applyText(langOption);
  });
})();
