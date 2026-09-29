const fs = require('fs');
const path = require('path');

const frontendDir = path.join(__dirname, '..', 'frontend');
const htmlFiles = fs.readdirSync(frontendDir).filter(f => f.endsWith('.html'));

let totalIssues = 0;

for (const file of htmlFiles) {
  const filePath = path.join(frontendDir, file);
  const content = fs.readFileSync(filePath, 'utf8');
  const issues = [];

  // 1. Check doctype, head, body
  if (!content.includes('<!DOCTYPE html>') && !content.includes('<!doctype html>')) {
    if (file !== 'navbar.html') issues.push('Missing <!DOCTYPE html>');
  }
  if (!content.includes('<html') && file !== 'navbar.html') issues.push('Missing <html>');
  if (!content.includes('</html>') && file !== 'navbar.html') issues.push('Missing </html>');
  if (!content.includes('<head>') && file !== 'navbar.html') issues.push('Missing <head>');
  if (!content.includes('</head>') && file !== 'navbar.html') issues.push('Missing </head>');
  if (!content.includes('<body') && file !== 'navbar.html') issues.push('Missing <body>');
  if (!content.includes('</body>') && file !== 'navbar.html') issues.push('Missing </body>');

  // 2. Check for duplicate IDs
  const idMatches = content.matchAll(/\sid=["']([^"']+)["']/g);
  const seenIds = new Set();
  const dupIds = new Set();
  for (const match of idMatches) {
    const id = match[1];
    if (seenIds.has(id)) {
      dupIds.add(id);
    }
    seenIds.add(id);
  }
  if (dupIds.size > 0) {
    issues.push(`Duplicate ID(s) found: ${Array.from(dupIds).join(', ')}`);
  }

  // 3. Check local script & link src/href existence
  const srcMatches = content.matchAll(/(?:src|href)=["'](\/[^"']+)["']/g);
  for (const match of srcMatches) {
    let assetPath = match[1];
    // Ignore external, http, hash, or data URLs
    if (assetPath.startsWith('//') || assetPath.startsWith('/api') || assetPath.startsWith('/uploads')) continue;
    
    // Strip query string and hash
    const cleanPath = assetPath.split('?')[0].split('#')[0];
    if (!cleanPath || cleanPath === '/') continue;

    // Check if asset exists in frontend
    const localAssetPath = path.join(frontendDir, cleanPath.replace(/^\//, ''));
    if (!fs.existsSync(localAssetPath)) {
      // Check if it's a page link like /book.html
      if (cleanPath.endsWith('.html')) {
        issues.push(`Broken page link: ${assetPath}`);
      } else {
        issues.push(`Missing static asset: ${assetPath}`);
      }
    }
  }

  if (issues.length === 0) {
    console.log(`✅ [PASS] ${file} (0 issues, ${seenIds.size} unique IDs)`);
  } else {
    console.log(`❌ [FAIL] ${file}:`);
    issues.forEach(i => console.log(`   - ${i}`));
    totalIssues += issues.length;
  }
}

console.log(`\n========================================`);
console.log(`HTML AUDIT COMPLETED: ${totalIssues} issue(s) detected across ${htmlFiles.length} files.`);
process.exit(totalIssues > 0 ? 1 : 0);
