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


function convertDataTableData(data, columns, linkPrefixes={}, linkSuffixes={}) {
    // Handle 'Label' columns.

    // var linkPrefixes = (options && options.linkPrefixes) || {};

    var convertedData = [];
    var convertedColumns = [];
    for (var i = 0 ; i < columns.length ; i++) {
	column = columns[i];
	if (column.substr(-11) == 'Description') {
	    convertedColumns.push(column.substr(0, column.length - 11) + ' description');
	} else if (column.substr(-5) == 'Label') {
	    // pass
	} else if (column.substr(-3) == 'Url') {
	    // pass
	} else {
	    convertedColumns.push(column);
	}
    }
    for (var i = 0 ; i < data.length ; i++) {
	var convertedRow = {};
	for (var key in data[i]) {
	    if (key.substr(-11) == 'Description') {
		convertedRow[key.substr(0, key.length - 11) + ' description'] = data[i][key];

	    } else if ( (key + 'Label' in data[i]) & (!(key + 'Url' in data[i])) ) {
		convertedRow[key] = data[i][key + 'Label'];
	    } else if (key.substr(-5) == 'Label') {
		// pass

	    } else if (key + 'Url' in data[i]) {
		if (key + 'Label' in data[i]) {
		    if (data[i][key + 'Url'].startsWith('http')) {
			convertedRow[key] = '<a href="' +
			    data[i][key + 'Url'] +
			    '">' + data[i][key + 'Label'] + '</a>';
		    } else {
			convertedRow[key] = '<a onclick="window.location.hash=\'' +
			    data[i][key + 'Url'] +
			    '\'; window.location.reload()" href="' +
			    data[i][key + 'Url'] +
			    '">' + data[i][key + 'Label'] + '</a>';
		    }
		}
		else {
		    if (data[i][key + 'Url'].startsWith('http')) {
			convertedRow[key] = '<a href="' +
			    data[i][key + 'Url'] +
			    '">' + data[i][key] + '</a>';
		    } else {
			convertedRow[key] = '<a onclick="window.location.hash=\'' +
			    data[i][key + 'Url'] +
			    '\'; window.location.reload()" href="' +
			    data[i][key + 'Url'] +
			    '">' + data[i][key] + '</a>';
		    }
		}
	    } else if (key.substr(-3) == 'Url') {
		// pass

	    } else if (key.substr(-3) == 'url') {
		// Convert URL to a link
		convertedRow[key] = "<a onclick='window.location.reload()' href='" +
		    data[i][key] + "'>" + 
		    $("<div>").text(data[i][key]).html() + '</a>';
	    } else {
		convertedRow[key] = data[i][key];
	    }
	}
	convertedData.push(convertedRow);
    }
    return {data: convertedData, columns: convertedColumns}
}


function entityToLabel(entity, language='en') {
    if (language in entity['labels']) {
	return entity['labels'][language].value;
    }

    // Fallback
    languages = ['en', 'da', 'de', 'es', 'fr', 'jp',
		 'nl', 'no', 'ru', 'sv', 'zh'];
    for (lang in languages) {
	if (lang in entity['labels']) {
	    return entity['labels'][lang].value;
	}
    }

    // Last resort
    return entity['id']
}


function sparqlTemplateToSparql(sparqlTemplate, q, q2=null) {
    let sparql;
    if (q == null) {
	return sparqlTemplate;
    }
    if (q2 == null) {
	// One target
	let regex = /(PREFIX target: <http.*?\/)(L|Q)\d+(>)/
	sparql = sparqlTemplate.replace(regex, "$1" + q + "$3");
	return sparql;
    }
    // Two targets
    let regex1 = /(PREFIX target1: <http.*?\/)(L|Q)\d+(>)/
    let regex2 = /(PREFIX target2: <http.*?\/)(L|Q)\d+(>)/
    sparql = sparqlTemplate.replace(regex1, "$1" + q + "$3");
    sparql = sparql.replace(regex2, "$1" + q2 + "$3");
    return sparql;
}


function sparqlDataToSimpleData(response) {
    // Convert long JSON data from from SPARQL endpoint to short form
    let data = response.results.bindings;
    let columns = response.head.vars
    var convertedData = [];
    for (var i = 0 ; i < data.length ; i++) {
	var convertedRow = {};
	for (var key in data[i]) {
	    convertedRow[key] = data[i][key]['value'];
	}
	convertedData.push(convertedRow);
    }
    return {data: convertedData, columns: columns};
}

