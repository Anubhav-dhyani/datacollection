const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/utils/reportCollage.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;

function setup({ failFetch = false, failEncode = false, abortAfterDecode = false } = {}) {
  const labels = [], draws = [], fetched = [];
  let closed = 0;
  const controller = new AbortController();
  const context = {
    fillRect() {},
    createLinearGradient: () => ({ addColorStop() {} }),
    measureText(text) { return { width: text.length * 20 }; },
    fillText(text, x, y) { labels.push({ text, x, y }); },
    drawImage(image, x, y, width, height) { draws.push({ image, x, y, width, height }); },
  };
  const canvas = { width: 0, height: 0, getContext: () => context, toBlob: callback => callback(failEncode ? null : new Blob(['jpg'], { type: 'image/jpeg' })) };
  const sandbox = {
    exports: {}, document: { createElement: () => canvas },
    fetch: async (url, options) => {
      assert.equal(options.credentials, 'include');
      assert.equal(options.signal, controller.signal);
      fetched.push(url);
      return { ok: !failFetch, blob: async () => new Blob(['photo']) };
    },
    createImageBitmap: async () => {
      if (abortAfterDecode) controller.abort();
      return { width: 1800, height: 1200, close() { closed++; } };
    },
  };
  vm.runInNewContext(compiled, sandbox);
  return { render: sandbox.exports.renderCollage, canvas, labels, draws, fetched, controller, closed: () => closed };
}

function employees(count) {
  return Array.from({ length: count }, (_, index) => ({ employeeId: `employee-${index}`, employeeName: `Employee ${index}`, city: `City ${index}`, studentsAttended: index, photo: { url: `/api/v1/uploads/photo-${index}` } }));
}

for (let count = 1; count <= 7; count++) {
  test(`renders ${count} employees once each, with complete photos and matching captions`, async () => {
    const env = setup();
    const blob = await env.render(employees(count), '2026-11-19', 1, 2, env.controller.signal);
    assert.equal(blob.type, 'image/jpeg');
    assert.equal(env.draws.length, count);
    assert.equal(new Set(env.fetched).size, count);
    assert.equal(env.closed(), count);
    for (let index = 0; index < count; index++) {
      assert.ok(env.labels.some(label => label.text === `City ${index} · ${index} students`));
      assert.ok(env.labels.some(label => label.text === `Employee ${index}`));
      const draw = env.draws[index];
      assert.equal(draw.width / draw.height, 1.5, 'Full image aspect ratio is preserved.');
      assert.ok(draw.x >= 18 && draw.x + draw.width <= 2382);
      assert.ok(draw.y >= 118 && draw.height <= 720);
    }
    assert.equal(env.canvas.width, 0, 'Canvas memory is released.');
  });
}

test('labels unavailable attendance as N/A and retains zero as a count', async () => {
  const env = setup(), people = employees(3);
  people[1].studentsAttended = 'NA';
  people[2].studentsAttended = null;
  await env.render(people, '2026-11-19', 1, 1, env.controller.signal);
  assert.ok(env.labels.some(label => label.text === 'City 0 · 0 students'));
  assert.equal(env.labels.filter(label => label.text.includes('Students: N/A')).length, 2);
});

test('failed photo identifies employee and fails the whole collage', async () => {
  const env = setup({ failFetch: true });
  await assert.rejects(env.render(employees(2), '2026-11-19', 1, 1, env.controller.signal), /Employee 0/);
  assert.equal(env.canvas.width, 0);
});

test('cancellation releases a decoded photo and canvas', async () => {
  const env = setup({ abortAfterDecode: true });
  await assert.rejects(env.render(employees(2), '2026-11-19', 1, 1, env.controller.signal), { name: 'AbortError' });
  assert.equal(env.closed(), 1);
  assert.equal(env.draws.length, 0);
  assert.equal(env.canvas.width, 0);
});

test('export failure is reported', async () => {
  const env = setup({ failEncode: true });
  await assert.rejects(env.render(employees(1), '2026-11-19', 1, 1, env.controller.signal), /Could not export/);
});
