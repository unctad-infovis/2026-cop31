# 2026-cop31

**Live demo** https://unctad-infovis.github.io/2026-cop31/

## Rights of usage

Contact Teemo Tebest.

## How to build and develop

This is a Vite + React project.

* `npm install`
* `npm run start`

Project should start at: http://localhost:8080

For developing please refer to `package.json`

## Files and folders

All public assets go to folder `public`.

All source code goes to folder `src`.

## Charts

* `src/jsx/components/Bar.jsx` – animated bar chart of the global mean temperature anomaly (1850–latest). Use `#speed=50` in the url to change the milliseconds per year.
* `src/jsx/components/SunBurst.jsx` – radial bar chart of the country level temperature anomaly (1901–latest) with a year slider.
* Both are used in `src/Article.mdx`. The years shown follow the data, so a new year only needs new data files.

Inspiration for the bar chart: https://twitter.com/ScottDuncanWX/status/1417930383929352199

Inspiration for the sunburst: https://observablehq.com/@carmen-tm/women-architects-i-didnt-hear-about?collection=@observablehq/featured-creators and https://www.youtube.com/watch?v=-yIHxOui9nQ.

## Data

Run `python3 data/build_data.py` to rebuild `public/assets/data/data.json` and `public/assets/data/global_temperature.json`.

* **Country level (sunburst)** – annual mean temperature from CRU TS 4.10 via the World Bank Climate Change Knowledge Portal API, saved in `data/cckp_cru_ts410_annual_tas.json` (refresh instructions in the script). The anomaly is the annual mean minus the 1951–1980 mean, rounded to one decimal. This reproduces 92% of the 2025 edition values exactly, the rest differ by 0.1 or more because of rounding and the CRU 4.09 to 4.10 update.
* **Global (bar chart and the small line chart)** – `data/global_temperature.csv`, relative to 1850–1900. Values up to 2024 are carried over from the 2025 edition. **2025 (1.43 °C) comes from press coverage of the WMO State of the Global Climate 2025 and should be checked against the report itself** (WMO's January 2026 release said 1.44 °C).

## Social media video

A 15 second MP4 of the global temperature bar chart for social media, in two formats, 9:16 (1080×1920) and 4:5 (1080×1350), and two styles:

* **plain** – black title, grey text. `global_9x16.mp4` and `global_4x5.mp4`.
* **branded** – the web chart header style: the blue arrow left of a dark blue (`#004987`) title, grey subtitle and an italic *Source:* label. `global_branded_9x16.mp4` and `global_branded_4x5.mp4`.

Commands:

* `npm run video` renders all four into `video/out/`. The folder is git ignored, so the files are not committed.
* `node video/render.js 9x16` (or `4x5`) renders one format in both styles, `node video/render.js branded 9x16` one format and one style.
* `node video/render.js branded 9x16 --still 7` writes a single PNG of the frame at 7 seconds to `video/out/`, for checking the layout without a full render.
* Needs Google Chrome and `ffmpeg` on the PATH.

How it works: `video/chart.html` draws every frame on a `<canvas>` with a deterministic `window.render(t)` (t in seconds, format picked with `?h=1920` or `?h=1350`, style with `?style=plain` or `?style=branded`). `video/render.js` serves the repo on a local port, opens the page in Chrome with `playwright-core`, screenshots each frame at 30 fps and pipes the PNGs to `ffmpeg`.

* **Data** – reads `public/assets/data/global_temperature.json`, the same file as the web chart. After a data change run `python3 data/build_data.py` and then `npm run video`. Years, the counter and the axis follow the data, but the "Hottest year on record" callout is hard coded to 2024 in `video/chart.html`.
* **Timeline** – title fades in during the first second, the year counter runs at a constant pace from 1 s to 11 s, the callout fades in at 11.5 s and the final frame holds until 15 s. The timings are the `T` object in `video/chart.html`.
* **Safe zones** – the 9:16 layout keeps all content 250 px from the top, 340 px from the bottom and 120 px from the right edge so the platform overlays (profile, caption, buttons) do not cover it. The values are `M` in `video/chart.html`. The 4:5 version uses ordinary margins.
* **Brand** – UN Blue `#009EDB`, black `#231F20`, secondary text `#6E6259`, diverging bars from blue through grey `#EBEAE6` to red `#ED1847` / `#A71F36`, Inter from `@fontsource/inter`. The branded style uses the same arrow path as `ChartHeader` in the web chart. The official logo is not drawn, "UN Trade and Development" is set as text and the logo is added in editing.
* **Export** – H.264, CRF 12, yuv420p with BT.709 colour tags, 30 fps, `+faststart`. The bitrate is low (about 400 kbps) because the graphics are flat, not because of quality loss.
* **Not included** – audio, music and the logo. Those are left to the social media editing.

## Packages

The following packages are used in this project by default.

### Shared UNCTAD packages

* **@unctad-infovis/general-tools** — shared React components (`ButtonAnchor`, `ButtonShare`, `ChartDataWrapper`, `Image`, `ProgressBar`, `Quote`, `Select`, `Tooltip`, `UNCTADSiteHeader`, `BackToTop`, …), helpers (`BasePath`, `LoadFile`, `CsvToJson`, `FormatNr`, `RoundNr`, `UseIsVisible`, …) and base design-token styles
* **@unctad-infovis/minisite-tools** — report/minisite layout components (`Header`, `HeaderChapter`, `Footer`, `SideScrollingText`)

These packages are published from the [`un-init-project`](https://github.com/unctad-infovis/un-init-project) monorepo to GitHub Packages, so installing needs an `.npmrc` with `@unctad-infovis:registry=https://npm.pkg.github.com` and a `GITHUB_PACKAGES_TOKEN` environment variable.

### Project specific

* **d3** — scales, arcs and axes for the two charts
* **d3-transition** — imported explicitly because `d3` is flagged side effect free and the bundler would otherwise drop `selection.transition()` from the production build
* **chroma-js** — RdYlBu colour scale
* **playwright-core** — drives Chrome to capture the frames of the social media video (no browser is downloaded, it uses the installed Chrome)
* **@fontsource/inter** — Inter font files for the social media video

### Build & Dev Server

* **vite** — development server with hot module replacement and production bundler, replaces webpack
* **@vitejs/plugin-react** — adds React and JSX support to Vite

### React

* **react** — UI component library
* **react-dom** — renders React components to the DOM

### Formatter & Linter

* **@biomejs/biome** — formats and lints JS, JSX and CSS files on save, replaces ESLint + Prettier

### Minification

* **terser** — minifies the production JavaScript bundle, removes console.logs in production builds

### MDX

* **@mdx-js/rollup** — Vite/Rollup plugin that compiles MDX files into React components
* **@mdx-js/react** — provides React context for MDX components