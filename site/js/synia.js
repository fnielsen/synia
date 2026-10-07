'use strict';

function hashToAspect(hash) {
    const reAspectAspect = /#([a-z]+)\/Q\d+\/([a-z]+)\/Q\d+/;
    const reAspectAspectIndex = /#([a-z]+)\/Q\d+\/([a-z]+)/;
    const reAspect = /#([a-z]+)\/(L|Q)\d+/;
    const reAspectIndex = /#([a-z]+)/;
    let aspect = 'index';
    if (reAspectAspect.test(hash)) {
	let matches = reAspectAspect.exec(hash);
	aspect = matches[1] + "-" + matches[2];
    }
    else if (reAspectAspectIndex.test(hash)) {
	let matches = reAspectAspectIndex.exec(hash);
	aspect = matches[1] + "-" + matches[2] + '-index';
    }
    else if (reAspect.test(hash)) {
	let matches = reAspect.exec(hash);
	aspect = matches[1];
    }
    else if (reAspectIndex.test(hash)) {
	let matches = reAspectIndex.exec(hash);
	aspect = matches[1] + '-index';
    }
    return aspect
}

function hashToQ(hash) {
    const reQ = /#[a-z]+\/((L|Q)\d+)/;
    let matches = reQ.exec(hash);
    if (matches) {
	return matches[1];
    }
    else {
	return null;
    }
}

function hashToQQ(hash) {
    const reQ = /#[a-z]+\/(Q\d+)\/[a-z]+\/(Q\d+)/;
    let matches = reQ.exec(hash);
    if (matches) {
	return [matches[1], matches[2]];
    }
    else {
	return null;
    }
}

function aspectToTemplateUrl(aspect) {
    let url = window.configuration.templateApiUrl +
    '?format=json&action=query&prop=revisions&rvslots=*&rvprop=content&formatversion=2&origin=*&titles='
	+ window.configuration.namespace + aspect;
    return url;
}

// https://stackoverflow.com/questions/6020714
function escapeHTML(html) {
    if (typeof html !== "undefined") {
	return html
	    .replace(/&/g,'&amp;')
	    .replace(/</g,'&lt;')
	    .replace(/>/g,'&gt;');
    }
    else {
	return "";
    }
}

// http://stackoverflow.com/questions/1026069/
function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}


// Result links support external HTTP(S) URLs and Synia hash routes only.
function safeLinkUrl(value) {
    if (typeof value !== 'string' || /[\u0000-\u0020\u007f]/.test(value)) {
        return null;
    }
    if (value.startsWith('#')) {
        return value;
    }
    if (!/^https?:\/\//i.test(value)) {
        return null;
    }
    try {
        const url = new URL(value);
        return url.username || url.password ? null : url.href;
    } catch (error) {
        return null;
    }
}

function createSafeLink(text, url) {
    const href = safeLinkUrl(url);
    const element = document.createElement(href === null ? 'span' : 'a');
    element.textContent = text;
    if (href !== null) {
        element.setAttribute('href', href);
    }
    return element;
}

function followSyniaLink(event) {
    if (event.defaultPrevented || event.button !== 0 ||
        event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
        return;
    }
    const link = event.target.closest('a');
    const href = link && link.getAttribute('href');
    if (href && href.startsWith('#')) {
        event.preventDefault();
        if (window.location.hash === href || (href === '#' && !window.location.hash)) {
            renderRoute();
        } else {
            window.location.hash = href;
        }
    }
}

function renderResultCell(cell, type) {
    const text = cell ? cell.text : '';
    if (type === 'display') {
        // DataTables 1.x requires HTML strings: serialize DOM-built nodes only.
        return createSafeLink(text, cell ? cell.url : null).outerHTML;
    }
    // DataTables decodes HTML entities when building its search cache.
    // Escape filter data too, so that decoding cannot create active elements.
    return type === 'filter' ? escapeHTML(text) : text;
}

function convertDataTableData(data, columns) {
    const visibleColumns = columns.filter(column =>
        !column.endsWith('Label') && !column.endsWith('Url'));
    function value(row, key) {
        return Object.prototype.hasOwnProperty.call(row, key) &&
            typeof row[key] === 'string' ? row[key] : '';
    }
    return {
        columns: visibleColumns.map(column => column.endsWith('Description') ?
            column.slice(0, -11) + ' description' : column),
        // Arrays keep untrusted variable names out of DataTables property paths
        // and its special DT_Row* metadata properties.
        data: data.map(row => visibleColumns.map(column => {
            if (column.endsWith('Description')) {
                return { text: value(row, column), url: null };
            }
            const label = Object.prototype.hasOwnProperty.call(row, column + 'Label') ?
                value(row, column + 'Label') : value(row, column);
            const url = Object.prototype.hasOwnProperty.call(row, column + 'Url') ?
                value(row, column + 'Url') : column.endsWith('url') ? value(row, column) : null;
            return { text: label, url: url };
        })),
    };
}


