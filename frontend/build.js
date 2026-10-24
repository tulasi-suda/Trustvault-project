// Build script using esbuild (Vite-free, zero-config, fast and unminified)
import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isWatch = process.argv.includes('--watch');
const distDir = path.join(__dirname, 'dist');

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// 1. Copy index.css to dist
fs.copyFileSync(path.join(__dirname, 'src/index.css'), path.join(distDir, 'index.css'));

// 2. Generate dist/index.html
const htmlContent = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2310b981' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'/></svg>" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>TrustVault | Secure Cryptographic Document Sharing</title>
    <meta name="description" content="TrustVault provides zero-trust document security with cryptographic hash-chain auditing, strict compartmentalized access controls, and verifiable data integrity." />
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/index.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/bundle.js"></script>
  </body>
</html>`;

fs.writeFileSync(path.join(distDir, 'index.html'), htmlContent);

const buildOptions = {
  entryPoints: [path.join(__dirname, 'src/main.jsx')],
  bundle: true,
  outfile: path.join(distDir, 'bundle.js'),
  format: 'esm',
  minify: false, // Invariant: Keep code readable and well spaced (never minified)
  loader: {
    '.js': 'jsx',
    '.jsx': 'jsx',
  },
  define: {
    'process.env.NODE_ENV': '"production"',
  },
};

if (isWatch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log('Watching for changes with esbuild...');
} else {
  await esbuild.build(buildOptions);
  console.log('Build completed successfully in dist/');
}
