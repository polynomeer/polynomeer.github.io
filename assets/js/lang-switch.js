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

  const updateUrl = (lang) => {
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('lang', lang);
    window.history.replaceState({}, '', nextUrl);
  };

  const setLanguage = (lang) => {
    if (!supported.includes(lang)) return;
    window.localStorage.setItem(storageKey, lang);
    updateUrl(lang);
    applyText(lang);
  };

  const resolveTheme = () => {
    if (window.modeToggle && typeof window.modeToggle.modeStatus === 'string') {
      return window.modeToggle.modeStatus;
    }

    const explicit = document.documentElement.getAttribute('data-mode');
    return explicit === 'light' ? 'light' : 'dark';
  };

  const applyThemeToggle = (theme) => {
    document.querySelectorAll('[data-theme-option]').forEach((button) => {
      const isActive = button.dataset.themeOption === theme;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-pressed', String(isActive));

      const switcher = button.closest('.theme-toggle');
      if (switcher) {
        switcher.dataset.activeTheme = theme;
      }
    });
  };

  const setTheme = (theme) => {
    if (!window.modeToggle) return;

    if (theme === 'light') {
      window.modeToggle.setLight();
    } else {
      window.modeToggle.setDark();
    }

    window.modeToggle.notify();
    applyThemeToggle(theme);
  };

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

      const switcher = button.closest('.lang-toggle');
      if (switcher) {
        switcher.dataset.activeLang = lang;
      }
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
  window.addEventListener('load', () => {
    applyThemeToggle(resolveTheme());
  });

  window.addEventListener('message', (event) => {
    if (event.source === window && event.data && event.data.direction === 'mode-toggle') {
      applyThemeToggle(event.data.message === 'light' ? 'light' : 'dark');
    }
  });

  document.addEventListener('click', (event) => {
    const themeSwitcher = event.target.closest('.theme-toggle');
    if (themeSwitcher) {
      const currentTheme = resolveTheme();
      const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
      setTheme(nextTheme);
      return;
    }

    const langSwitcher = event.target.closest('.lang-toggle');
    if (langSwitcher) {
      const currentLang = document.documentElement.lang === 'en' ? 'en' : 'ko-KR';
      const nextLang = currentLang === 'ko-KR' ? 'en' : 'ko-KR';
      setLanguage(nextLang);
    }
  });
})();
