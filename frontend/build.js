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

import http from 'http';

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

function copyStaticAssets() {
  fs.copyFileSync(path.join(__dirname, 'src/index.css'), path.join(distDir, 'index.css'));
  fs.writeFileSync(path.join(distDir, 'index.html'), htmlContent);
}

copyStaticAssets();

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
    'process.env.NODE_ENV': '"development"',
  },
};

if (isWatch) {
  // Watch CSS file changes as well
  fs.watch(path.join(__dirname, 'src/index.css'), () => {
    try {
      copyStaticAssets();
      console.log('  [watch] Updated index.css');
    } catch (_) {}
  });

  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();

  // Create local development server with API proxy to port 5000
  const DEV_PORT = 5173;
  const BACKEND_PORT = 5000;

  const server = http.createServer((req, res) => {
    // Proxy /api requests to Express backend
    if (req.url && req.url.startsWith('/api')) {
      const proxyReq = http.request(
        {
          hostname: '127.0.0.1',
          port: BACKEND_PORT,
          path: req.url,
          method: req.method,
          headers: {
            ...req.headers,
            host: `127.0.0.1:${BACKEND_PORT}`,
          },
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
          proxyRes.pipe(res);
        }
      );

      proxyReq.on('error', () => {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: `Backend at http://localhost:${BACKEND_PORT} is not reachable. Ensure the backend server is running via 'npm run dev' in the backend directory.`,
          })
        );
      });

      req.pipe(proxyReq);
      return;
    }

    // Serve static files from distDir
    let cleanUrl = (req.url || '/').split('?')[0];
    if (cleanUrl === '/') cleanUrl = '/index.html';

    let filePath = path.join(distDir, cleanUrl);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(distDir, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
    };

    res.writeHead(200, {
      'Content-Type': mimeTypes[ext] || 'application/octet-stream',
    });
    fs.createReadStream(filePath).pipe(res);
  });

  server.listen(DEV_PORT, '0.0.0.0', () => {
    console.log('\n  🔐 TrustVault Frontend Dev Server');
    console.log(`  ➜  Local:     http://localhost:${DEV_PORT}/`);
    console.log(`  ➜  API Proxy: http://localhost:${BACKEND_PORT}/`);
    console.log('  ➜  Ready & watching for changes...\n');
  });
} else {
  await esbuild.build(buildOptions);
  console.log('Build completed successfully in dist/');
  process.exit(0);
}

