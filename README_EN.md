# WeRead Middle-Click Page Turn

> A minimal Edge extension: **click the middle mouse button to turn to the next page on WeRead (微信读书) web.**
> That's the whole feature.

English | [简体中文](./README_ZH.md)

---

## What is this

A Manifest V3 Edge extension that does exactly one thing:

> On `weread.qq.com` reader pages, **a middle-click turns to the next page.**

No settings panel, no popup, no page-turn sound, no auto-reading, no annotation tweaks.
Install it and it works.

## Why not just use an existing WeRead helper?

Existing WeRead extensions (e.g. "微信读书助手") do a lot more than needed. More
importantly, most community scripts implement middle-click page turning by
**dispatching a synthetic `ArrowRight` keyboard event**:

```js
document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', ... }))
```

Such events have `isTrusted === false` and bypass WeRead's own
"turn page → report reading position → sync chapter" pipeline, which is a common
cause of **the page turning while progress/chapter metadata does not follow**.

This extension instead **clicks the real "next page" button** on the page
(`button.renderTarget_pager_button_right`), going through WeRead's own React
`onClick` handler — identical to a manual click.

## Features

- **Clicks the real button** — equivalent to a manual "next page" click, so reading position and progress sync correctly
- **Body whitelist** — only triggers on the reading area; catalog, notes, annotation toolbar and other UI are ignored
- **Never interrupts typing** — annotation and thought input fields are safe
- **Leaves links alone** — middle-clicking a link in the text still opens it in a new tab
- **Resilient to redesigns** — if the button class changes, it falls back to "right-most pager button" instead of silently dying
- **Blocks autoscroll** — prevents Chrome/Edge's middle-button autoscroll behavior
- **Zero permissions, zero network calls** — only requests content-script access to `weread.qq.com`, collects nothing

## Installation

### Edge (recommended)

1. Go to `edge://extensions`
2. Turn on **Developer mode** (bottom left)
3. Click **Load unpacked**
4. Select this repository's root directory (the folder containing `manifest.json`)
5. Done. Open WeRead on the web and middle-click in the body text to turn the page

### Chrome / Chromium

Same steps, at `chrome://extensions`.

### Packaging as a .zip

```bash
cd weread-middle-click-extension
zip -r weread-middle-click-extension.zip manifest.json content.js
```

## Usage

| Action | Behavior |
|---|---|
| Middle-click on body text | Turn to the next page |
| Middle-click on a link in the text | Keeps the browser default (opens in a new tab) |
| Middle-click in an annotation/thought input | Does not turn the page, does not disturb typing |
| Middle-click on catalog/notes panels | Does not turn the page |

At the last page of a chapter, behavior matches a manual click exactly: WeRead itself decides whether to move to the next chapter.

### Debugging

The extension logs to the browser console (prefixed with `[微信读书·中键翻页]`),
including the verdict and reason for every middle-click — handy for troubleshooting.

## Compatibility

- Edge / Chrome / Chromium and other Manifest V3 browsers
- WeRead web **paginated mode** (left/right arrow navigation)
- In **scroll mode** (no page arrows), it gracefully falls back to the footer "next chapter" button

## Known issues

- A major WeRead DOM overhaul may require updating the selector constants in `content.js`
- WeRead's own **cross-device progress sync** (reading further ahead in the mobile app, then returning to the desktop) can move your position unexpectedly. This is WeRead behavior, not an extension bug.

## License

[MIT](./LICENSE)

## Credits

- [mefengl/wereadhelper](https://github.com/mefengl/wereadhelper) — inspiration for the middle-click feature
- [EwenYoung/weread-plus](https://github.com/EwenYoung/weread-plus) — documentation of WeRead's DOM structure
