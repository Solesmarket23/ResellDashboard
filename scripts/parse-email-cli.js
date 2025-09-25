#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Use the CJS build output from tsconfig.scripts.json
const parser = require('./build/src/lib/email/orderConfirmationParser.js');

function listFiles(targetPath) {
  const stat = fs.statSync(targetPath);
  if (stat.isFile()) return [targetPath];
  const files = [];
  for (const entry of fs.readdirSync(targetPath)) {
    const full = path.join(targetPath, entry);
    const est = fs.statSync(full);
    if (est.isDirectory()) files.push(...listFiles(full));
    else if (/\.(html?|eml)$/i.test(entry)) files.push(full);
  }
  return files;
}

function main() {
  const input = process.argv[2];
  if (!input) {
    console.error('Usage: node scripts/parse-email-cli.js <file-or-directory>');
    process.exit(1);
  }

  const normalized = input.replace(/^~\//, `${process.env.HOME || ''}/`);
  const abs = path.resolve(normalized);
  if (!fs.existsSync(abs)) {
    console.error(`Not found: ${abs}`);
    process.exit(1);
  }

  const targets = listFiles(abs);
  if (targets.length === 0) {
    console.error('No .html or .eml files found.');
    process.exit(2);
  }

  const outputs = [];
  for (const file of targets) {
    try {
      const info = parser.parseOrderEmailFile(file);
      const dict = parser.orderInfoToDict(info);
      outputs.push({ file, ...dict });
    } catch (e) {
      outputs.push({ file, error: e?.message || String(e) });
    }
  }

  console.log(JSON.stringify(outputs, null, 2));
}

main();


