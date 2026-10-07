// Offline regression tests; no dependencies, Node.js 12 or newer.
const assert = require('assert').strict;
const { readFileSync } = require('fs');
const { join } = require('path');
const vm = require('vm');
const tests = [];
const test = (name, run) => tests.push({ name, run });
const json = body => ({ ok: true, status: 200, json: async () => body });
const page = content => ({ query: { pages: [{ revisions: [
    { slots: { main: { content } } },
] }] } });
const results = bindings => ({ head: { vars: ['count'] }, results: { bindings } });
const flush = () => new Promise(setImmediate);

function setup() {
    const nodes = [];
    function element(tag) {
        const node = {
            tag, children: [], attributes: {}, textContent: '',
            append(child) { this.children.push(child); child.parentElement = this; },
            setAttribute(name, value) { this.attributes[name] = value; },
            addEventListener() {},
            set innerHTML(value) { throw new Error('Unexpected HTML insertion: ' + value); },
        };
        nodes.push(node);
        return node;
    }
    const content = element('main');
    const requests = [];
    const tables = [];
    const replies = [];
    let resolveTemplate, rejectTemplate;
    const select = selector => nodes.find(node => '#' + node.attributes.id === selector);
    const context = vm.createContext({
        window: { location: { hash: '#author/Q42' } }, navigator: { language: 'en' }, URL,
        document: { createElement: element, getElementById: () => content, querySelector: select },
        $: selector => ({
            append: node => (selector === '#content' ? content : select(selector)).append(node),
            DataTable: options => tables.push({ selector, options }),
        }),
        fetch: (url, options) => {
            requests.push({ url, options });
            if (options.method !== 'POST') {
                return new Promise((resolve, reject) => {
                    resolveTemplate = resolve; rejectTemplate = reject;
                });
            }
            const reply = replies.shift();
            return reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply);
        },
    });
    for (const name of ['config.js', 'synia.js']) {
        vm.runInContext(readFileSync(join(__dirname, '../site/js', name), 'utf8'), context);
    }
    return { context, nodes, tables, requests, content,
        warnings: () => nodes.filter(node => node.className === 'synia-warning'),
        async template(reply) {
            if (reply instanceof Error) rejectTemplate(reply); else resolveTemplate(reply);
            await flush();
        },
        query(reply, id = 'table') {
            const parent = element('div');
            const table = element('table');
            table.setAttribute('id', id);
            parent.append(table);
            content.append(parent);
            replies.push(reply);
            return context.sparqlToDataTable('SELECT ?count WHERE {}', '#' + id);
        },
    };
}

test('HTTP failures show their status without parsing the error body', async () => {
    for (const status of [403, 404, 429, 500, 503]) {
        const env = setup();
        let parsed = false;
        const reply = { ok: false, status, json() { parsed = true; throw new Error('HTML body'); } };
        await env.template(reply);
        await env.query(reply);
        assert.equal(parsed, false);
        assert.equal(env.tables.length, 0);
        assert.equal(env.warnings()[0].textContent, 'Could not load template for author: HTTP ' + status + '.');
        assert.equal(env.warnings()[1].textContent, 'SPARQL query failed: HTTP ' + status + '.');
    }
});

test('network and invalid JSON failures are visible for templates and queries', async () => {
    for (const [reply, expected] of [
        [new Error('Failed to fetch'), /Request failed \(network, CORS, or blocked redirect\)/],
        [{ ok: true, json: async () => { throw new SyntaxError('<html>'); } }, /Could not read response as JSON/],
        [{ ok: true, json: async () => { throw new TypeError('Body read failed'); } }, /Could not read response as JSON/],
    ]) {
        const env = setup();
        await env.template(reply);
        await env.query(reply);
        assert.equal(env.warnings().length, 2);
        for (const warning of env.warnings()) {
            assert(expected.test(warning.textContent));
            assert.equal(warning.attributes.role, 'alert');
        }
        assert.equal(env.tables.length, 0);
    }
});

