# Chess Clock

A two-player chess clock PWA. The screen is split down the middle — each player taps their own half to end their turn and start the opponent's clock. The top half is rotated so it reads upright for the player across the table.

## Features

- Tap your side to pass the turn (responds on touch-down, no delay)
- Presets from 1+0 bullet to 30+0 classical, plus custom minutes and Fischer increment
- Tenths of a second shown under 20 s, red warning under 10 s, flag on timeout
- Pause/resume, reset, move counter per player
- Click sound and vibration (toggleable)
- Keeps the screen awake while the clock runs
- Installable and fully offline (service worker)

The first tap works like a real clock: the player who taps starts their **opponent's** clock.

Keyboard (desktop): `A` / left Shift = bottom player, `L` / right Shift = top player, Space = pause.

## Run locally

No build step — it's plain HTML, CSS and JS.

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy

Enable GitHub Pages for this repo (Settings → Pages → Deploy from branch → `main` / root). All paths are relative, so it works from a project subpath. Open the site on your phone and use "Add to Home Screen" / "Install app".

When you change any app file, bump `CACHE` in `sw.js` so installed copies pick up the update.