function entityToLabel(entity, language='en') {
    if (language in entity['labels']) {
	return entity['labels'][language].value;
    }

    // Fallback
    const languages = ['en', 'da', 'de', 'es', 'fr', 'jp',
		 'nl', 'no', 'ru', 'sv', 'zh'];
    for (const lang of languages) {
	if (lang in entity['labels']) {
	    return entity['labels'][lang].value;
	}
    }

    // Last resort
    return entity['id']
}


function sparqlTemplateToSparql(sparqlTemplate, q, q2=null) {

    // Convert the escaped "|" character in the wikitext to a the pipe character
    let sparql = sparqlTemplate.replace(/\{\{!\}\}/g, "|");
    
    if (q == null) {
	return sparql;
    }
    if (q2 == null) {
	// One target
	let regex = /(PREFIX target: <http.*?\/)(L|Q)\d+(>)/
	sparql = sparql.replace(regex, "$1" + q + "$3");
	return sparql;
    }
    // Two targets
    let regex1 = /(PREFIX target1: <http.*?\/)(L|Q)\d+(>)/
    let regex2 = /(PREFIX target2: <http.*?\/)(L|Q)\d+(>)/
    sparql = sparql.replace(regex1, "$1" + q + "$3");
    sparql = sparql.replace(regex2, "$1" + q2 + "$3");
    return sparql;
}


function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function fetchJson(url, options) {
    let response;
    try {
        response = await fetch(url, options);
    } catch (error) {
        throw new Error('Request failed (network, CORS, or blocked redirect).');
    }
    if (!response.ok) {
        throw new Error('HTTP ' + response.status + '.');
    }
    try {
        return await response.json();
    } catch (error) {
        throw new Error('Could not read response as JSON.');
    }
}

function templateContentFromResponse(data) {
    if (isRecord(data) && isRecord(data.error)) {
        const detail = typeof data.error.info === 'string' ? data.error.info :
            typeof data.error.code === 'string' ? data.error.code : 'Unknown error';
        throw new Error('Template API error: ' + detail);
    }
    if (!isRecord(data) || !isRecord(data.query) ||
        !Array.isArray(data.query.pages) || !isRecord(data.query.pages[0])) {
        throw new Error('Invalid template API response: expected a page.');
    }
    const page = data.query.pages[0];
    // formatversion=2 uses a boolean; absent revisions alone do not mean missing.
    if (page.missing === true) {
        return null;
    }
    const revision = Array.isArray(page.revisions) && page.revisions[0];
    if (!isRecord(revision) || !isRecord(revision.slots) ||
        !isRecord(revision.slots.main) || typeof revision.slots.main.content !== 'string') {
        throw new Error('Template content is unavailable or invalid.');
    }
    return revision.slots.main.content;
}

function sparqlDataToSimpleData(response) {
    if (!isRecord(response) || !isRecord(response.head) ||
        !Array.isArray(response.head.vars) ||
        !response.head.vars.every(name => typeof name === 'string') ||
        !isRecord(response.results) || !Array.isArray(response.results.bindings)) {
        throw new Error('Invalid SPARQL response: expected SELECT results.');
    }
    // Convert long JSON data from from SPARQL endpoint to short form
    let data = response.results.bindings;
    let columns = response.head.vars
    var convertedData = [];
    for (var i = 0 ; i < data.length ; i++) {
	if (!isRecord(data[i])) {
	    throw new Error('Invalid SPARQL response: expected a result row.');
	}
	var convertedRow = Object.create(null);
	for (const key of Object.keys(data[i])) {
	    if (!isRecord(data[i][key]) || typeof data[i][key].value !== 'string') {
		throw new Error('Invalid SPARQL response: expected a binding value.');
	    }
	    convertedRow[key] = data[i][key]['value'];
	}
	convertedData.push(convertedRow);
    }
    return {data: convertedData, columns: columns};
}

// Only installation-owned configuration can authorize query/iframe destinations.
function normalizeQueryServiceUrl(value) {
    if (typeof value !== 'string' || /[\u0000-\u0020\u007f]/.test(value)) {
	throw new Error('Invalid query service URL: ' + value);
    }
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) ||
	url.username || url.password || url.hash || value.includes('#')) {
	throw new Error('Invalid query service URL: ' + value);
    }
    return url.href;
}

