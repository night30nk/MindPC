const { categorize, summarize, CATEGORIES } = require('./categories');

describe('categorize', () => {
  it('recognises work apps across operating systems', () => {
    expect(categorize('Visual Studio Code', 'Code.exe')).toBe('productive');
    expect(categorize('Code', 'Code.app')).toBe('productive');
    expect(categorize('Ghostty', 'Ghostty.app')).toBe('productive');
    expect(categorize('Microsoft Word', 'WINWORD.EXE')).toBe('productive');
    expect(categorize('gnome-terminal-server', 'gnome-terminal-server')).toBe('productive');
  });

  it('recognises distracting apps', () => {
    expect(categorize('Netflix', 'Netflix.exe')).toBe('distracting');
    expect(categorize('Steam', 'steam_osx')).toBe('distracting');
    expect(categorize('Epic Games Launcher', 'EpicGamesLauncher.exe')).toBe('distracting');
  });

  it('leaves everything else neutral, including browsers', () => {
    expect(categorize('Google Chrome', 'chrome.exe')).toBe('neutral');
    expect(categorize('Brave Browser', 'Brave.app')).toBe('neutral');
    expect(categorize('Finder', 'Finder.app')).toBe('neutral');
    expect(categorize(undefined, undefined)).toBe('neutral');
  });

  it('matches whole words only, so look-alikes are not caught', () => {
    expect(categorize('Barcode Scanner', 'barcode.exe')).toBe('neutral');
    expect(categorize('WordPress Desktop', 'wordpress.exe')).toBe('neutral');
    expect(categorize('Passwords', 'Passwords.app')).toBe('neutral');
  });

  it('lets overrides win over the defaults', () => {
    expect(categorize('Netflix', 'Netflix.exe', { Netflix: 'neutral' })).toBe('neutral');
    expect(categorize('Google Chrome', 'chrome.exe', { 'Google Chrome': 'productive' })).toBe('productive');
  });

  it('ignores an invalid override value', () => {
    expect(categorize('Netflix', 'Netflix.exe', { Netflix: 'bogus' })).toBe('distracting');
  });

  it('is not fooled by inherited object keys', () => {
    expect(categorize('constructor', 'constructor', {})).toBe('neutral');
    expect(categorize('toString', 'toString', {})).toBe('neutral');
  });

  it('only ever returns a known category', () => {
    for (const name of ['Code', 'Netflix', 'Foo', '']) {
      expect(CATEGORIES).toContain(categorize(name, name));
    }
  });
});

describe('summarize', () => {
  it('adds categories and totals seconds per category', () => {
    const { apps, totals } = summarize([
      { name: 'Code', identifier: 'Code.app', duration: 3600 },
      { name: 'Netflix', identifier: 'Netflix.exe', duration: 1200 },
      { name: 'Finder', identifier: 'Finder.app', duration: 300 },
    ]);
    expect(apps.map((a) => a.category)).toEqual(['productive', 'distracting', 'neutral']);
    expect(totals).toEqual({ productive: 3600, neutral: 300, distracting: 1200 });
  });

  it('applies overrides to the totals', () => {
    const { totals } = summarize([{ name: 'Netflix', duration: 600 }], { Netflix: 'productive' });
    expect(totals).toEqual({ productive: 600, neutral: 0, distracting: 0 });
  });

  it('returns zero totals for no apps', () => {
    expect(summarize([]).totals).toEqual({ productive: 0, neutral: 0, distracting: 0 });
  });
});
