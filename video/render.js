/*
 * Renders video/chart.html to MP4 (30 fps, 15 s) in 9:16 and 4:5, in two styles:
 * plain (global_<format>.mp4) and branded, with the web chart header (global_branded_<format>.mp4).
 *
 *   node video/render.js                         all four videos into video/out/
 *   node video/render.js 9x16                    one format, both styles
 *   node video/render.js branded 9x16            one format and style
 *   node video/render.js 9x16 --still 7          a single PNG at t = 7 s, for checking the layout
 *
 * Needs Google Chrome and ffmpeg on the PATH. The data comes from
 * public/assets/data/global_temperature.json, the same file the web chart uses.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'video', 'out');
const FPS = 30;
const DURATION = 15;
const FORMATS = { '9x16': 1920, '4x5': 1350 };
const TYPES = { '.html': 'text/html', '.json': 'application/json', '.woff2': 'font/woff2' };

const args = process.argv.slice(2);
const stillAt = args.includes('--still') ? Number(args[args.indexOf('--still') + 1]) : null;
const requested = args.filter(a => FORMATS[a]);
const formats = requested.length ? requested : Object.keys(FORMATS);
const STYLES = ['plain', 'branded'];
const styleArgs = args.filter(a => STYLES.includes(a));
const styles = styleArgs.length ? styleArgs : STYLES;

// Tiny static server so the page can load its fonts and data with ordinary URLs
const server = http.createServer((req, res) => {
  const file = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });

for (const style of styles)
  for (const name of formats) {
    const h = FORMATS[name];
    const label = style === 'plain' ? name : `${style}_${name}`;
    const page = await browser.newPage({ viewport: { width: 1080, height: h }, deviceScaleFactor: 1 });
    page.on('pageerror', e => console.error('page error:', e.message));
    await page.goto(`${base}/video/chart.html?h=${h}&style=${style}`);
    const info = await page.evaluate(() => window.ready);
    console.log(label, info);

    if (stillAt !== null) {
      await page.evaluate(t => window.render(t), stillAt);
      const file = path.join(outDir, `still_${label}_${stillAt}.png`);
      fs.writeFileSync(file, await page.screenshot({ type: 'png' }));
      console.log('wrote', file);
      await page.close();
      continue;
    }

    const file = path.join(outDir, `global_${label}.mp4`);
    const ffmpeg = spawn(
      'ffmpeg',
      [
        '-y',
        '-v',
        'error',
        '-f',
        'image2pipe',
        '-framerate',
        String(FPS),
        '-i',
        '-',
        // RGB frames to BT.709 YUV so the brand colours are not shifted
        '-vf',
        'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
        '-c:v',
        'libx264',
        '-preset',
        'slow',
        '-crf',
        '12',
        '-pix_fmt',
        'yuv420p',
        '-colorspace',
        'bt709',
        '-color_primaries',
        'bt709',
        '-color_trc',
        'bt709',
        '-movflags',
        '+faststart',
        file
      ],
      { stdio: ['pipe', 'inherit', 'inherit'] }
    );
    const done = new Promise((resolve, reject) => {
      ffmpeg.on('close', code => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`))));
    });

    const frames = FPS * DURATION;
    for (let i = 0; i < frames; i++) {
      await page.evaluate(t => window.render(t), i / FPS);
      const png = await page.screenshot({ type: 'png' });
      if (!ffmpeg.stdin.write(png)) await new Promise(resolve => ffmpeg.stdin.once('drain', resolve));
    }
    ffmpeg.stdin.end();
    await done;
    console.log('wrote', file);
    await page.close();
  }

await browser.close();
server.close();
process.exit(0);
