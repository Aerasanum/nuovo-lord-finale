// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // scripts/cmd-guard/vendor: third-party code kept verbatim so it can be diffed against upstream.
    ignores: ['dist/*', 'scripts/cmd-guard/vendor/*'],
  },
]);
