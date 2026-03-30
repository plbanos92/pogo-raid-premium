const fs = require('fs');
const path = require('path');

const srcDir = path.resolve(__dirname, '..', 'src');
const assetsDir = path.resolve(__dirname, '..', 'assets');
const outDir = path.resolve(__dirname, '..', 'dist');

async function copyRecursive(src, dest) {
  const stat = await fs.promises.stat(src);
  if (stat.isDirectory()) {
    await fs.promises.mkdir(dest, { recursive: true });
    const items = await fs.promises.readdir(src);
    for (const item of items) {
      await copyRecursive(path.join(src, item), path.join(dest, item));
    }
  } else {
    await fs.promises.mkdir(path.dirname(dest), { recursive: true });
    await fs.promises.copyFile(src, dest);
  }
}

async function copyIfExists(src, dest) {
  if (!fs.existsSync(src)) {
    return;
  }
  await copyRecursive(src, dest);
}

async function build() {
  try {
    // clean outDir
    if (fs.existsSync(outDir)) {
      await fs.promises.rm(outDir, { recursive: true, force: true });
    }

    // src contains the canonical app entrypoint/content.
    await copyRecursive(srcDir, outDir);

    // Keep legacy root assets available at /assets/* in dist.
    await copyIfExists(assetsDir, path.join(outDir, 'assets'));

    console.log('Built to', outDir);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

build();
