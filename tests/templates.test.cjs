const assert = require('assert').strict;
const { setup, flush, page, results } = require('./app-harness.cjs');

(async () => {
    const app = setup('#author/Q42', config => {
        config.layout = {
            header: { page: 'Project:Header & menu' },
            footer: { text: 'Footer <script>alert(1)</script>' },
        };
        config.templateApiUrl = 'https://wiki.example/api.php?installation=one';
    });
    await flush();
    assert.equal(app.requests.length, 2);
    assert.equal(new URL(app.requests[1].url).searchParams.get('titles'), 'Project:Header & menu');
    assert.equal(new URL(app.requests[1].url).searchParams.get('installation'), 'one');
    app.requests[1].respond(page('{{Synia link | label = Authors | target = #author }}'));
    app.requests[0].respond(page('== A heading ==\nSome <img onerror=alert(1)> text.\n{{Synia link | label = A{{!}}B | target = https://example.org/?a=b=c }}\n----'));
    await flush();
    assert.equal(app.regions.content.querySelector('h2').textContent, 'A heading');
    assert.equal(app.root.querySelectorAll('img').length, 0);
    assert.equal(app.root.querySelectorAll('script').length, 0);
    const link = app.regions.content.querySelector('a');
    assert.equal(link.textContent, 'A|B');
    assert.equal(link.getAttribute('href'), 'https://example.org/?a=b=c');
    assert.equal(app.regions.content.querySelectorAll('hr').length, 1);
    const headerLink = app.regions['site-header'].querySelector('a');
    app.click(headerLink);
    await flush();
    assert.equal(app.context.window.location.hash, '#author');
    assert.equal(app.requests.length, 3, 'layout must not refetch on navigation');
    assert.equal(app.regions['site-header'].querySelector('a'), headerLink);
    console.log('PASS shared text/headings/links renderer and persistent wiki/inline layout');

    const invalid = setup('', config => { config.layout = { header: { text: 'x', page: 'y' }, footer: null }; });
    invalid.requests[0].respond(page('{{Synia unknown | x = 1 }}\n{{Synia link | label = X | target = javascript:alert(1) }}\n{{Synia link | label = X | label = Y | target = # }}\n{{Synia link | label = X | target = # | onclick = evil }}\n== Later =='));
    await flush();
    assert(invalid.regions['site-header'].textContent.includes('Choose text or page'));
    assert(invalid.regions.content.textContent.includes('Unsupported Synia component'));
    assert(invalid.regions.content.textContent.includes('duplicate'));
    assert(invalid.regions.content.textContent.includes('Unsupported component parameter'));
    assert.equal(invalid.regions.content.querySelectorAll('a').length, 0);
    assert.equal(invalid.regions.content.querySelector('span').textContent, 'X');
    assert.equal(invalid.regions.content.querySelector('h2').textContent, 'Later');
    console.log('PASS invalid components stay inert and do not suppress later content');

    const mixed = setup('#author/Q42');
    mixed.requests[0].respond(page('Intro\n{{SPARQL\n| query =\nPREFIX target: <http://www.wikidata.org/entity/Q1>\nSELECT ?value WHERE { BIND("a{{!}}b" AS ?value) }\n}}\n{{Synia link | label = Next | target = #topic }}'));
    await flush();
    const query = new URLSearchParams(mixed.requests[1].options.body).get('query');
    assert(query.includes('/Q42>'));
    assert(query.includes('"a|b"'));
    mixed.requests[1].respond(results('a|b'));
    await flush();
    assert.equal(mixed.tables.length, 1);
    assert(mixed.regions.content.querySelectorAll('a').some(link => link.getAttribute('href') === '#topic'));
    console.log('PASS legacy SPARQL blocks coexist with text and components');

    const missing = setup('', config => { config.layout = { header: { page: 'Missing' }, footer: null }; });
    await flush();
    missing.requests[1].respond({ query: { pages: [{ missing: true }] } });
    missing.requests[0].respond(page('Body remains usable'));
    await flush();
    assert(missing.regions['site-header'].textContent.includes('Layout template is missing'));
    assert.equal(missing.regions.content.textContent, 'Body remains usable');
    console.log('PASS layout failures do not block the body');
})().catch(error => { console.error(error); process.exitCode = 1; });
