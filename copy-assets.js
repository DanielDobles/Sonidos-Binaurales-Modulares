const fs = require('fs');
const path = require('path');

const srcPublic = path.join(__dirname, 'public');
const destPublic = path.join(__dirname, '.next', 'standalone', 'public');

const srcStatic = path.join(__dirname, '.next', 'static');
const destStatic = path.join(__dirname, '.next', 'standalone', '.next', 'static');

console.log('Copying static assets for standalone Next.js server...');

// Helper to copy directory recursively
function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (let entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

try {
  if (fs.existsSync(srcPublic)) {
    copyDirSync(srcPublic, destPublic);
    console.log('Successfully copied public/ to .next/standalone/public');
  } else {
    console.log('No public folder found to copy.');
  }

  if (fs.existsSync(srcStatic)) {
    copyDirSync(srcStatic, destStatic);
    console.log('Successfully copied .next/static/ to .next/standalone/.next/static');
  } else {
    console.log('No .next/static folder found to copy.');
  }
  console.log('Asset copy completed successfully!');
} catch (err) {
  console.error('Error copying assets:', err);
  process.exit(1);
}
