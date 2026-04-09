const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  {
    ignores: ['assets/*', 'node_modules/*', '_site/*']
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    rules: {
      semi: ['error', 'always'],
      quotes: ['error', 'single']
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      }
    }
  },
  {
    files: ['_javascript/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
        ClipboardJS: 'readonly',
        GLightbox: 'readonly',
        Theme: 'readonly',
        dayjs: 'readonly',
        mermaid: 'readonly',
        tocbot: 'readonly',
        swconf: 'readonly'
      }
    }
  }
];
