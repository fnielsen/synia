const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = name => readFileSync(join(__dirname, '../site/js', name), 'utf8');
const panel = (endpoint = '', embed = false) =>
    `{{SPARQL\n${endpoint ? '| endpoint = ' + endpoint + '\n' : ''}| query =\n` +
    `${embed ? '#defaultView:Graph\n' : ''}SELECT * WHERE {}\n}}`;

// Exercise the real renderer with a minimal DOM and no external requests.
async function load(template, configure = () => {}, rejectQuery = false) {
    const nodes = [];
    function element(tagName) {
        const node = {
            tagName, children: [], attributes: {},
            setAttribute(name, value) { this.attributes[name] = value; },
            addEventListener() {},
            append(child) { this.children.push(child); child.parentElement = this; },
            set innerHTML(value) { throw new Error('Unexpected HTML insertion: ' + value); },
        };
        nodes.push(node);
        return node;
    }
    const content = element('main');
    const requests = [];
    const tables = [];
    const errors = [];
    const context = vm.createContext({
        window: { location: { hash: '' } }, navigator: { language: 'en' }, URL,
        console: { log: error => errors.push(error) },
        document: {
            createElement: element,
            getElementById: () => content,
            querySelector: selector => nodes.find(node => '#' + node.attributes.id === selector),
        },
        $: selector => ({
            append: node => (selector === '#content' ? content :
                nodes.find(node => '#' + node.attributes.id === selector)).append(node),
            DataTable: options => tables.push(options),
        }),
        fetch: async (url, options) => {
            requests.push({ url, options });
            if (options.method === 'POST') {
                if (rejectQuery) throw new Error('Query request failed (e.g. redirect rejected).');
                return { json: async () => ({ head: { vars: ['count'] },
                    results: { bindings: [{ count: { value: '1' } }] } }) };
            }
            return { json: async () => ({ query: { pages: [{ revisions: [
                { slots: { main: { content: template } } },
            ] }] } }) };
        },
    });
    vm.runInContext(source('config.js'), context);
    configure(context.window.configuration);
    vm.runInContext(source('synia.js'), context);
    await new Promise(setImmediate);
    assert.deepEqual(errors, [], 'renderer should not abort');
    return { context, nodes, tables, requests,
        queries: requests.filter(request => request.options.method === 'POST'),
        frames: nodes.filter(node => node.tagName === 'iframe'),
        warnings: nodes.filter(node => node.className === 'synia-warning') };
}

test('shipped configuration renders tables and keeps the Wikidata query link', async () => {
    const result = await load(panel());
    assert.equal(result.queries.length, 1);
    assert.equal(result.queries[0].url, 'https://query.wikidata.org/sparql');
    assert.equal(result.queries[0].options.redirect, 'error');
    assert.equal(result.tables.length, 1);
    assert.equal(result.warnings.length, 0);
    const query = new URLSearchParams(result.queries[0].options.body).get('query');
    assert.equal(result.nodes.find(node => node.tagName === 'a').href,
        'https://query.wikidata.org/#' + encodeURIComponent(query));
});

