// Dependency-free regression tests; runnable with Node.js 12 or newer.
const assert = require('assert').strict;
const { readFileSync } = require('fs');
const { join } = require('path');
const vm = require('vm');
const source = name => readFileSync(join(__dirname, '../site/js', name), 'utf8');

function load(hash) {
    const requests = [];
    const context = vm.createContext({
        window: { addEventListener() {}, location: { hash } }, navigator: { language: 'en' }, URL,
        document: { getElementById: () => ({ textContent: '' }) },
        // Existing global properties must not be overwritten by app variables.
        q1: 'existing q1', q2: 'existing q2',
        languages: 'existing languages', lang: 'existing lang',
        fetch: url => { requests.push(url); return new Promise(() => {}); },
    });
    vm.runInContext(source('config.js'), context);
    vm.runInContext(source('synia.js'), context);
    return { context, requests };
}

const routes = [
    ['', 'index', null, null, null],
    ['#author', 'author-index', null, null, null],
    ['#author/Q42', 'author', 'Q42', null, null],
    ['#lexeme/L123', 'lexeme', 'L123', null, null],
    ['#author/Q42/topic', 'author-topic-index', 'Q42', null, null],
    ['#author/Q42/topic/Q123', 'author-topic', null, 'Q42', 'Q123'],
];
for (const [hash, aspect, q, q1, q2] of routes) {
    const { context, requests } = load(hash);
    assert.deepEqual(Array.from(vm.runInContext('Object.values(routeFromHash(window.location.hash))', context)),
        [aspect, q, q1, q2], hash);
    assert.equal(context.q1, 'existing q1');
    assert.equal(context.q2, 'existing q2');
    assert.equal(requests.length, 1);
    assert.equal(new URL(requests[0]).searchParams.get('titles'),
        context.window.configuration.namespace + aspect);
}
console.log('PASS route startup preserves targets without overwriting global properties');

const { context } = load('');
const entity = { id: 'Q42', labels: {
    de: { value: 'German' }, da: { value: 'Danish' }, en: { value: 'English' },
} };
assert.equal(context.entityToLabel(entity, 'de'), 'German');
assert.equal(context.entityToLabel(entity, 'it'), 'English');
delete entity.labels.en;
assert.equal(context.entityToLabel(entity, 'it'), 'Danish');
delete entity.labels.da;
assert.equal(context.entityToLabel(entity, 'it'), 'German');
assert.equal(context.entityToLabel({ id: 'Q42', labels: {} }), 'Q42');
assert.equal(context.languages, 'existing languages');
assert.equal(context.lang, 'existing lang');
console.log('PASS label fallback uses language codes in order without leaking globals');
