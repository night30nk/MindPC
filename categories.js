// Sorts apps into productive / neutral / distracting. Defaults are a keyword
// heuristic and will sometimes be wrong (a browser can be either), so users can
// override any app; overrides always win.

const CATEGORIES = ['productive', 'neutral', 'distracting'];

// Matched against whole words of the app name and executable name, so "code"
// matches "Visual Studio Code" but not "Barcode Scanner". A multi-word entry
// must appear as consecutive words.
const PRODUCTIVE = [
  'code', 'visual studio', 'vscode', 'xcode', 'intellij', 'webstorm', 'pycharm', 'phpstorm',
  'goland', 'rider', 'clion', 'rubymine', 'android studio', 'sublime', 'vim', 'neovim', 'emacs',
  'terminal', 'iterm', 'iterm2', 'ghostty', 'warp', 'alacritty', 'kitty', 'powershell', 'cmd',
  'konsole', 'tmux', 'figma', 'sketch', 'postman', 'insomnia', 'docker', 'tableplus', 'dbeaver',
  'mysqlworkbench', 'pgadmin', 'sourcetree', 'github desktop', 'word', 'excel', 'powerpoint',
  'pages', 'numbers', 'keynote', 'notion', 'obsidian', 'evernote', 'onenote', 'libreoffice',
  'notes', 'anki', 'zotero',
];

const DISTRACTING = [
  'netflix', 'youtube', 'twitch', 'tiktok', 'instagram', 'facebook', 'twitter', 'reddit',
  'snapchat', 'prime video', 'disney', 'hulu', 'plex', 'crunchyroll', 'vlc', 'steam',
  'epic games', 'battle net', 'riot', 'valorant', 'minecraft', 'league of legends', 'fortnite',
  'roblox', 'genshin', 'dota', 'counter strike',
];

function words(appName, appIdentifier) {
  const text = `${appName || ''} ${appIdentifier || ''}`
    .toLowerCase()
    .replace(/\.(app|exe)\b/g, ' ');
  return ` ${text.split(/[^a-z0-9]+/).filter(Boolean).join(' ')} `;
}

function matchesAny(haystack, keywords) {
  return keywords.some((keyword) => haystack.includes(` ${keyword} `));
}

// overrides: { [appName]: category }
function categorize(appName, appIdentifier, overrides = {}) {
  if (Object.hasOwn(overrides, appName) && CATEGORIES.includes(overrides[appName])) {
    return overrides[appName];
  }
  const haystack = words(appName, appIdentifier);
  // Distracting wins ties: "Steam Code Editor" is rare, a game launcher is not.
  if (matchesAny(haystack, DISTRACTING)) return 'distracting';
  if (matchesAny(haystack, PRODUCTIVE)) return 'productive';
  return 'neutral';
}

// Adds a category to each { name, duration } row and totals seconds per category.
function summarize(apps, overrides = {}) {
  const totals = { productive: 0, neutral: 0, distracting: 0 };
  const rows = apps.map((app) => {
    const category = categorize(app.name, app.identifier, overrides);
    totals[category] += app.duration;
    return { ...app, category };
  });
  return { apps: rows, totals };
}

module.exports = { CATEGORIES, categorize, summarize };
