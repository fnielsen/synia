// Dependency-free regression tests; runnable with Node.js 12 or newer.
const assert = require('assert').strict;
const { readFileSync } = require('fs');
const { join } = require('path');
const vm = require('vm');
const tests = [];
const test = (name, run) => tests.push({ name, run });
const source = name => readFileSync(join(__dirname, '../site/js', name), 'utf8');

function setup() {
    const nodes = [];
    // Model DOM text/attribute serialization, and reject application HTML writes.
    const escape = value => String(value).replace(/&/g, '&amp;')
        .replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    function element(tag) {
        const node = {
            tag, textContent: '', attributes: {}, children: [], listeners: {},
            append(child) { this.children.push(child); child.parentElement = this; },
            setAttribute(name, value) { this.attributes[name] = value; },
            getAttribute(name) { return this.attributes[name] || null; },
            addEventListener(name, listener) { this.listeners[name] = listener; },
            closest() { return this.tag === 'a' ? this : null; },
            set innerHTML(value) { throw new Error('Unsafe HTML write: ' + value); },
            get outerHTML() {
                const attrs = Object.keys(this.attributes).map(name =>
                    ` ${name}="${escape(this.attributes[name])}"`).join('');
                return `<${tag}${attrs}>${escape(this.textContent)}</${tag}>`;
            },
        };
        nodes.push(node);
        return node;
    }
    const content = element('main');
    const table = element('table');
    content.append(table);
    const tables = [];
    let resolveTemplate;
    const state = { reloads: 0, response: null };
    const context = vm.createContext({
        window: { addEventListener() {}, location: { hash: '', reload() { state.reloads++; } } },
        navigator: { language: 'en' }, URL, console,
        document: { createElement: element, getElementById: () => content,
            querySelector: () => table },
        $: () => ({ append: node => content.append(node),
            DataTable: options => tables.push(options) }),
        fetch: (url, options) => options.method === 'POST' ?
            Promise.resolve({ ok: true, json: async () => state.response }) :
            new Promise(resolve => { resolveTemplate = resolve; }),
    });
    vm.runInContext(source('config.js'), context);
    context.window.configuration.layout = {};
    vm.runInContext(source('templates.js'), context);
    vm.runInContext(source('search.js'), context);
    vm.runInContext(source('synia.js'), context);
    return { context, state, nodes, tables, table, content,
        missingTemplate: () => resolveTemplate({ ok: true,
            json: async () => ({ query: { pages: [{ missing: true }] } }) }) };
}

const { context: app, state } = setup();
const payload = '<img src=x onerror="alert(1)"> & <svg/onload=alert(2)>';

test('labels are passed to textContent, never HTML', () => {
    const link = app.createSafeLink(payload, 'https://example.org/');
    assert.equal(link.tag, 'a');
    assert.equal(link.textContent, payload);
    assert.deepEqual(Object.keys(link.attributes), ['href']);
    assert.equal(link.children.length, 0);
    const display = app.renderResultCell({ text: payload, url: 'https://example.org/' }, 'display');
    assert(!display.includes('<img'));
    assert(display.includes('&lt;img'));
});

test('unsafe and ambiguous URLs become plain text', () => {
    for (const url of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<svg>',
        'vbscript:msgbox(1)', 'file:///etc/passwd', '//example.org/', '/relative',
        ' javascript:alert(1)', 'java\nscript:alert(1)', 'https://user:pass@example.org/',
        'https://', 'https://example.org/" onclick="alert(1)', null]) {
        const node = app.createSafeLink(payload, url);
        assert.equal(node.tag, 'span', String(url));
        assert.equal(node.textContent, payload);
        assert.equal(Object.keys(node.attributes).length, 0);
    }
});

test('HTTP(S) and internal hash URLs remain usable without inline attributes', () => {
    for (const url of ['https://example.org/?q="<svg>&x=1', 'http://localhost:8080/',
        '#author/Q42', "#item/Q42';alert(1);//"]) {
        const node = app.createSafeLink(payload, url);
        assert.equal(node.tag, 'a', url);
        assert.equal(Object.keys(node.attributes).join(','), 'href');
        assert.equal(node.textContent, payload);
    }
});

