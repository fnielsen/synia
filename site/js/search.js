'use strict';

function searchRouteFromHash(hash) {
    if (!/^#search(?:\?|$)/.test(hash)) return null;
    const params = new URLSearchParams(hash.slice(7));
    const offset = params.get('offset') || '0';
    if (!/^\d+$/.test(offset) || !Number.isSafeInteger(Number(offset)) || Number(offset) > 10000) {
        throw new Error('Invalid search offset.');
    }
    return { query: (params.get('q') || '').trim(),
        source: params.get('source') || window.configuration.defaultSearchProvider || 'entities',
        offset: Number(offset) };
}

function searchHash(query, source, offset = 0) {
    const params = new URLSearchParams({ q: query, source });
    if (offset) params.set('offset', String(offset));
    return '#search?' + params.toString();
}

function resolveSearchProvider(name) {
    const providers = window.configuration.searchProviders;
    if (!isRecord(providers) || !Object.prototype.hasOwnProperty.call(providers, name)) {
        throw new Error('Unknown search provider: ' + name);
    }
    const provider = providers[name];
    if (!isRecord(provider) || provider.type !== 'wikibase' ||
        !['item', 'lexeme'].includes(provider.entityType) ||
        typeof provider.language !== 'string' || !/^[a-z][a-z0-9-]*$/i.test(provider.language) ||
        typeof provider.resultAspect !== 'string' || !/^[a-z]+$/.test(provider.resultAspect)) {
        throw new Error('Invalid search provider configuration: ' + name);
    }
    return Object.assign({}, provider, { apiUrl: normalizeQueryServiceUrl(provider.apiUrl) });
}

function makeSearchForm(source, placeholder, query = '') {
    resolveSearchProvider(source);
    const form = document.createElement('form');
    form.className = 'synia-search';
    form.setAttribute('role', 'search');
    form.setAttribute('data-search-source', source);
    const input = document.createElement('input');
    input.type = 'search';
    input.name = 'q';
    input.setAttribute('aria-label', 'Search');
    input.maxLength = 512;
    input.placeholder = placeholder || 'Search this knowledge base';
    input.value = query;
    form.append(input);
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.textContent = 'Search';
    form.append(submit);
    form.addEventListener('submit', event => {
        // Keep the accessible form while respecting form-action 'none'.
        event.preventDefault();
        const query = input.value.trim();
        if (!query) { input.focus(); return; }
        const hash = searchHash(query, source);
        if (window.location.hash === hash) renderRoute();
        else window.location.hash = hash;
    });
    return form;
}

syniaComponents.search = function (options, parent) {
    checkComponentOptions(options, ['source', 'placeholder']);
    const source = options.source || window.configuration.defaultSearchProvider || 'entities';
    // A bad route must not prevent the persistent header from loading.
    let route;
    try { route = searchRouteFromHash(window.location.hash); } catch (error) { route = null; }
    parent.append(makeSearchForm(source, options.placeholder,
        route && route.source === source ? route.query : ''));
};

function syncSearchForms(route) {
    if (!route) return;
    for (const form of document.querySelectorAll('[data-search-source]')) {
        if (form.getAttribute('data-search-source') === route.source) form.querySelector('input').value = route.query;
    }
}

function searchResultsFromResponse(data, provider, offset) {
    if (isRecord(data) && isRecord(data.error)) {
        throw new Error(typeof data.error.info === 'string' ? data.error.info : 'Search API returned an error.');
    }
    const idPattern = provider.entityType === 'lexeme' ? /^L[1-9]\d*$/ : /^Q[1-9]\d*$/;
    if (!isRecord(data) || data.success === 0 || !Array.isArray(data.search) ||
        !data.search.every(item => isRecord(item) && typeof item.id === 'string' && idPattern.test(item.id) &&
            (item.label === undefined || typeof item.label === 'string') &&
            (item.description === undefined || typeof item.description === 'string'))) {
        throw new Error('Invalid Wikibase search response.');
    }
    const next = data['search-continue'];
    if (next !== undefined && (!Number.isSafeInteger(next) || next <= offset || next > 10000)) {
        throw new Error('Invalid search continuation.');
    }
    return { items: data.search, next };
}

async function renderSearchRoute(route, parent, view) {
    try {
        const provider = resolveSearchProvider(route.source);
        const heading = document.createElement('h1');
        heading.textContent = 'Search';
        parent.append(heading);
        parent.append(makeSearchForm(route.source, null, route.query));
        const status = document.createElement('p');
        status.setAttribute('role', 'status');
        parent.append(status);
        if (!route.query) { status.textContent = 'Enter a search term.'; return; }
        if (route.query.length > 512) throw new Error('Search terms must be at most 512 characters.');
        status.textContent = 'Searching…';
        const url = new URL(provider.apiUrl);
        // Construct every request parameter locally; templates select a provider
        // name, never an endpoint, action, callback, or executable expression.
        const params = { action: 'wbsearchentities', format: 'json', formatversion: '2', origin: '*',
            search: route.query, language: provider.language, uselang: provider.language,
            type: provider.entityType, limit: '20', continue: String(route.offset) };
        for (const key of Object.keys(params)) url.searchParams.set(key, params[key]);
        const data = await fetchJson(url.href, { mode: 'cors', credentials: 'omit', redirect: 'error' });
        if (!view.active) return;
        const results = searchResultsFromResponse(data, provider, route.offset);
        status.textContent = results.items.length ? 'Results for “' + route.query + '”' : 'No results for “' + route.query + '”.';
        const list = document.createElement('ul');
        list.className = 'synia-search-results';
        for (const item of results.items) {
            const row = document.createElement('li');
            const label = item.label ? item.label + ' (' + item.id + ')' : item.id;
            row.append(createSafeLink(label, '#' + provider.resultAspect + '/' + item.id));
            if (item.description) {
                const description = document.createElement('p');
                description.textContent = item.description;
                row.append(description);
            }
            list.append(row);
        }
        parent.append(list);
        if (route.offset || results.next !== undefined) {
            const pages = document.createElement('nav');
            pages.className = 'synia-search-pages';
            pages.setAttribute('aria-label', 'Search result pages');
            if (route.offset) pages.append(createSafeLink('First page', searchHash(route.query, route.source)));
            if (results.next !== undefined) pages.append(createSafeLink('Next page', searchHash(route.query, route.source, results.next)));
            parent.append(pages);
        }
    } catch (error) {
        if (!view.active) return;
        // Remove the loading indicator but retain the form for another attempt.
        const status = parent.querySelector('[role="status"]');
        if (status) status.textContent = '';
        showQueryWarning(new Error('Search failed: ' + error.message), parent);
    }
}
