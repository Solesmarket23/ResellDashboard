#!/usr/bin/env npx ts-node

import * as fs from 'fs';
import * as path from 'path';
import { parseOrderEmailFile, orderInfoToDict } from '../src/lib/email/orderConfirmationParser';

function listHtmlFiles(target: string): string[] {
  const stat = fs.statSync(target);
  if (stat.isFile()) return [target];
  const results: string[] = [];
  for (const entry of fs.readdirSync(target)) {
    const full = path.join(target, entry);
    if (fs.statSync(full).isDirectory()) {
      results.push(...listHtmlFiles(full));
    } else if (/\.(html?|eml)$/i.test(entry)) {
      results.push(full);
    }
  }
  return results;
}

function main() {
  const target = process.argv[2];
  if (!target) {
    console.error('Usage: npx ts-node scripts/parse-email-cli.ts <file-or-directory>');
    process.exit(1);
  }

  const abs = path.resolve(target.replace(/^~\//, `${process.env.HOME || ''}/`));
  if (!fs.existsSync(abs)) {
    console.error(`Not found: ${abs}`);
    process.exit(1);
  }

  const files = listHtmlFiles(abs);
  if (files.length === 0) {
    console.error('No .html or .eml files found.');
    process.exit(2);
  }

  const outputs: any[] = [];
  for (const file of files) {
    try {
      const info = parseOrderEmailFile(file);
      outputs.push({ file, ...orderInfoToDict(info) });
    } catch (e: any) {
      outputs.push({ file, error: e?.message || String(e) });
    }
  }

  console.log(JSON.stringify(outputs, null, 2));
}

main();


