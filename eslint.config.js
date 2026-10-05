import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    // src/vendor/ es codigo de terceros minificado (boneyard-js), copiado tal
    // cual para poder importarlo en local. No se parchea ni se le aplica lint:
    // un fix sobre el bundle lo desincroniza de la version publicada.
    ignores: ['node_modules/**', 'src/vendor/**'],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2022,
        Swal: 'readonly',
        XLSX: 'readonly',
        Sentry: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-restricted-syntax': ['warn', {
        selector: "AssignmentExpression[left.property.name='innerHTML']",
        message: 'innerHTML assignment — usa escapeHtml/escapeAttr en interpolaciones (audit F4B)',
      }],
    },
  },
];
