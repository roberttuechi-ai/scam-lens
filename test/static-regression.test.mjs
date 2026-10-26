import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const hasId = (id) => new RegExp("\\bid=[\"']" + id + "[\"']").test(html);

test('HTML element IDs are unique', () => {
  const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]);
  assert.equal(ids.length, new Set(ids).size, 'duplicate HTML IDs can break controls and result rendering');
});

test('core input, analysis, link-check and report controls remain present', () => {
  for (const id of ['appLanguage', 'sourceText', 'sourceCamera', 'sourceFile', 'file', 'msg', 'aiStart', 'liveLinkCheck', 'check', 'reportSpeak', 'reportStop', 'report', 'riskbox', 'analysisProgress']) {
    assert.ok(hasId(id), 'required control #' + id + ' is missing');
  }
});

test('German and English language options remain available', () => {
  const selector = html.match(/<select\b[^>]*\bid=["']appLanguage["'][^>]*>([\s\S]*?)<\/select>/i);
  assert.ok(selector, 'language selector is missing');
  assert.match(selector[1], /<option\b[^>]*value=["']de["']/i);
  assert.match(selector[1], /<option\b[^>]*value=["']en["']/i);
});

test('file upload retains supported formats and the 15 MB limit', () => {
  const input = html.match(/<input\b(?=[^>]*\bid=["']file["'])[^>]*>/i);
  assert.ok(input, 'file input is missing');
  for (const type of ['image/*', '.pdf', '.txt', '.eml', '.html', '.htm', '.msg', '.oft', '.mbox', '.mht', '.mhtml', '.ics', '.vcf']) {
    assert.ok(input[0].includes(type), 'supported upload type ' + type + ' is missing');
  }
  assert.match(html, /file\.size\s*>\s*15\s*\*\s*1024\s*\*\s*1024/);
  assert.match(html, /Maximal 15 MB pro Datei/);
});

test('OCR integration and its load-error path remain present', () => {
  assert.match(html, /tesseract\.js@5/);
  assert.match(html, /window\.Tesseract\.recognize\(chosenFile/);
  assert.match(html, /OCR-Bibliothek konnte nicht geladen werden/);
});

test('local and AI analysis entry points remain present', () => {
  assert.match(html, /function localAnalysis\(text\)/);
  assert.match(html, /async function scamLensGeminiAI\(text, language\)/);
});

test('AI analysis requires explicit confirmation before sending text to Gemini', () => {
  const start = html.indexOf('$("aiStart").addEventListener("click", async () => {');
  const end = html.indexOf('$("reportSpeak").addEventListener', start);
  assert.ok(start >= 0 && end > start, 'AI analysis handler boundaries not found');
  const handler = html.slice(start, end);
  const consent = handler.indexOf('window.confirm(');
  const request = handler.indexOf('await scamLensGeminiAI(text, language)');
  assert.ok(consent >= 0 && request > consent, 'external AI request must remain after consent');
});

test('live link check asks consent and caps Phishunt requests at five URLs', () => {
  const start = html.indexOf('$("liveLinkCheck").addEventListener("click", async () => {');
  const end = html.indexOf('$("testAI").addEventListener', start);
  assert.ok(start >= 0 && end > start, 'live link-check handler boundaries not found');
  const handler = html.slice(start, end);
  const consent = handler.indexOf('window.confirm(');
  const request = handler.indexOf('https://phishunt.io/api/v1/analyze?url=');
  assert.match(handler, /extracted\.slice\(0,\s*5\)/);
  assert.ok(consent >= 0 && request > consent, 'Phishunt request must remain after consent');
});

test('report speech controls remain available', () => {
  assert.match(html, /\$\("reportSpeak"\)\.addEventListener/);
  assert.match(html, /\$\("reportStop"\)\.addEventListener/);
  assert.match(html, /window\.speechSynthesis\.speak\(utterance\)/);
});

test('all target=_blank anchors include noopener and noreferrer', () => {
  const anchors = [...html.matchAll(/<a\b[^>]*target=["']_blank["'][^>]*>/gi)].map((match) => match[0]);
  assert.ok(anchors.length > 0, 'expected at least one external target=_blank link');
  for (const anchor of anchors) {
    const rel = (anchor.match(/\brel=["']([^"']+)["']/i) || [])[1] || '';
    const tokens = rel.toLowerCase().split(/\s+/);
    assert.ok(tokens.includes('noopener') && tokens.includes('noreferrer'), 'unsafe target=_blank anchor: ' + anchor.slice(0, 160));
  }
});
