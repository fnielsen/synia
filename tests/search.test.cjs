const assert = require('assert').strict;
const { setup, flush, page } = require('./app-harness.cjs');
const response = (id = 'Q42') => ({ success: 1, search: [
    { id, label: '<img src=x onerror=alert(1)>', description: '<script>bad()</script>', url: 'javascript:bad()' },
] });
function submit(form, value) {
    form.querySelector('input').value = value;
    const event = { preventDefault() { this.prevented = true; } };
    form.listeners.submit(event);
    assert.equal(event.prevented, true);
}

(async () => {
    const app = setup('');
    app.requests[0].respond(page('Welcome'));
    await flush();
    const headerForm = app.regions['site-header'].querySelector('form');
    const input = headerForm.querySelector('input');
    input.value = 'typing';
    assert.equal(app.requests.length, 1);
    assert.equal(app.history.length, 1);
    submit(headerForm, '   ');
    assert.equal(app.requests.length, 1);
    assert.equal(app.focused, input);
    const query = 'Graph & "Å" | embeddings';
    submit(headerForm, query);
    await flush();
    const request = app.requests[1];
    const url = new URL(request.url);
    assert.equal(url.searchParams.get('action'), 'wbsearchentities');
    assert.equal(url.searchParams.get('search'), query);
    assert.equal(url.searchParams.get('language'), 'en');
    assert.equal(url.searchParams.get('type'), 'item');
    assert.equal(url.searchParams.get('origin'), '*');
    assert.equal(request.options.credentials, 'omit');
    assert.equal(request.options.redirect, 'error');
    request.respond(response());
    await flush();
    assert.equal(app.root.querySelectorAll('img').length, 0);
    assert.equal(app.root.querySelectorAll('script').length, 0);
    const resultLink = app.regions.content.querySelector('a');
    assert.equal(resultLink.getAttribute('href'), '#item/Q42');
    assert(resultLink.textContent.includes('<img'));
    const searchUrl = app.context.window.location.hash;
    app.click(resultLink);
    app.requests[2].respond(page('Item page'));
    await flush();
    input.value = 'a draft that should not replace the history query';
    app.back();
    assert.equal(app.context.window.location.hash, searchUrl);
    assert.equal(input.value, query);
    assert.equal(app.regions.content.querySelector('input').value, query);
    app.requests[3].respond(response());
    await flush();
    assert.equal(app.regions.content.querySelector('a').getAttribute('href'), '#item/Q42');
    console.log('PASS form submission, encoded queries, inert results, and Back to a search');

    const custom = setup('#search?q=ord&source=words', config => {
        config.layout = {};
        config.searchProviders = { words: { type: 'wikibase', apiUrl: 'http://localhost:8000/api.php?dataset=local',
            language: 'da', entityType: 'lexeme', resultAspect: 'lexeme' } };
    });
    assert.equal(custom.requests.length, 1, 'search route does not fetch a wiki template');
    const customUrl = new URL(custom.requests[0].url);
    assert.equal(customUrl.origin, 'http://localhost:8000');
    assert.equal(customUrl.searchParams.get('dataset'), 'local');
    assert.equal(customUrl.searchParams.get('language'), 'da');
    assert.equal(customUrl.searchParams.get('type'), 'lexeme');
    custom.requests[0].respond(Object.assign(response('L123'), { 'search-continue': 20 }));
    await flush();
    assert.equal(custom.regions.content.querySelector('a').getAttribute('href'), '#lexeme/L123');
    const next = custom.regions.content.querySelector('nav').querySelector('a');
    custom.click(next);
    assert.equal(new URL(custom.requests[1].url).searchParams.get('continue'), '20');
    custom.requests[1].respond({ search: [] });
    await flush();
    assert(custom.regions.content.textContent.includes('No results'));
    assert.equal(custom.regions.content.querySelector('nav').querySelector('a').textContent, 'First page');
    custom.back();
    assert.equal(new URL(custom.requests[2].url).searchParams.get('continue'), '0');
    console.log('PASS independent custom Wikibase configuration, lexemes, and continuation URLs');

    for (const hash of ['#search?source=unknown&q=test', '#search?source=__proto__&q=test',
        '#search?q=x&offset=-1', '#search?q=x&offset=1.5', '#search?q=x&offset=10001',
        '#search?q=' + 'x'.repeat(513)]) {
        const bad = setup(hash, config => { config.layout = {}; });
        await flush();
        assert.equal(bad.requests.length, 0, hash);
        assert(bad.regions.content.textContent.length > 0);
    }
    for (const apiUrl of ['javascript:alert(1)', 'https://user:secret@example.org/api', '//example.org/api']) {
        const bad = setup('#search?q=test', config => { config.layout = {}; config.searchProviders.entities.apiUrl = apiUrl; });
        await flush();
        assert.equal(bad.requests.length, 0);
        assert(bad.regions.content.textContent.includes('Search failed'));
    }
    console.log('PASS unknown providers, invalid routes, and unsafe API URLs fail before requests');

    for (const body of [null, {}, { error: { info: '<img onerror=bad()>' } },
        { search: [{ id: 'Q42/../../evil' }] }, { search: [{ id: 'Q42', label: {} }] },
        { search: [], 'search-continue': -1 }, { search: [], 'search-continue': 0 }]) {
        const bad = setup('#search?q=test', config => { config.layout = {}; });
        bad.requests[0].respond(body);
        await flush();
        assert(bad.regions.content.textContent.includes('Search failed'));
        assert.equal(bad.regions.content.querySelectorAll('a').length, 0);
        assert.equal(bad.regions.content.querySelectorAll('img').length, 0);
        assert(!bad.regions.content.textContent.includes('Searching…'));
    }
    const unavailable = setup('#search?q=test');
    unavailable.requests[0].respond({}, 503);
    await flush();
    assert(unavailable.regions.content.textContent.includes('HTTP 503'));
    console.log('PASS API/HTTP errors and malformed results are visible plain text');

    const stale = setup('#search?q=old');
    stale.go('#search?q=new');
    stale.requests[1].respond({ search: [{ id: 'Q123', label: 'New' }] });
    await flush();
    stale.requests[0].reject(new Error('Old failure'));
    await flush();
    assert(stale.regions.content.textContent.includes('New (Q123)'));
    assert(!stale.regions.content.textContent.includes('Search failed'));
    stale.go('#search?q=other');
    stale.go('#author/Q42');
    stale.requests[3].respond(page('Author page'));
    stale.requests[2].respond(response());
    await flush();
    assert.equal(stale.regions.content.textContent, 'Author page');
    console.log('PASS stale search successes and failures cannot overwrite another route');

    const empty = setup('#search');
    await flush();
    assert.equal(empty.requests.length, 0);
    assert(empty.regions.content.textContent.includes('Enter a search term'));
    const bodyWidget = setup('');
    bodyWidget.requests[0].respond(page('{{Synia search | source = entities | placeholder = Find a person }}'));
    await flush();
    assert.equal(bodyWidget.regions.content.querySelector('input').placeholder, 'Find a person');
    console.log('PASS empty search route and search components inside page templates');
})().catch(error => { console.error(error); process.exitCode = 1; });