function sparqlToDataTable(sparql, element, options={}) {
    // Options: linkPrefixes={}, linkSuffixes={}, paging=true
    var linkPrefixes = (typeof options.linkPrefixes === 'undefined') ? {} : options.linkPrefixes;
    var linkSuffixes = (typeof options.linkSuffixes === 'undefined') ? {} : options.linkSuffixes;
    var paging = (typeof options.paging === 'undefined') ? true : options.paging;
    var sDom = (typeof options.sDom === 'undefined') ? 'lfrtip' : options.sDom;

    let endpoint;
    let queryServiceUrl;
    if (typeof options.endpoint == 'undefined') {
	endpoint = window.configuration.endpoint;
	queryServiceUrl = window.configuration.queryServiceUrl;
    }
    else {
	endpoint = options.endpoint;
	if (endpoint == window.configuration.endpoint) {
	    queryServiceUrl = window.configuration.queryServiceUrl;
	}
	else {
	    if (endpoint.endsWith('.wikibase.cloud/query/sparql')) {
		queryServiceUrl = endpoint.substring(0, endpoint.length - 7);
	    }
	    else {
		queryServiceUrl = null;
	    }
	}
    }
    
    fetch(endpoint, {
	// query may be too long to fit in the URL with a GET
	method: 'POST',
	headers: {
	    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
	},
	body: "query=" + encodeURIComponent(sparql) + "&format=json",
    })
	.then(response => response.json())
	.then(response_data => {
	    var simpleData = sparqlDataToSimpleData(response_data);
	    
	    convertedData = convertDataTableData(simpleData.data, simpleData.columns, linkPrefixes=linkPrefixes, linkSuffixes=linkSuffixes);
	    columns = [];
	    for ( i = 0 ; i < convertedData.columns.length ; i++ ) {
		var column = {
		    data: convertedData.columns[i],
		    title: capitalizeFirstLetter(convertedData.columns[i]).replace(/_/g, "&nbsp;"),
		    defaultContent: "",
		}
		columns.push(column)
	    }

	    const allowedDataTableLanguages = ['da', 'de-DE'];
	    let dataTableLanguageUrl
	    if (allowedDataTableLanguages.includes(userLang)) {
		dataTableLanguageUrl = 'libs/datatables/i18n/' + userLang + '.json';
	    }
	    else {
		dataTableLanguageUrl = null;
	    }
	    
	    table = $(element).DataTable({ 
		data: convertedData.data,
		columns: columns,
		lengthMenu: [[10, 25, 100, -1], [10, 25, 100, "All"]],
		ordering: true,
		order: [], 
		paging: paging,
		sDom: sDom,
		language: { url: dataTableLanguageUrl },
	    });

	    if (queryServiceUrl !== null) {
		$(element).append(
		    '<caption><a href="' + queryServiceUrl + '/#' + 
			encodeURIComponent(sparql) +	
			'">Query Service</a></caption>');
	    }
	    
	});
}

let userLang = navigator.language || navigator.userLanguage; 

let namespace = window.configuration.namespace;
let hash = window.location.hash;

let aspect = hashToAspect(hash);
let templateUrl = aspectToTemplateUrl(aspect);

// Extract Q identifiers from URI fragment
let q = q1 = q2 = null;
if (aspect.endsWith('-index') & (/-/.test(aspect))) {
    q = hashToQ(hash);
}
else if (aspect.endsWith('-index') | aspect == "index") {
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

	    const reTemplateParts = /(=[^=]+?=|==[^=]+?==|===.+?===|\-\-\-\-|{{SPARQL\s+.+?}})/sg;
	    const reHeader1 = /=(.+?)=/sg;
	    const reHeader2 = /==(.+?)==/sg;
	    const reHeader3 = /===(.+?)===/sg;
	    const reSparqlTemplate = /{{SPARQL\s*\|(\s*endpoint\s*=\s*(.*?)\s*\|)?\s*query\s*=(.+?)}}/sg;

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
		    if ((q1 !== null) & (q2 !== null)) {
			sparql = sparqlTemplateToSparql(sparqlTemplate, q1, q2);
		    }
		    else if (q !== null) {
			sparql = sparqlTemplateToSparql(sparqlTemplate, q);
		    }
		    else {
			sparql = sparqlTemplateToSparql(sparqlTemplate, null);
		    }

		    queryServiceUrl = endpoint.substring(0, endpoint.length - 7);

		    if ( /#defaultView:/sg.test(sparql) ) {
			// Iframe graph rendering
		    	let div = document.createElement("div");
			div.setAttribute("class", "embed-responsive embed-responsive-4by3");
			let iframeElement = document.createElement("iframe");
			iframeElement.setAttribute("class", "embed-responsive-item");
			iframeElement.setAttribute("src", queryServiceUrl + "/embed.html#" + encodeURIComponent(sparql));
			div.append(iframeElement);
			$('#content').append(div);
		    }
		    else {
			// Table rendering
			let div = document.createElement("div");
			let tableElement = document.createElement("table");
			let tableId = "table-" + (i+1);
			tableElement.setAttribute("class", "table table-hover");
			tableElement.setAttribute("id", tableId);
			div.append(tableElement);
			$('#content').append(div);
			sparqlToDataTable(sparql, "#" + tableId, {endpoint: endpoint});
		    }
		}
	    }

	} else {
	    let div = document.createElement("div");
	    div.className = 'alert alert-warning';
	    div.innerHTML = "Missing template for " + aspect +
		': <a href="' + window.configuration.templateBaseUrl +
		aspect + '">Define</a>';
	    $('#content').append(div);
	}
    })
    .catch((error) => {
	console.log(error);
    });

