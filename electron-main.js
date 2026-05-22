const { app, BrowserWindow, protocol } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = process.env.NODE_ENV === 'development';
let mainWindow = null;

// Register the custom protocol scheme 'app' as standard and secure
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }
]);

// Fast, zero-dependency MIME type dictionary for our static client-side resources
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf'
};

function registerProtocol() {
  protocol.handle('app', async (request) => {
    try {
      const url = new URL(request.url);
      let pathname = decodeURIComponent(url.pathname);
      
      // Normalize leading slash
      if (pathname.startsWith('/')) {
        pathname = pathname.substring(1);
      }
      
      // Default to index.html for root path requests
      if (pathname === '' || pathname === '/') {
        pathname = 'index.html';
      }

      const outDir = path.join(__dirname, 'out');
      let filePath = path.resolve(outDir, pathname);

      // Security check: prevent directory traversal outside the 'out' export directory
      if (!filePath.startsWith(outDir)) {
        filePath = path.join(outDir, 'index.html');
      }

      // Handle custom client-side routes (e.g., page page requests without extensions)
      if (!fs.existsSync(filePath)) {
        if (!path.extname(filePath)) {
          const htmlPath = filePath + '.html';
          if (fs.existsSync(htmlPath)) {
            filePath = htmlPath;
          } else {
            // SPA routing: fallback to index.html
            filePath = path.join(outDir, 'index.html');
          }
        } else {
          // Missing static resource: fallback to index.html or 404
          filePath = path.join(outDir, 'index.html');
        }
      }

      // Read file asynchronously using Electron's patched fs module (which natively unpacks ASAR)
      const data = await fs.promises.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const contentType = mimeTypes[ext] || 'application/octet-stream';

      return new Response(data, {
        status: 200,
        headers: {
          'content-type': contentType,
          'accept-ranges': 'bytes',
          'access-control-allow-origin': '*'
        }
      });
    } catch (err) {
      console.error('Failed to handle app protocol request:', err);
      return new Response('Protocol error', { status: 500 });
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
    // Premium UX: hide window until content has initialized to prevent blank flashing
    show: false,
    backgroundColor: '#09090b', //Zinc-950 color matching app dark mode
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    registerProtocol();
    // Using a clear hostname 'local' prevents path and origin swapping bugs
    mainWindow.loadURL('app://local/index.html');
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
