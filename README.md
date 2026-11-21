# Vice Frame — Leonida Cover Studio

[![make.fun · gta6-cover-art-01](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![rank](https://make.fun/badge/gta6-cover-art-01/chenchendashu/gta6-cover-art-01/rank.svg)](https://make.fun/bounty/gta6-cover-art-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![reward](https://make.fun/badge/gta6-cover-art-01/chenchendashu/gta6-cover-art-01/reward.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)

An offline web app that turns your own photos and a caption into GTA-style
cover art: framed multi-panel posters with bold poster lettering and a Vice
City sunset or neon colour grade, exported as a PNG to share. Your photos
are read on your own machine and never uploaded — the app makes no network
request at all.

## What it does

- **Any photo, every panel.** Load photos from your machine (or start from
  the two bundled samples), then fill each panel with any photo, crop it by
  dragging, and zoom per panel. One photo can carry a whole cover, or every
  panel can show a different scene.
- **Four layouts.** Poster Grid (the classic six-panel collage), Hero Duet,
  Nine Lives (a 3 × 3 wall with a plated title) and Title Strip.
- **Four colour grades.** Vice Sunset, Neon Nights, Golden Hour and
  Midnight Noir — real per-pixel gradient maps, not a translucent overlay.
- **Poster lettering.** An editable kicker, a big two-line title with a
  warm gradient fill and heavy outline, a neon script subtitle, a five-star
  heat meter and a season badge. The faces are Anton and Pacifico, vendored
  under the SIL Open Font License (see `app/fonts/`).
- **One-click export** in the common post sizes: 1080 × 1080, 1080 × 1350
  and 1920 × 1080 PNG.

Everything is original: no Rockstar Games logo, artwork, characters or
fonts. The sample photos were made with an image model for make.fun and
are free to use.

## Run it

Serve the static app and open it in a desktop browser:

```
node serve.ts        # then visit http://localhost:8080
```

Any static file server pointed at `app/` works just as well.

## How the entry is handed in

`main.ts` (Node 22, standard library only) copies `app/` and
`screenshots/` to the output directory and writes `dossier.json` with the
kit's vendored `buildDossier`:

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## License

MIT (see `LICENSE`). The vendored fonts are under the SIL Open Font
License 1.1 (see `app/fonts/OFL-Anton.txt` and `app/fonts/OFL-Pacifico.txt`).
