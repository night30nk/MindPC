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

// Websites (tracked by the browser extension) are matched by domain: an entry
// matches the domain itself and anything under it.
const SITE_PREFIX = 'site:';

const PRODUCTIVE_SITES = [
  'github.com', 'gitlab.com', 'bitbucket.org', 'stackoverflow.com', 'stackexchange.com',
  'developer.mozilla.org', 'docs.python.org', 'nodejs.org', 'npmjs.com', 'leetcode.com',
  'codepen.io', 'vercel.com', 'netlify.com', 'console.aws.amazon.com', 'portal.azure.com',
  'console.cloud.google.com', 'notion.so', 'figma.com', 'linear.app', 'atlassian.net',
  'trello.com', 'asana.com', 'docs.google.com', 'sheets.google.com', 'slides.google.com',
  'overleaf.com', 'claude.ai', 'chatgpt.com', 'wikipedia.org', 'arxiv.org', 'coursera.org',
  'khanacademy.org',
];

const DISTRACTING_SITES = [
  'youtube.com', 'netflix.com', 'twitch.tv', 'tiktok.com', 'instagram.com', 'facebook.com',
  'twitter.com', 'x.com', 'reddit.com', 'snapchat.com', 'pinterest.com', 'tumblr.com',
  'primevideo.com', 'hotstar.com', 'disneyplus.com', 'hulu.com', 'crunchyroll.com', '9gag.com',
];

function domainMatches(host, domains) {
  return domains.some((d) => host === d || host.endsWith(`.${d}`));
}

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
  if (typeof appIdentifier === 'string' && appIdentifier.startsWith(SITE_PREFIX)) {
    const host = appIdentifier.slice(SITE_PREFIX.length).toLowerCase();
    if (domainMatches(host, DISTRACTING_SITES)) return 'distracting';
    if (domainMatches(host, PRODUCTIVE_SITES)) return 'productive';
    return 'neutral';
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

module.exports = { CATEGORIES, SITE_PREFIX, categorize, summarize };