test('API errors are plain text and do not offer to define a missing page', async () => {
    const env = setup();
    const payload = '<img src=x onerror="alert(1)">';
    await env.template(json({ error: { code: 'permissiondenied', info: payload } }));
    const warning = env.warnings()[0];
    assert(warning.textContent.includes('Template API error: ' + payload));
    assert.equal(warning.children.length, 0);
    assert.equal(env.nodes.filter(node => node.tag === 'img' || node.tag === 'a').length, 0);
    assert.equal(env.requests.length, 1);
});

test('malformed or unavailable template content is not treated as a missing page', async () => {
    for (const body of [null, {}, { query: { pages: [] } }, { query: { pages: [null] } },
        { query: { pages: [{}] } }, { query: { pages: [{ revisions: [] }] } }, page(null)]) {
        const env = setup();
        await env.template(json(body));
        assert.equal(env.warnings().length, 1);
        assert(env.warnings()[0].textContent.startsWith('Could not load template for author:'));
        assert.equal(env.nodes.filter(node => node.tag === 'a').length, 0);
    }
});

test('a genuinely missing template retains its Define link', async () => {
    const env = setup();
    await env.template(json({ query: { pages: [{ missing: true }] } }));
    const warning = env.warnings()[0];
    assert.equal(warning.textContent, 'Missing template for author: ');
    assert.equal(warning.children[0].textContent, 'Define');
    assert.equal(warning.children[0].attributes.href,
        env.context.window.configuration.templateBaseUrl + 'author');
});

test('empty or unsupported templates show a useful message', async () => {
    for (const content of ['', 'Plain text without supported panels']) {
        const env = setup();
        await env.template(json(page(content)));
        assert(env.warnings()[0].textContent.includes('no supported headings or SPARQL panels'));
    }
});

test('a malformed recognized SPARQL panel does not suppress later content', async () => {
    const env = setup();
    await env.template(json(page('{{SPARQL\n| wrong = value\n}}\n== Later heading ==')));
    assert.equal(env.warnings().length, 1);
    assert(env.warnings()[0].textContent.includes('Malformed SPARQL panel'));
    assert.equal(env.nodes.find(node => node.tag === 'h2').textContent.trim(), 'Later heading');
});

test('invalid SPARQL result structures are rejected before DataTables initialization', async () => {
    for (const body of [null, {}, { boolean: true }, { head: { vars: [null] }, results: { bindings: [] } },
        { head: { vars: ['count'] }, results: { bindings: {} } },
        results([null]), results([[]]), results([{ count: null }]),
        results([{ count: { value: 42 } }]),
        { head: { vars: [] }, results: { bindings: [] } },
        { head: { vars: ['countLabel'] }, results: { bindings: [] } }]) {
        const env = setup();
        await env.query(json(body));
        assert.equal(env.tables.length, 0);
        assert.equal(env.warnings().length, 1);
        assert(env.warnings()[0].textContent.startsWith('SPARQL query failed:'));
    }
});

test('a failed query is isolated while empty results and unbound cells still render', async () => {
    const env = setup();
    await Promise.all([
        env.query({ ok: false, status: 503 }, 'failed'),
        env.query(json(results([])), 'empty'),
        env.query(json(results([{}, { count: { type: 'literal', value: '2' } } ])), 'values'),
    ]);
    assert.equal(env.warnings().length, 1);
    assert.equal(env.warnings()[0].parentElement.children[0].attributes.id, 'failed');
    assert.deepEqual(env.tables.map(table => table.selector), ['#empty', '#values']);
    assert.equal(env.tables[0].options.data.length, 0);
    assert.equal(env.tables[1].options.data[0][0].text, '');
    assert.equal(env.tables[1].options.data[1][0].text, '2');
    for (const request of env.requests.slice(1)) {
        assert.equal(request.options.redirect, 'error');
    }
});

(async () => {
    for (const { name, run } of tests) {
        await run();
        console.log('PASS ' + name);
    }
    console.log(tests.length + ' fetch/error-handling tests passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
