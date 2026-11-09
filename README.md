# Pigment & Light

A personal oil paint color mixing studio that runs in the browser. Keep an inventory of your paints, sample a color from a reference photo, and get a measurable starting recipe (percentages and grams) using only the paints you own.

It's a static web app with no account and no server. Everything is saved in the browser on the current device.

## Features

- **Color mixer.** Upload a reference image (including from an iPhone camera roll), then tap or drag on it to sample. Each sample averages a small area to smooth out texture and stray pixels, and you can choose a small, medium, or large area. Keyboard users can move the sample point with the arrow keys. You can also pick a color with the native color picker or type a HEX value.
- **Starting recipe.** The app searches every one-, two-, and three-paint combination from your inventory and shows each paint's swatch, brand, name, pigment code, percentage, and grams for your test batch (2 g by default). It also shows an estimated mix swatch, an approximate ΔE2000 color difference, and alternative recipes.
- **Paint inventory.** Each paint has a brand, name, pigment code(s), ingredients or notes, tube amount, an editable swatch, an optional relative tinting strength, and a "use in mixer" switch. You can export to CSV, download a JSON backup, and restore from it. The app starts with a clearly labeled sample palette for you to replace with your own tubes.
- **Saved mixes.** See saved targets, dates, recipe summaries, and notes. You can print a mixing card, reopen a mix in the mixer, edit its notes, or delete it.
- **Printable mixing cards.** Each card shows the target swatch, HEX and RGB values, the recipe, batch size, and date, with test-swatch boxes and lined space for your notes.
- **Phone-friendly.** The layout is responsive with large touch targets. You can add it to your Home Screen, and it works offline.

## About the estimates

Recipes are **starting estimates, not guaranteed matches**. The model treats each paint's on-screen swatch as a reflectance color and mixes the swatches with a simplified single-constant Kubelka–Munk approximation of subtractive mixing. Real oil paint depends on pigment concentration, opacity, tinting strength, brand, medium, surface, and lighting. Pigment codes are shown for reference only and aren't used to predict mixing behavior. To get better estimates, match each swatch to a paint-out of your actual tube and set a tinting strength for unusually strong or weak paints. Then mix a test batch and adjust by eye.

## Running it

Serve the folder over HTTP, for example:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

### Publishing for iPhone (GitHub Pages)

1. In the repository on GitHub, open **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch** and pick the branch and the `/ (root)` folder.
3. Open the published `https://…github.io/…/` address in Safari on your iPhone, tap **Share → Add to Home Screen**.

All paths are relative, so the app works from a sub-path.

## Your data

- Paints, saved mixes, and settings are stored in `localStorage` in the current browser on the current device. Reference images are never uploaded or stored. Saved mixes keep only a small crop around the point you sampled.
- On iPhone, a Home Screen app has **separate storage from Safari**. To move data, use **Download full backup (JSON)** in one and **Restore from backup** in the other.
- Download a backup regularly. Clearing website data removes everything.

## Development

```
index.html            App shell and screens
css/styles.css        Styles, including print styles for mixing cards
js/color.js           sRGB/linear/CIELAB conversion, CIEDE2000, Kubelka–Munk helpers
js/mixer.js           Recipe search over 1–3 paint combinations
js/app.js             UI, storage, image sampling, backup, printing
sw.js                 Offline cache (bump CACHE when releasing changes)
manifest.webmanifest  Home Screen / install metadata
tests/engine.test.js  Color math and recipe search tests: `node tests/engine.test.js`
```
