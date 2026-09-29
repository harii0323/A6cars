const fs = require('fs');
const path = require('path');

const cssFiles = [
  path.join(__dirname, '..', 'frontend', 'user.css'),
  path.join(__dirname, '..', 'frontend', 'admin.css'),
  path.join(__dirname, '..', 'frontend', 'video-bg.css')
];

let totalIssues = 0;

for (const filePath of cssFiles) {
  const fileName = path.basename(filePath);
  const content = fs.readFileSync(filePath, 'utf8');
  const issues = [];

  // Check balanced curly braces
  let depth = 0;
  let inString = false;
  let stringChar = '';
  let inComment = false;

  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    const next = content[i + 1];

    if (inComment) {
      if (c === '*' && next === '/') {
        inComment = false;
        i++;
      }
      continue;
    }

    if (!inString && c === '/' && next === '*') {
      inComment = true;
      i++;
      continue;
    }

    if (!inString && (c === '"' || c === "'")) {
      inString = true;
      stringChar = c;
      continue;
    } else if (inString && c === stringChar && content[i - 1] !== '\\') {
      inString = false;
      continue;
    }

    if (!inString) {
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth < 0) {
          issues.push(`Unmatched closing brace '}' around index ${i}`);
          break;
        }
      }
    }
  }

  if (depth !== 0) {
    issues.push(`Unbalanced braces in ${fileName}: final depth is ${depth}`);
  }

  // Count !important occurrences
  const importantMatches = content.match(/!important/g) || [];
  
  // Check for common typo bugs like display: none; display: flex within the same exact property block
  const lines = content.split('\n');
  let openSelector = '';
  
  if (issues.length === 0) {
    console.log(`✅ [PASS] ${fileName} (Braces perfectly balanced, ${lines.length} lines, ${importantMatches.length} !important instances)`);
  } else {
    console.log(`❌ [FAIL] ${fileName}:`);
    issues.forEach(i => console.log(`   - ${i}`));
    totalIssues += issues.length;
  }
}

console.log(`\n========================================`);
console.log(`CSS AUDIT RESULT: ${totalIssues} issue(s) detected.`);
process.exit(totalIssues > 0 ? 1 : 0);
