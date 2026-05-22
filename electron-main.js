const { app, BrowserWindow } = require('electron');
const path = require('path');
const { fork } = require('child_process');
const net = require('net');

const isDev = process.env.NODE_ENV === 'development';
let serverProcess = null;
let mainWindow = null;

// Find a free port dynamically using Node's net module
function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => {
        resolve(port);
      });
    });
    server.on('error', (err) => {
      reject(err);
    });
  });
}

// Wait for the server port to be open and accepting connections
function waitForPort(port, host = '127.0.0.1', timeout = 15000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const check = () => {
      const socket = new net.Socket();
      socket.setTimeout(1000);
      socket.on('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.on('error', () => {
        socket.destroy();
        if (Date.now() - startTime > timeout) {
          reject(new Error(`Timeout waiting for port ${port}`));
        } else {
          setTimeout(check, 100);
        }
      });
      socket.on('timeout', () => {
        socket.destroy();
        if (Date.now() - startTime > timeout) {
          reject(new Error(`Timeout waiting for port ${port}`));
        } else {
          setTimeout(check, 100);
        }
      });
      socket.connect(port, host);
    };
    check();
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    // Premium style: hide window until it's loaded to avoid visual flickering
    show: false,
    backgroundColor: '#09090b', // match zinc-950
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    try {
      const port = await getFreePort();
      console.log(`Starting production Next.js server on port ${port}...`);

      const serverPath = path.join(__dirname, '.next/standalone/server.js');
      serverProcess = fork(serverPath, [], {
        env: {
          PORT: port.toString(),
          NODE_ENV: 'production',
          HOSTNAME: '127.0.0.1',
          ...process.env
        },
        silent: false
      });

      serverProcess.on('error', (err) => {
        console.error('Next.js server process error:', err);
      });

      serverProcess.on('exit', (code) => {
        console.log(`Next.js server process exited with code ${code}`);
      });

      // Wait for server to spin up
      await waitForPort(port);
      console.log(`Next.js server is ready! Loading app...`);
      mainWindow.loadURL(`http://127.0.0.1:${port}`);
    } catch (err) {
      console.error('Failed to start local server:', err);
      // Show an error message on screen
      mainWindow.loadURL('data:text/html,<html><body style="background:#09090b;color:#f4f4f5;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;"><h2>Initialization Error</h2><p>' + err.message + '</p></body></html>');
      mainWindow.show();
    }
  }
}

// Clean up background process on exit
function cleanUp() {
  if (serverProcess) {
    console.log('Stopping background Next.js server...');
    serverProcess.kill('SIGINT');
    serverProcess = null;
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  cleanUp();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  cleanUp();
});

app.on('quit', () => {
  cleanUp();
});
