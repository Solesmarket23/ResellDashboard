#!/usr/bin/env node
/**
 * Decode a quoted-printable email to HTML
 * Usage: node scripts/decode-qp-to-html.js <input.eml> <output.html>
 */

const fs = require('fs');
const path = require('path');

function exitWithUsage() {
  console.error('Usage: node scripts/decode-qp-to-html.js <input.eml> <output.html>');
  process.exit(1);
}

if (process.argv.length < 4) {
  exitWithUsage();
}

const inputPath = path.resolve(process.argv[2]);
const outputPath = path.resolve(process.argv[3]);

if (!fs.existsSync(inputPath)) {
  console.error(`Input file not found: ${inputPath}`);
  process.exit(1);
}

const raw = fs.readFileSync(inputPath, 'utf8');

// Try to isolate the HTML part by finding the first <!DOCTYPE html or <html
const doctypeIdx = raw.toLowerCase().indexOf('<!doctype html');
const htmlIdx = raw.toLowerCase().indexOf('<html');
let startIdx = -1;
if (doctypeIdx !== -1) startIdx = doctypeIdx;
else if (htmlIdx !== -1) startIdx = htmlIdx;
else startIdx = 0; // fallback to entire content

let qpHtml = raw.slice(startIdx);

function decodeQuotedPrintable(qpText) {
  // Remove soft line breaks (="\n" or ="\r\n")
  qpText = qpText.replace(/=\r?\n/g, '');
  // Decode =XX hex escapes using latin1 per iso-8859-1
  qpText = qpText.replace(/=([A-Fa-f0-9]{2})/g, (_, hex) => {
    try {
      return Buffer.from(hex, 'hex').toString('latin1');
    } catch (_) {
      return _; // return original on error
    }
  });
  return qpText;
}

const decoded = decodeQuotedPrintable(qpHtml);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, decoded, 'utf8');

console.log(`Decoded HTML written to: ${outputPath}`);



