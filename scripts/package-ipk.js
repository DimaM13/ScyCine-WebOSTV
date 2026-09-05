// Standalone IPK Packager for LG webOS TV (100% Native Pure Node.js)
// Produces standards-compliant .ipk (ar archive with debian-binary, control.tar.gz, data.tar.gz)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import archiver from 'archiver';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.resolve(rootDir, 'dist');
const appInfoPath = path.resolve(rootDir, 'appinfo.json');

if (!fs.existsSync(appInfoPath)) {
  console.error('[Error] appinfo.json not found in:', rootDir);
  process.exit(1);
}

if (!fs.existsSync(distDir) || !fs.existsSync(path.resolve(distDir, 'index.html'))) {
  console.error('[Error] dist/index.html not found! Please run "npm run build" first.');
  process.exit(1);
}

const appInfo = JSON.parse(fs.readFileSync(appInfoPath, 'utf-8'));
const appId = appInfo.id || 'tv.skycine.webos';
const version = appInfo.version || '2.0.0';
const title = appInfo.title || 'SkyCine TV';

console.log(`[IPK Packager] Packaging ${appId} (v${version} - "${title}")...`);

// Ensure vital webOS assets are copied into dist/
['appinfo.json', 'icon.png', 'largeIcon.png'].forEach(file => {
  const src = path.resolve(rootDir, file);
  const dest = path.resolve(distDir, file);
  if (fs.existsSync(src) && !fs.existsSync(dest)) {
    fs.copyFileSync(src, dest);
    console.log(`[IPK Packager] Copied ${file} -> dist/`);
  }
});

// Helper: Stream to in-memory Buffer
function archiveToBuffer(archive) {
  return new Promise((resolve, reject) => {
    const buffers = [];
    archive.on('data', chunk => buffers.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(buffers)));
    archive.on('error', err => reject(err));
  });
}

// 1. Create control.tar.gz
async function buildControlTarGz() {
  const archive = archiver('tar', { gzip: true, gzipOptions: { level: 9 } });
  const controlContent = [
    `Package: ${appId}`,
    `Version: ${version}`,
    `Section: misc`,
    `Priority: optional`,
    `Architecture: all`,
    `Maintainer: SkyCine Team`,
    `Description: ${title} Native Cinema Client for LG Smart TV webOS`,
    `Installed-Size: 1500`
  ].join('\n') + '\n';

  archive.append(controlContent, { name: './control', mode: 0o644 });
  archive.finalize();
  return await archiveToBuffer(archive);
}

// 2. Create data.tar.gz
async function buildDataTarGz() {
  const archive = archiver('tar', { gzip: true, gzipOptions: { level: 9 } });
  const prefix = `usr/palm/applications/${appId}`;

  function addFolder(dir, basePrefix) {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      const entryName = `${basePrefix}/${item}`;
      if (stat.isDirectory()) {
        addFolder(fullPath, entryName);
      } else {
        archive.file(fullPath, { name: entryName, mode: 0o644 });
      }
    }
  }

  addFolder(distDir, prefix);
  archive.finalize();
  return await archiveToBuffer(archive);
}

// 3. Create UNIX ar archive containing debian-binary, control.tar.gz, data.tar.gz
function buildArArchive(entries) {
  const chunks = [Buffer.from('!<arch>\n', 'ascii')];

  for (const entry of entries) {
    const header = Buffer.alloc(60, 0x20); // space-padded 60-byte header
    // 0..15: File name (ended with '/' for GNU ar)
    const nameStr = entry.name.endsWith('/') ? entry.name : entry.name + '/';
    header.write(nameStr.padEnd(16, ' '), 0, 16, 'ascii');
    // 16..27: Timestamp
    header.write(Math.floor(Date.now() / 1000).toString().padEnd(12, ' '), 16, 12, 'ascii');
    // 28..33: Owner ID
    header.write('0'.padEnd(6, ' '), 28, 6, 'ascii');
    // 34..39: Group ID
    header.write('0'.padEnd(6, ' '), 34, 6, 'ascii');
    // 40..47: File Mode (100644)
    header.write('100644  ', 40, 8, 'ascii');
    // 48..57: File Size
    header.write(entry.data.length.toString().padEnd(10, ' '), 48, 10, 'ascii');
    // 58..59: Magic marker "\x60\x0A"
    header.write('`\n', 58, 2, 'ascii');

    chunks.push(header);
    chunks.push(entry.data);
    // Pad to 2-byte boundary
    if (entry.data.length % 2 !== 0) {
      chunks.push(Buffer.from('\n', 'ascii'));
    }
  }

  return Buffer.concat(chunks);
}

async function main() {
  try {
    console.log('[IPK Packager] Compressing control.tar.gz...');
    const controlBuf = await buildControlTarGz();

    console.log('[IPK Packager] Compressing data.tar.gz...');
    const dataBuf = await buildDataTarGz();

    const debianBinaryBuf = Buffer.from('2.0\n', 'ascii');

    console.log('[IPK Packager] Assembling ar package...');
    const ipkBuffer = buildArArchive([
      { name: 'debian-binary', data: debianBinaryBuf },
      { name: 'control.tar.gz', data: controlBuf },
      { name: 'data.tar.gz', data: dataBuf }
    ]);

    const ipkNameStandard = `${appId}_${version}_all.ipk`;
    const ipkNameConvenient = 'SkyCine-WebOSTV.ipk';

    const outStandard = path.resolve(rootDir, ipkNameStandard);
    const outConvenient = path.resolve(rootDir, ipkNameConvenient);

    fs.writeFileSync(outStandard, ipkBuffer);
    fs.writeFileSync(outConvenient, ipkBuffer);

    const sizeKb = (ipkBuffer.length / 1024).toFixed(1);

    console.log('\n======================================================');
    console.log(`[SUCCESS] LG webOS IPK Package Created (${sizeKb} KB):`);
    console.log(` -> ${outConvenient}`);
    console.log(` -> ${outStandard}`);
    console.log('======================================================');
    console.log('Ready to install via:');
    console.log(' 1. webOS Dev Manager (drag and drop .ipk)');
    console.log(' 2. Homebrew Channel (webosbrew)');
    console.log(` 3. ares-install ${ipkNameConvenient}\n`);
  } catch (err) {
    console.error('[Error during IPK generation]:', err);
    process.exit(1);
  }
}

main();