test('shipped configuration keeps the Wikidata embed URL', async () => {
    const result = await load(panel('', true));
    assert.equal(result.queries.length, 0);
    assert.equal(result.frames.length, 1);
    assert.match(result.frames[0].attributes.src, /^https:\/\/query\.wikidata\.org\/embed\.html#/);
});

test('unlisted destinations cannot create a request or iframe; later panels render', async () => {
    for (const endpoint of ['https://evil.example/sparql',
        'https://query.wikidata.org.evil.example/sparql',
        'https://query.wikidata.org/other', 'https://query.wikidata.org:444/sparql',
        'https://query.wikidata.org/sparql?other=1',
        'https://example.wikibase.cloud/query/sparql',
        'javascript:alert(1)', 'data:text/html,<img>', '//query.wikidata.org/sparql']) {
        const result = await load(panel(endpoint) + '\n' + panel(endpoint, true) + '\n' + panel());
        assert.equal(result.queries.length, 1, endpoint);
        assert.equal(result.frames.length, 0, endpoint);
        assert.equal(result.warnings.length, 2, endpoint);
        assert.equal(result.warnings[0].children.length, 0);
    }
});

test('custom wiki, endpoint path and independent UI hosts come only from config', async () => {
    const endpoint = 'https://sparql.example.org/api/query?dataset=local';
    const result = await load(panel() + '\n' + panel('', true), config => {
        config.namespace = 'Project:Synia:';
        config.templateApiUrl = 'https://wiki.example.org/api.php';
        config.endpoint = endpoint;
        config.allowedQueryServices = [{ endpoint,
            queryServiceUrl: 'https://ui.example.org/queries',
            embedUrl: 'https://embed.example.org/view?theme=light' }];
    });
    assert.match(result.requests[0].url, /^https:\/\/wiki\.example\.org\/api\.php\?/);
    assert.match(result.requests[0].url, /titles=Project:Synia:index$/);
    assert.equal(result.queries[0].url, endpoint);
    assert.match(result.nodes.find(node => node.tagName === 'a').href, /^https:\/\/ui\.example\.org\/queries#/);
    assert.match(result.frames[0].attributes.src, /^https:\/\/embed\.example\.org\/view\?theme=light#/);
    assert.equal(result.warnings.length, 0);
});

test('explicit local HTTP endpoint is supported; absent UI fields disable the UIs', async () => {
    const result = await load(panel() + '\n' + panel('', true), config => {
        config.endpoint = 'http://localhost:3030/dataset/query';
        config.allowedQueryServices = [{ endpoint: config.endpoint }];
    });
    assert.equal(result.queries.length, 1);
    assert.equal(result.frames.length, 0);
    assert.equal(result.nodes.filter(node => node.tagName === 'a').length, 0);
    assert.match(result.warnings[0].textContent, /No embedUrl configured/);
});

test('a template can select a second explicitly allowed service', async () => {
    const endpoint = 'https://example.wikibase.cloud/query/sparql';
    const result = await load(panel(endpoint) + '\n' + panel(endpoint, true), config => {
        config.allowedQueryServices.push({ endpoint, queryServiceUrl: null,
            embedUrl: 'https://example.wikibase.cloud/query/embed.html' });
    });
    assert.equal(result.queries[0].url, endpoint);
    assert.equal(result.nodes.filter(node => node.tagName === 'a').length, 0);
    assert.match(result.frames[0].attributes.src,
        /^https:\/\/example\.wikibase\.cloud\/query\/embed\.html#/);
    assert.equal(result.warnings.length, 0);
});

test('missing, empty, or nonmatching allowlists also block the default endpoint', async () => {
    for (const services of [undefined, [], [{ endpoint: 'https://other.example/sparql' }]]) {
        const result = await load(panel() + '\n' + panel('', true), config => {
            config.allowedQueryServices = services;
        });
        assert.equal(result.queries.length, 0);
        assert.equal(result.frames.length, 0);
        assert.equal(result.warnings.length, 2);
    }
});

test('unsafe URLs are rejected even if installation configuration lists them', async () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,<img>', 'file:///tmp/query',
        'https://user:password@example.org/query', 'https://example.org/query#fragment',
        'https://example.org/query#', 'https://example.org/\nquery']) {
        for (const field of ['endpoint', 'queryServiceUrl', 'embedUrl']) {
            const result = await load(panel('', true), config => {
                config.allowedQueryServices[0][field] = url;
                if (field === 'endpoint') config.endpoint = url;
            });
            assert.equal(result.queries.length, 0);
            assert.equal(result.frames.length, 0);
            assert.equal(result.warnings.length, 1, `${field}: ${url}`);
        }
    }
});

test('URL normalization accepts the same endpoint with host casing and default port', async () => {
    const result = await load(panel('https://QUERY.WIKIDATA.ORG:443/sparql'));
    assert.equal(result.queries[0].url, 'https://query.wikidata.org/sparql');
});

test('direct table calls enforce the policy before fetch', async () => {
    const { context, requests } = await load('= Test =');
    const before = requests.length;
    assert.throws(() => context.sparqlToDataTable('SELECT * WHERE {}', '#unused',
        { endpoint: 'https://evil.example/sparql' }), /not allowed/);
    assert.equal(requests.length, before);
});

test('fetch rejection produces a visible text warning', async () => {
    const result = await load(panel(), () => {}, true);
    assert.equal(result.queries[0].options.redirect, 'error');
    assert.equal(result.tables.length, 0);
    assert.match(result.warnings[0].textContent, /request failed/);
});
