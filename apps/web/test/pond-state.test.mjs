import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Run the dependency-free UI policy without Next.js or a database.
const source = readFileSync(new URL('../src/lib/pond-state.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { pondState } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const pond = (fields = {}) => ({ lastReadingAt: new Date().toISOString(), worstSeverity: null, ...fields });

test('missing and invalid timestamps cannot produce a healthy state', () => {
  for (const lastReadingAt of [null, '', 'invalid']) assert.equal(pondState(pond({ lastReadingAt })).tone, 'watch');
});
test('old and future-dated readings need review', () => {
  assert.equal(pondState(pond({ lastReadingAt: new Date(Date.now() - 7 * 3600000).toISOString() })).word, 'Out of date');
  assert.equal(pondState(pond({ lastReadingAt: new Date(Date.now() + 3600000).toISOString() })).word, 'Check reading time');
});
test('critical alerts retain priority even with missing readings', () => {
  assert.equal(pondState(pond({ worstSeverity: 'critical', lastReadingAt: null })).tone, 'bad');
  assert.equal(pondState(pond({ worstSeverity: 'warning' })).tone, 'watch');
});
test('absence of alerts does not guarantee healthy growth', () => {
  const state = pondState(pond());
  assert.equal(state.tone, 'ok');
  assert.equal(state.word, 'No urgent alerts');
  assert.ok(!state.line.includes('Nothing needs doing'));
});
