# MindPC Companion (browser extension)

Lets MindPC show time on websites (like `github.com`) as their own entries,
whichever browser you used. Works in Chrome, Edge, Brave and other Chromium
browsers.

## What it shares

- **Only the website name**, for example `github.com`. Never the page address,
  title, search terms or history.
- **Private/incognito windows are never reported.**
- It talks only to the MindPC app on **this computer** (`127.0.0.1`). It has no
  other network access and no analytics.
- Chrome describes the `tabs` permission as "Read your browsing history". The
  extension needs it to see the active tab's address, and it reduces that
  address to the website name before sending anything.

## Install (until it is in the Chrome Web Store)

1. In MindPC open **Settings → Websites** and press **Show extension folder**. MindPC copies the extension to a permanent folder and opens it.
2. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`) and turn on **Developer mode**.
3. Click **Load unpacked** and choose the folder MindPC opened.
4. In MindPC, copy the pairing code shown under **Websites**.
5. Click the extension's icon and paste the code.

(If you downloaded only this folder from a release, skip step 1 and choose it in step 3.)

## How it connects

MindPC runs a small server on `127.0.0.1` (ports 47820 to 47829). The extension
finds it, then sends the active site whenever you switch tabs, navigate or change
windows, and every 30 seconds while a page stays open. Each request carries the
pairing code; MindPC refuses anything without it, and refuses requests that come
from web pages. "New code" in MindPC cancels every earlier pairing.
