# Web Annotator Lite

Web Annotator Lite is a Manifest V3 Chrome extension for local web highlights and annotations.

## Features

- Text and link highlights from selection, context menu, or `Alt+S`.
- Background, underline, wavy underline, and strike-through styles.
- IndexedDB storage for marks, tags, relations, and color settings.
- Side panel list with search, favorites, notes, tags, import, and export.
- Page reload restore using a TextQuoteSelector-compatible quote plus DOM path fallback.

## Install

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select this `web-annotator-lite` folder.

## Notes

This implementation avoids bundled third-party code and uses native Range APIs with TextQuoteSelector-style data. It keeps the same storage and messaging shape described in the project documents so it can be extended with Rangy later if needed.
