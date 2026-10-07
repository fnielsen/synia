// Minimal DOM/history and controllable requests for offline application tests.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const flush = () => new Promise(setImmediate);
const page = content => ({ query: { pages: [{ revisions: [
    { slots: { main: { content } } },
] }] } });
const results = value => ({ head: { vars: ['value'] },
    results: { bindings: [{ value: { value: String(value) } }] } });

function setup(hash = '', configure = () => {}) {
    class Element {
        constructor(tag) {
            this.tag = tag; this.attributes = {}; this.children = [];
            this.listeners = {}; this.text = ''; this.value = '';
        }
        set textContent(text) { this.text = String(text); this.children = []; }
        get textContent() { return this.text + this.children.map(child => child.textContent).join(''); }
        set innerHTML(value) { throw new Error('Unsafe HTML write: ' + value); }
        append(child) { this.children.push(child); child.parentElement = this; }
        setAttribute(name, value) { this.attributes[name] = String(value); }
        getAttribute(name) { return this.attributes[name] || null; }
        addEventListener(type, handler) { this.listeners[type] = handler; }
        closest(tag) { return this.tag === tag ? this : this.parentElement && this.parentElement.closest(tag); }
        focus() { focused = this; }
        remove() { this.parentElement.children = this.parentElement.children.filter(child => child !== this); }
        querySelectorAll(tag) {
            const all = [];
            for (const child of this.children) {
                if (child.tag === tag || (tag[0] === '#' && child.attributes.id === tag.slice(1))) all.push(child);
                all.push(...child.querySelectorAll(tag));
            }
            return all;
        }
        querySelector(tag) { return this.querySelectorAll(tag)[0] || null; }
    }
    let focused;
    const root = new Element('body');
    const regions = {};
    for (const id of ['site-header', 'content', 'site-footer']) {
        const node = new Element(id === 'content' ? 'main' : 'div');
        node.setAttribute('id', id); regions[id] = node; root.append(node);
    }
    const requests = [], tables = [], events = {}, history = [hash];
    let position = 0;
    const location = { reload() { throw new Error('Unexpected full reload'); } };
    Object.defineProperty(location, 'hash', {
        get: () => history[position],
        set(value) {
            if (value === history[position]) return;
            history.splice(position + 1); history.push(value); position++;
            if (events.hashchange) events.hashchange();
        },
    });
    const context = vm.createContext({
        URL, URLSearchParams, console, navigator: { language: 'en' },
        window: { location, addEventListener: (type, handler) => { events[type] = handler; } },
        document: { readyState: 'complete', createElement: tag => new Element(tag),
            getElementById: id => regions[id] || root.querySelector('#' + id),
            querySelector: selector => root.querySelector(selector) },
        $: element => ({ DataTable(options) {
            const entry = { element, options, destroyed: false };
            tables.push(entry);
            const api = { destroy() { entry.destroyed = true; } };
            options.initComplete.call({ api: () => api });
            return api;
        } }),
        fetch: (url, options) => new Promise((resolve, reject) => {
            requests.push({ url: String(url), options,
                respond: (body, status = 200) => resolve({ ok: status >= 200 && status < 300,
                    status, json: async () => body }), reject });
        }),
    });
    const script = name => vm.runInContext(fs.readFileSync(path.join(__dirname, '../site/js', name), 'utf8'), context);
    script('config.js'); configure(context.window.configuration);
    script('templates.js');
    script('synia.js');
    return { context, requests, tables, root, regions, history,
        get focused() { return focused; },
        go(value) { location.hash = value; },
        back() { if (position > 0) { position--; events.hashchange(); } },
        forward() { if (position < history.length - 1) { position++; events.hashchange(); } },
        click(link, overrides = {}) {
            const event = Object.assign({ target: link, button: 0, preventDefault() { this.defaultPrevented = true; } }, overrides);
            context.followSyniaLink(event); return event;
        },
    };
}
module.exports = { setup, flush, page, results };
