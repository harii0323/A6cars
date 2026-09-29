const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function getJsFiles(dir) {
  let files = [];
  if (!fs.existsSync(dir)) return files;
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (item.name === 'node_modules' || item.name === '.git' || item.name === '.dist') continue;
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      files = files.concat(getJsFiles(full));
    } else if (item.name.endsWith('.js')) {
      files.push(full);
    }
  }
  return files;
}

const rootDir = path.resolve(__dirname, '..');
const dirsToScan = [
  path.join(rootDir, 'frontend'),
  path.join(rootDir, 'backend'),
  path.join(rootDir, 'scripts'),
  rootDir
];

const scanned = new Set();
const allFiles = [];

for (const d of dirsToScan) {
  if (d === rootDir) {
    for (const f of fs.readdirSync(d)) {
      if (f.endsWith('.js') && !f.startsWith('.')) {
        const full = path.join(rootDir, f);
        if (!scanned.has(full)) {
          scanned.add(full);
          allFiles.push(full);
        }
      }
    }
  } else {
    for (const f of getJsFiles(d)) {
      if (!scanned.has(f)) {
        scanned.add(f);
        allFiles.push(f);
      }
    }
  }
}

let passCount = 0;
let failCount = 0;
const errors = [];

for (const file of allFiles) {
  try {
    execSync(`node -c "${file}"`, { stdio: 'pipe' });
    passCount++;
    console.log(`✅ [PASS] ${path.relative(rootDir, file)}`);
  } catch (err) {
    failCount++;
    const errMsg = err.stderr ? err.stderr.toString() : err.message;
    console.error(`❌ [FAIL] ${path.relative(rootDir, file)}:\n${errMsg}`);
    errors.push({ file: path.relative(rootDir, file), error: errMsg });
  }
}

console.log(`\n========================================`);
console.log(`SYNTAX AUDIT RESULTS: ${passCount} passed, ${failCount} failed (${allFiles.length} total files)`);
if (failCount > 0) {
  process.exit(1);
} else {
  console.log(`🎉 ALL JAVASCRIPT FILES PASSED SYNTAX CHECK!`);
  process.exit(0);
}
