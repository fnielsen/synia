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
	+ namespace + aspect;
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
        window.location.hash = href;
        window.location.reload();
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
    let sparql = sparqlTemplate.replaceAll("{{!}}", "|");
    
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


function sparqlDataToSimpleData(response) {
    // Convert long JSON data from from SPARQL endpoint to short form
    let data = response.results.bindings;
    let columns = response.head.vars
    var convertedData = [];
    for (var i = 0 ; i < data.length ; i++) {
	var convertedRow = Object.create(null);
	for (const key of Object.keys(data[i])) {
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
    
    return fetch(service.endpoint, {
	// query may be too long to fit in the URL with a GET
	method: 'POST',
	// A permitted endpoint must not redirect the request to another destination.
	redirect: 'error',
	headers: {
	    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
	},
	body: "query=" + encodeURIComponent(sparql) + "&format=json",
    })
	.then(response => response.json())
	.then(response_data => {
	    var simpleData = sparqlDataToSimpleData(response_data);
	    
            const convertedData = convertDataTableData(simpleData.data, simpleData.columns);
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
	    
            document.querySelector(element).addEventListener('click', followSyniaLink);
	    $(element).DataTable({
		data: convertedData.data,
		columns: columns,
		lengthMenu: [[10, 25, 100, -1], [10, 25, 100, "All"]],
		ordering: true,
		order: [], 
		paging: paging,
		sDom: sDom,
		language: { url: dataTableLanguageUrl },
	    });

	    if (service.queryServiceUrl !== null) {
		const caption = document.createElement('caption');
		const link = document.createElement('a');
		link.href = service.queryServiceUrl + '#' + encodeURIComponent(sparql);
		link.textContent = 'Query Service';
		caption.append(link);
		$(element).append(caption);
	    }
	    
	})
	.catch(error => showQueryWarning(error, document.querySelector(element).parentElement));
}

let userLang = navigator.language || navigator.userLanguage; 

let namespace = window.configuration.namespace;
let hash = window.location.hash;

let aspect = hashToAspect(hash);
let templateUrl = aspectToTemplateUrl(aspect);

// Extract Q identifiers from URI fragment
let q = null;
let q1 = null;
let q2 = null;
if (aspect.endsWith('-index') && (/-/.test(aspect))) {
    q = hashToQ(hash);
}
else if (aspect.endsWith('-index') || aspect == "index") {
    q = null;
}
else if (/-/.test(aspect)) {
    [q1, q2] = hashToQQ(hash);
}
else {
    q = hashToQ(hash);
}


fetch(templateUrl, {
    mode: 'cors'
})
    .then(response => response.json())
    .then(data => {
	if ('revisions' in data.query.pages[0]) {
	    let template = data.query.pages[0].revisions[0].slots.main.content;

	    const reTemplateParts = /(=[^=]+?=|==[^=]+?==|===.+?===|\-\-\-\-|{{SPARQL\s+.+?^}})/gms;
	    const reHeader1 = /=(.+?)=/sg;
	    const reHeader2 = /==(.+?)==/sg;
	    const reHeader3 = /===(.+?)===/sg;
	    const reSparqlTemplate = /{{SPARQL\s*\|(\s*endpoint\s*=\s*(.*?)\s*\|)?\s*query\s*=(.+?)^}}/gms;

	    // Identify parts in template
	    let templateParts = template.match(reTemplateParts)

	    // Render parts as specified by the template
	    for (let i = 0; i < templateParts.length; i++) {
		if (templateParts[i].startsWith("===")) {
		    // Headers, level 3
		    let headerString = [...templateParts[i].matchAll(reHeader3)][0][1];
		    let div = document.createElement("div");
		    let h3Element = document.createElement("h3");
		    h3Element.textContent = headerString;
		    div.append(h3Element);
		    $('#content').append(div);
		}
		else if (templateParts[i].startsWith("==")) {
		    // Headers, level 2
		    let headerString = [...templateParts[i].matchAll(reHeader2)][0][1];
		    let div = document.createElement("div");
		    let h2Element = document.createElement("h2");
		    h2Element.textContent = headerString;
		    div.append(h2Element);
		    $('#content').append(div);
		}
		else if (templateParts[i].startsWith("=")) {
		    // Headers, level 1
		    let headerString = [...templateParts[i].matchAll(reHeader1)][0][1];
		    let div = document.createElement("div");
		    let h1Element = document.createElement("h1");
		    h1Element.textContent = headerString;
		    div.append(h1Element);
		    $('#content').append(div);
		}
		else if (templateParts[i].startsWith("----")) {
		    // line
		    let div = document.createElement("div");
		    let hrElement = document.createElement("hr");
		    div.append(hrElement);
		    $('#content').append(div);
		}
		else if (templateParts[i].startsWith("{{SPARQL")) {
		    // SPARQL commands
		    let sparqlTemplateParts = [...templateParts[i].matchAll(reSparqlTemplate)][0];
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
			showQueryWarning(error);
			continue;
		    }

		    if (isEmbed) {
			// Iframe graph rendering
		    	let div = document.createElement("div");
			div.setAttribute("class", "synia-embed");
			let iframeElement = document.createElement("iframe");
			iframeElement.setAttribute("src", service.embedUrl + "#" + encodeURIComponent(sparql));
			div.append(iframeElement);
			$('#content').append(div);
		    }
		    else {
			// Table rendering
			let div = document.createElement("div");
			let tableElement = document.createElement("table");
			let tableId = "table-" + (i+1);
			tableElement.setAttribute("class", "synia-table");
			tableElement.setAttribute("id", tableId);
			div.append(tableElement);
			$('#content').append(div);
			sparqlToDataTable(sparql, "#" + tableId, {endpoint: endpoint});
		    }
		}
	    }

	} else {
	    let div = document.createElement("div");
	    div.className = 'synia-warning';
            div.textContent = "Missing template for " + aspect + ': ';
            div.append(createSafeLink('Define', window.configuration.templateBaseUrl + aspect));
	    $('#content').append(div);
	}
    })
    .catch((error) => {
	console.log(error);
    });
