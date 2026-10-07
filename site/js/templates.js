'use strict';

// Only registered components can create interactive UI. Wiki text is never code.
const syniaComponents = Object.create(null);

function componentOptions(body) {
    if (body.includes('\u0000')) throw new Error('Invalid component text.');
    const fields = body.replace(/\{\{!\}\}/g, '\u0000').split('|');
    const name = fields.shift().trim();
    const options = Object.create(null);
    for (const field of fields) {
        const separator = field.indexOf('=');
        if (separator < 1) throw new Error('Expected named parameters in Synia ' + name + '.');
        const key = field.slice(0, separator).trim();
        const value = field.slice(separator + 1).trim().replace(/\u0000/g, '|');
        if (!/^[a-z][a-zA-Z]*$/.test(key) || Object.prototype.hasOwnProperty.call(options, key) ||
            /\{\{|\}\}/.test(value)) throw new Error('Invalid or duplicate component parameter: ' + key);
        options[key] = value;
    }
    return { name, options };
}

function checkComponentOptions(options, allowed) {
    for (const key of Object.keys(options)) {
        if (!allowed.includes(key)) throw new Error('Unsupported component parameter: ' + key);
    }
}

function parseWikiTemplate(template) {
    // SPARQL blocks retain their existing own-line closing delimiter. Consume
    // them whole, so query braces, equals signs and {{!}} are not UI syntax.
    const pattern = /\{\{SPARQL\s+[\s\S]*?^\}\}[ \t]*\r?$|\{\{Synia\s+(?:\{\{!\}\}|(?!\}\})[\s\S])*\}\}|^(={1,3})(?![=])[^\n]+?\1[ \t]*\r?$|^----[ \t]*\r?$/gm;
    const parts = [];
    let end = 0, match;
    while ((match = pattern.exec(template)) !== null) {
        if (match.index > end) parts.push({ kind: 'text', value: template.slice(end, match.index) });
        const value = match[0];
        if (value.startsWith('{{SPARQL')) parts.push({ kind: 'sparql', value });
        else if (value.startsWith('{{Synia')) parts.push({ kind: 'component', value: value.slice(7, -2) });
        else if (value.startsWith('----')) parts.push({ kind: 'rule' });
        else {
            const heading = /^(={1,3})(.*?)\1\s*$/.exec(value);
            parts.push({ kind: 'heading', level: heading[1].length, value: heading[2].trim() });
        }
        end = pattern.lastIndex;
    }
    if (end < template.length) parts.push({ kind: 'text', value: template.slice(end) });
    return parts;
}

syniaComponents.link = function (options, parent) {
    checkComponentOptions(options, ['label', 'target']);
    if (!options.label || !options.target) throw new Error('Synia link needs label and target.');
    const link = createSafeLink(options.label, options.target);
    link.className = 'synia-link';
    parent.append(link);
};

function renderWikiTemplate(template, parent, route, view) {
    if (!template.trim()) throw new Error('Template is empty.');
    for (const part of parseWikiTemplate(template)) {
        try {
            if (part.kind === 'sparql') renderSparqlPanel(part.value, parent, route, view);
            else if (part.kind === 'component') {
                const component = componentOptions(part.value);
                if (!Object.prototype.hasOwnProperty.call(syniaComponents, component.name)) {
                    throw new Error('Unsupported Synia component: ' + component.name);
                }
                syniaComponents[component.name](component.options, parent, route, view);
            } else if (part.kind === 'rule') parent.append(document.createElement('hr'));
            else if (part.kind === 'heading' || part.value.trim()) {
                const element = document.createElement(part.kind === 'heading' ? 'h' + part.level : 'p');
                if (part.kind === 'text') element.className = 'synia-text';
                element.textContent = part.value.trim();
                parent.append(element);
            }
        } catch (error) {
            showQueryWarning(error, parent);
        }
    }
}

function loadLayoutRegion(id, definition) {
    const parent = document.getElementById(id);
    if (!parent || definition == null) return Promise.resolve();
    const view = { active: true, tables: [] };
    // Layout is installation-wide, not interpolated with the current entity.
    const route = { q: null, q1: null, q2: null };
    return Promise.resolve().then(() => {
        if (!isRecord(definition) ||
            Object.keys(definition).length !== 1) throw new Error('Choose text or page for ' + id + '.');
        if (typeof definition.text === 'string') return definition.text;
        if (typeof definition.page === 'string' && definition.page.trim()) {
            return fetchJson(wikiTemplateUrl(definition.page), { mode: 'cors' }).then(templateContentFromResponse);
        }
        throw new Error('Choose text or page for ' + id + '.');
    }).then(template => {
        if (template === null) throw new Error('Layout template is missing.');
        if (template.trim()) renderWikiTemplate(template, parent, route, view);
    }).catch(error => showQueryWarning(new Error('Could not load ' + id + ': ' + error.message), parent));
}