function resolveQueryService(endpoint, configuration) {
    const url = normalizeQueryServiceUrl(endpoint);
    const services = configuration.allowedQueryServices;
    if (!Array.isArray(services)) {
	throw new Error('Configure allowedQueryServices in js/config.js.');
    }
    const service = services.find(service => normalizeQueryServiceUrl(service.endpoint) === url);
    if (!service) {
	throw new Error('SPARQL endpoint is not allowed in js/config.js: ' + endpoint);
    }
    return {
	endpoint: url,
	queryServiceUrl: service.queryServiceUrl == null ? null : normalizeQueryServiceUrl(service.queryServiceUrl),
	embedUrl: service.embedUrl == null ? null : normalizeQueryServiceUrl(service.embedUrl),
    };
}

function showQueryWarning(error, parent = document.getElementById('content')) {
    const warning = document.createElement('div');
    warning.className = 'synia-warning';
    warning.setAttribute('role', 'alert');
    warning.textContent = error.message;
    parent.append(warning);
}

function sparqlToDataTable(sparql, element, options={}) {
    // Options: endpoint, paging=true, sDom='lfrtip'
    var paging = (typeof options.paging === 'undefined') ? true : options.paging;
    var sDom = (typeof options.sDom === 'undefined') ? 'lfrtip' : options.sDom;

    const service = resolveQueryService(
	typeof options.endpoint === 'undefined' ? window.configuration.endpoint : options.endpoint,
	window.configuration);
    
    const table = typeof element === 'string' ? document.querySelector(element) : element;
    const parent = table.parentElement;
    const view = options.view;
    const isCurrent = () => !view || view.active;
    return fetchJson(service.endpoint, {
	// query may be too long to fit in the URL with a GET
	method: 'POST',
	// A permitted endpoint must not redirect the request to another destination.
	redirect: 'error',
	headers: {
	    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
	},
	body: "query=" + encodeURIComponent(sparql) + "&format=json",
    })
	.then(response_data => {
            if (!isCurrent()) return;
	    var simpleData = sparqlDataToSimpleData(response_data);
	    
            const convertedData = convertDataTableData(simpleData.data, simpleData.columns);
            if (convertedData.columns.length === 0) {
                throw new Error('SPARQL response has no columns to display.');
            }
            const columns = convertedData.columns.map((name, index) => ({
                data: index,
                title: escapeHTML(capitalizeFirstLetter(name).replace(/_/g, '\u00a0')),
                render: renderResultCell,
                defaultContent: '',
            }));

	    const allowedDataTableLanguages = ['da', 'de-DE'];
	    let dataTableLanguageUrl
	    if (allowedDataTableLanguages.includes(userLang)) {
		dataTableLanguageUrl = 'libs/datatables/i18n/' + userLang + '.json';
	    }
	    else {
		dataTableLanguageUrl = null;
	    }
	    
            table.addEventListener('click', followSyniaLink);
	    $(table).DataTable({
		data: convertedData.data,
		columns: columns,
		lengthMenu: [[10, 25, 100, -1], [10, 25, 100, "All"]],
		ordering: true,
		order: [], 
		paging: paging,
		sDom: sDom,
		language: { url: dataTableLanguageUrl },
                initComplete: function () {
                    const api = this.api();
                    if (!isCurrent()) api.destroy();
                    else if (view) view.tables.push(api);
                },
	    });

	    if (service.queryServiceUrl !== null) {
		const caption = document.createElement('caption');
		const link = document.createElement('a');
		link.href = service.queryServiceUrl + '#' + encodeURIComponent(sparql);
		link.textContent = 'Query Service';
		caption.append(link);
		table.append(caption);
	    }
	    
	})
	.catch(error => {
            if (isCurrent()) showQueryWarning(new Error('SPARQL query failed: ' + error.message), parent);
        });
}

const userLang = navigator.language || navigator.userLanguage;
let nextTableId = 0;
let activeView = null;

function routeFromHash(hash) {
    const aspect = hashToAspect(hash);
    let q = null, q1 = null, q2 = null;
    if (aspect.endsWith('-index')) {
        q = hashToQ(hash);
    } else if (aspect !== 'index' && /-/.test(aspect)) {
        const pair = hashToQQ(hash);
        if (pair) [q1, q2] = pair;
    } else if (aspect !== 'index') {
        q = hashToQ(hash);
    }
    return { aspect, q, q1, q2 };
}

