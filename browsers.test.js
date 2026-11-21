const { isBrowser } = require('./browsers');

describe('isBrowser', () => {
  it('recognises Chromium browsers by name or executable on each OS', () => {
    expect(isBrowser('Google Chrome', 'Google Chrome.app')).toBe(true); // macOS
    expect(isBrowser('Brave Browser', 'Brave Browser.app')).toBe(true);
    expect(isBrowser('Microsoft Edge', 'msedge.exe')).toBe(true); // Windows
    expect(isBrowser('Google Chrome', 'chrome.exe')).toBe(true);
    expect(isBrowser('brave', 'brave.exe')).toBe(true);
    expect(isBrowser('google-chrome', 'google-chrome')).toBe(true); // Linux
    expect(isBrowser('chromium-browser', 'chromium-browser')).toBe(true);
    expect(isBrowser('Arc', 'Arc.app')).toBe(true);
  });

  it('does not match apps that merely contain a browser word', () => {
    expect(isBrowser('Chrome Remote Desktop', 'remoting_host.exe')).toBe(false);
    expect(isBrowser('Arcade', 'Arcade.app')).toBe(false);
    expect(isBrowser('Operator', 'operator.exe')).toBe(false);
    expect(isBrowser('Code', 'Code.app')).toBe(false);
  });

  it('does not claim browsers the extension does not support yet', () => {
    expect(isBrowser('Firefox', 'firefox.exe')).toBe(false);
    expect(isBrowser('Safari', 'Safari.app')).toBe(false);
  });

  it('copes with missing values', () => {
    expect(isBrowser(undefined, undefined)).toBe(false);
    expect(isBrowser(null, 'chrome.exe')).toBe(true);
  });
});
