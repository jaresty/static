const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  testMatch: '**/dom.test.js',
  use: {
    baseURL: 'http://localhost:4321',
  },
  webServer: {
    command: 'node serve.js',
    url: 'http://localhost:4321',
    reuseExistingServer: false,
  },
});
