const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Exercise component handlers with isolated hooks and mocked API/image IO.
function mount(file, props, imports) {
  let cursor = 0;
  const slots = [], effects = [];
  const jsx = (type, props, key) => ({ type, props, key });
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useEffect(callback, deps) {
      const index = cursor++;
      if (!slots[index] || deps.some((value, i) => value !== slots[index][i])) effects.push(callback);
      slots[index] = deps;
    },
  };
  const sandbox = { exports: {}, AbortController, URL, URLSearchParams, Intl, Date, Set,
    require(name) {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
      if (name.endsWith('.css')) return {};
      if (name in imports) return imports[name];
      throw new Error(`Unexpected import: ${name}`);
    },
  };
  const source = fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, sandbox);
  return { render() { cursor = 0; const tree = sandbox.exports.default(props); while (effects.length) effects.shift()(); return tree; } };
}

function nodes(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap(child => nodes(child, predicate));
  if (!tree || typeof tree !== 'object') return [];
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}
const settle = () => new Promise(resolve => setImmediate(resolve));
const people = Array.from({ length: 12 }, (_, index) => ({ employeeId: `e${index}`, employeeName: `Employee ${index}`, city: 'Jammu', studentsAttended: index, photo: { url: `/photo/${index}` } }));

async function generate(excluded, sources = people) {
  const batches = [];
  const app = mount('components/ReportCollages.tsx', { date: '2026-11-19', employeeId: '', excludedEmployeeIds: new Set(excluded) }, {
    '../api': { api: async () => sources },
    '../utils/reportCollage': { COLLAGE_PHOTO_LIMIT: 9, renderCollage: async batch => { batches.push(batch); return new Blob(['jpg']); } },
  });
  nodes(app.render(), node => node.type === 'button')[0].props.onClick();
  await settle();
  return { tree: app.render(), batches };
}

test('employees default to included and are grouped into nine-photo collages', async () => {
  const { batches } = await generate([]);
  assert.deepEqual(batches.map(batch => batch.length), [9, 3]);
  assert.equal(new Set(batches.flat().map(person => person.employeeId)).size, 12);
});

test('excluded employees and their attendance never reach the renderer', async () => {
  const { batches } = await generate(['e0', 'e4', 'e11']);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].length, 9);
  assert.ok(batches.flat().every(person => !['e0', 'e4', 'e11'].includes(person.employeeId)));
});

test('an excluded employee with a missing photo does not block generation', async () => {
  const { batches, tree } = await generate(['e0'], [{ ...people[0], photo: null }, people[1]]);
  assert.equal(batches[0][0].employeeId, 'e1');
  assert.equal(nodes(tree, node => node.props?.role === 'alert').length, 0);
});

test('switching everyone off produces an actionable message and no images', async () => {
  const { batches, tree } = await generate(people.map(person => person.employeeId));
  assert.equal(batches.length, 0);
  assert.match(nodes(tree, node => node.props?.role === 'alert')[0].props.children, /Switch on at least one employee/);
  assert.equal(nodes(tree, node => node.type === 'img').length, 0);
});

test('row switches synchronize by employee, invalidate previews, and reset for a new date', async () => {
  const Collages = () => null;
  const reports = [people[0], people[0], people[1]].map((person, index) => ({ ...person, id: `r${index}`, date: '2026-11-19', photos: [] }));
  const app = mount('pages/shared/DailyReportsPage.tsx', {}, {
    'lucide-react': {}, 'react-router-dom': { Link: 'a' },
    '../../state/session': { useCurrentUser: () => ({ role: 'MAIN_ADMIN', name: 'Admin' }) },
    '../../components/ReportCollages': { __esModule: true, default: Collages },
    '../../api': { api: async path => path.includes('/summary') ? { date: '2026-11-19', employees: [] } : reports },
  });
  app.render(); await settle();
  let tree = app.render();
  const switches = () => nodes(tree, node => node.props?.role === 'switch');
  assert.equal(switches().length, 3);
  assert.ok(switches().every(node => node.props.checked));
  const originalKey = nodes(tree, node => node.type === Collages)[0].key;
  switches()[0].props.onChange({ target: { checked: false } });
  tree = app.render();
  assert.deepEqual(switches().map(node => node.props.checked), [false, false, true]);
  const collage = nodes(tree, node => node.type === Collages)[0];
  assert.ok(collage.props.excludedEmployeeIds.has('e0'));
  assert.notEqual(collage.key, originalKey);
  switches()[0].props.onChange({ target: { checked: true } }); tree = app.render();
  assert.ok(switches().every(node => node.props.checked));
  switches()[0].props.onChange({ target: { checked: false } }); tree = app.render();
  nodes(tree, node => node.type === 'input' && node.props.type === 'date')[0].props.onChange({ target: { value: '2026-11-18' } });
  tree = app.render();
  assert.ok(switches().every(node => node.props.checked));
});