test('filter values are escaped while sorting retains numeric/date/text values', () => {
    assert.equal(app.renderResultCell({ text: payload }, 'filter'),
        payload.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
    for (const text of ['10', '2', '2026-10-07', 'Årup & Nielsen']) {
        assert.equal(app.renderResultCell({ text }, 'sort'), text);
        assert.equal(app.renderResultCell({ text }, 'type'), text);
    }
});

test('column conventions and unbound values preserve plain text and separate URLs', () => {
    const result = app.convertDataTableData([{ item: 'Q42', itemLabel: payload,
        itemUrl: '#item/Q42', itemDescription: payload, url: 'https://example.org/', count: '2' }, {}],
    ['item', 'itemLabel', 'itemUrl', 'itemDescription', 'url', 'count']);
    assert.deepEqual(Array.from(result.columns), ['item', 'item description', 'url', 'count']);
    assert.equal(result.data[0][0].text, payload);
    assert.equal(result.data[0][0].url, '#item/Q42');
    assert.equal(result.data[0][1].text, payload);
    assert.equal(result.data[0][2].url, 'https://example.org/');
    assert.equal(result.data[1][0].text, '');
    assert(Array.isArray(result.data[0]));
});

test('reserved variable names remain data and cannot alter prototypes or row attributes', () => {
    const simple = app.sparqlDataToSimpleData({ head: { vars: ['__proto__', 'DT_RowAttr'] },
        results: { bindings: [JSON.parse('{"__proto__":{"value":"text"},"DT_RowAttr":{"value":"onclick"}}')] } });
    assert.equal(Object.getPrototypeOf(simple.data[0]), null);
    const converted = app.convertDataTableData(simple.data, simple.columns);
    assert.equal(converted.data[0][0].text, 'text');
    assert.equal(converted.data[0][1].text, 'onclick');
    assert.equal(converted.data[0].DT_RowAttr, undefined);
});

test('plain internal clicks navigate without reloading; modifier clicks stay native', () => {
    const link = app.createSafeLink('Item', '#item/Q42');
    const event = { target: link, button: 0, preventDefault() { this.prevented = true; } };
    app.followSyniaLink(event);
    app.followSyniaLink(event);
    assert.equal(state.reloads, 0);
    assert.equal(app.window.location.hash, '#item/Q42');
    assert.equal(event.prevented, true);
    for (const overrides of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true },
        { altKey: true }, { button: 1 }, { defaultPrevented: true },
        { target: app.createSafeLink('External', 'https://example.org/') }]) {
        app.followSyniaLink(Object.assign({}, event, overrides, {
            preventDefault() { throw new Error('Should preserve native navigation'); },
        }));
    }
    assert.equal(state.reloads, 0);
});

test('table integration escapes headings, uses numeric indexes, and registers a listener', async () => {
    const env = setup();
    env.state.response = { head: { vars: ['<img/src=x/onerror=alert(1)>', 'a.b'] },
        results: { bindings: [{}] } };
    await env.context.sparqlToDataTable('SELECT * WHERE {}', '#table');
    assert.equal(env.tables.length, 1);
    const columns = env.tables[0].columns;
    assert(!columns[0].title.includes('<'));
    assert.equal(columns[0].data, 0);
    assert.equal(columns[1].data, 1);
    assert.equal(columns[0].render, env.context.renderResultCell);
    assert.equal(env.table.listeners.click, env.context.followSyniaLink);
});

test('missing-template message uses DOM text and a validated Define link', async () => {
    const env = setup();
    env.context.window.configuration.templateBaseUrl = 'javascript:alert(1)//';
    env.missingTemplate();
    await new Promise(setImmediate);
    const warning = env.nodes.find(node => node.className === 'synia-warning');
    assert.equal(warning.textContent, 'Missing template for index: ');
    assert.equal(warning.children[0].tag, 'span');
    assert.equal(warning.children[0].textContent, 'Define');
});

(async () => {
    for (const { name, run } of tests) {
        await run();
        console.log('PASS ' + name);
    }
    console.log(tests.length + ' result-rendering tests passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