function renderWikiTemplate(template, parent, route, view) {
    const { q, q1, q2 } = route;
    const reTemplateParts = /(=[^=]+?=|==[^=]+?==|===.+?===|\-\-\-\-|{{SPARQL\s+.+?^}})/gms;
    const reHeader1 = /=(.+?)=/sg;
    const reHeader2 = /==(.+?)==/sg;
    const reHeader3 = /===(.+?)===/sg;
    const reSparqlTemplate = /{{SPARQL\s*\|(\s*endpoint\s*=\s*(.*?)\s*\|)?\s*query\s*=(.+?)^}}/gms;

    // Identify parts in template
    let templateParts = template.match(reTemplateParts) || [];
    if (templateParts.length === 0) {
        throw new Error('Template contains no supported headings or SPARQL panels.');
    }

    // Render parts as specified by the template
    for (let i = 0; i < templateParts.length; i++) {
        if (templateParts[i].startsWith("===")) {
            // Headers, level 3
            let headerString = [...templateParts[i].matchAll(reHeader3)][0][1];
            let div = document.createElement("div");
            let h3Element = document.createElement("h3");
            h3Element.textContent = headerString;
            div.append(h3Element);
            parent.append(div);
        }
        else if (templateParts[i].startsWith("==")) {
            // Headers, level 2
            let headerString = [...templateParts[i].matchAll(reHeader2)][0][1];
            let div = document.createElement("div");
            let h2Element = document.createElement("h2");
            h2Element.textContent = headerString;
            div.append(h2Element);
            parent.append(div);
        }
        else if (templateParts[i].startsWith("=")) {
            // Headers, level 1
            let headerString = [...templateParts[i].matchAll(reHeader1)][0][1];
            let div = document.createElement("div");
            let h1Element = document.createElement("h1");
            h1Element.textContent = headerString;
            div.append(h1Element);
            parent.append(div);
        }
        else if (templateParts[i].startsWith("----")) {
            // line
            let div = document.createElement("div");
            let hrElement = document.createElement("hr");
            div.append(hrElement);
            parent.append(div);
        }
        else if (templateParts[i].startsWith("{{SPARQL")) {
            // SPARQL commands
            let sparqlTemplateParts = [...templateParts[i].matchAll(reSparqlTemplate)][0];
            if (!sparqlTemplateParts) {
                showQueryWarning(new Error('Malformed SPARQL panel: expected a query parameter.'), parent);
                continue;
            }
            let endpoint = (typeof sparqlTemplateParts[2] == "undefined") ? window.configuration.endpoint : sparqlTemplateParts[2];
            let sparqlTemplate = sparqlTemplateParts[3];

            // Interpolate q
            let sparql;
            if ((q1 !== null) && (q2 !== null)) {
                sparql = sparqlTemplateToSparql(sparqlTemplate, q1, q2);
            }
            else if (q !== null) {
                sparql = sparqlTemplateToSparql(sparqlTemplate, q);
            }
            else {
                sparql = sparqlTemplateToSparql(sparqlTemplate, null);
            }

            let service;
            const isEmbed = /#defaultView:/.test(sparql);
            try {
                service = resolveQueryService(endpoint, window.configuration);
                if (isEmbed && service.embedUrl === null) {
                    throw new Error('No embedUrl configured in js/config.js for: ' + endpoint);
                }
            } catch (error) {
                showQueryWarning(error, parent);
                continue;
            }

            if (isEmbed) {
                // Iframe graph rendering
                let div = document.createElement("div");
                div.setAttribute("class", "synia-embed");
                let iframeElement = document.createElement("iframe");
                iframeElement.setAttribute("src", service.embedUrl + "#" + encodeURIComponent(sparql));
                div.append(iframeElement);
                parent.append(div);
            }
            else {
                // Table rendering
                let div = document.createElement("div");
                let tableElement = document.createElement("table");
                let tableId = "table-" + (++nextTableId);
                tableElement.setAttribute("class", "synia-table");
                tableElement.setAttribute("id", tableId);
                div.append(tableElement);
                parent.append(div);
                sparqlToDataTable(sparql, tableElement, {endpoint: endpoint, view: view});
            }
        }
    }
}

function renderRoute() {
    if (activeView) {
        activeView.active = false;
        activeView.tables.forEach(table => table.destroy());
    }
    const view = { active: true, tables: [] };
    activeView = view;
    const route = routeFromHash(window.location.hash);
    const parent = document.getElementById('content');
    parent.textContent = '';
    return fetchJson(aspectToTemplateUrl(route.aspect), { mode: 'cors' })
        .then(data => {
            if (!view.active) return;
            const template = templateContentFromResponse(data);
            if (template !== null) {
                renderWikiTemplate(template, parent, route, view);
            } else {
                const warning = document.createElement('div');
                warning.className = 'synia-warning';
                warning.textContent = 'Missing template for ' + route.aspect + ': ';
                warning.append(createSafeLink('Define', window.configuration.templateBaseUrl + route.aspect));
                parent.append(warning);
            }
        })
        .catch(error => {
            if (view.active) showQueryWarning(new Error('Could not load template for ' +
                route.aspect + ': ' + error.message), parent);
        });
}

function startSynia() {
    window.addEventListener('hashchange', renderRoute);
    renderRoute();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startSynia, { once: true });
} else {
    startSynia();
}
