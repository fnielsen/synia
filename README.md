# synia
displaying wikibases

`python -m http.server`

## Installation configuration

Edit `site/js/config.js` for your installation. All wiki and query service
destinations belong in this file; no changes to `synia.js` are needed to select
another Wikibase. Set `namespace`, `templateApiUrl`, and `templateBaseUrl` to the
wiki pages containing your Synia templates. The template wiki can be separate
from the Wikibase being queried. Templates must use that Wikibase's entity IRIs
and properties; configuring URLs does not translate Wikidata-specific queries.

`endpoint` selects the default SPARQL endpoint. `allowedQueryServices` is the
allowlist for both the default endpoint and any template's `endpoint=` parameter.
Each entry pairs an exact endpoint URL with its optional query UI and embed page:

```javascript
window.configuration = {
    wikiUrl: "https://wiki.example.org",
    namespace: "Project:Synia:",
    templateApiUrl: "https://wiki.example.org/w/api.php",
    templateBaseUrl: "https://wiki.example.org/wiki/Project:Synia:",
    endpoint: "https://sparql.example.org/api/query",
    allowedQueryServices: [
        {
            endpoint: "https://sparql.example.org/api/query",
            queryServiceUrl: "https://queries.example.org/",
            embedUrl: "https://queries.example.org/embed.html",
        },
    ],
};
```

- The shipped configuration permits these Wikidata endpoints, each with its
  corresponding query UI and embed page:
  - `https://query.wikidata.org/sparql` (default)
  - `https://query-main.wikidata.org/sparql`
  - `https://query-scholarly.wikidata.org/sparql`
- Add an entry for every other trusted service that your templates use, including
  Wikibase.cloud installations.
- Matching uses parsed, normalized absolute URLs, including the path, port, and
  query string. It does not permit a whole domain or wildcard subdomains.
- URLs must use HTTP or HTTPS, without credentials or fragments. HTTP is supported
  for local installations; browser mixed-content and CORS restrictions still apply.
- Use the final endpoint URL: SPARQL requests reject redirects, including redirects
  between allowed endpoints.
- `queryServiceUrl` and `embedUrl` must accept a URL-encoded SPARQL query after `#`
  (the WDQS UI convention). Their hosts and paths need not match the endpoint.
  No UI URLs are inferred. Omit either field or set it to `null` when unavailable.
  Without `queryServiceUrl`, tables have no Query Service caption link; without
  `embedUrl`, a `#defaultView:` panel shows a warning instead of an iframe.
- Rejected panels display a text warning; later panels can still render.

`https://commons-query.wikimedia.org/sparql` is not included by default.
[Commons Query Service requires authentication cookies and session redirects](https://commons.wikimedia.org/wiki/Commons:SPARQL_query_service/API_endpoint).
Synia's cross-origin SPARQL requests do not send those cookies and reject
redirects, so adding the endpoint to the allowlist alone would not provide Commons
query support.

Existing installations should add `allowedQueryServices` and move the former
top-level `queryServiceUrl` into the corresponding entry (use the full UI URL,
including any trailing slash). Configure `embedUrl` explicitly. An absent or
empty allowlist permits no queries.

This controls destinations chosen by Synia's query renderer, not all networking:
an approved embedded page can redirect or load its own resources, and SPARQL
`SERVICE` clauses run at the query server. Only approve trusted embed pages.
A Content Security Policy is separate follow-up work. Configuration is public
client-side code; do not put secrets in it.

## Query-result text and links

Query values, labels, descriptions, and column headings are treated as text, not
HTML. The existing `Label`, `Description`, `Url`, and lowercase `url` column
conventions still determine the displayed text and links. Links allow absolute
HTTP(S) URLs without credentials, or `#...` Synia routes. Other URLs (including
`javascript:`, `data:`, relative paths, and URLs with unencoded whitespace/control
characters) display their labels as plain text. Result links may point to any
HTTP(S) host; the endpoint allowlist controls query/embed destinations separately.

Links are built using DOM text and attribute methods. The bundled DataTables 1.x
requires HTML strings for display, so Synia serializes these DOM-built nodes for
that interface. Search values are escaped as well; sorting uses the underlying
text. Internal links use a delegated click listener instead of inline JavaScript,
preserving hash navigation/reload and native modifier-click behavior.

## Tests

Run the dependency-free result-rendering checks with Node.js 12 or newer:

```sh
node tests/result-rendering.test.cjs
```

Run the offline endpoint-policy tests with Node.js 18 or newer:

```sh
node --test tests/query-services.test.cjs
```

The endpoint-policy tests use Node's built-in test runner; the result-rendering
checks use a standalone runner that also works on Node.js 12. Both use mocked
DOM/network calls, add no runtime dependencies, and do not contact Wikidata or
another service. These checks do not replace live browser testing.
