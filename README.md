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

- Add an entry for every trusted service that your templates use. The shipped
  configuration permits only Wikidata's `https://query.wikidata.org/sparql`.
  Other services, including Wikibase.cloud installations, require explicit entries.
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

Existing installations should add `allowedQueryServices` and move the former
top-level `queryServiceUrl` into the corresponding entry (use the full UI URL,
including any trailing slash). Configure `embedUrl` explicitly. An absent or
empty allowlist permits no queries.

This controls destinations chosen by Synia's query renderer, not all networking:
an approved embedded page can redirect or load its own resources, and SPARQL
`SERVICE` clauses run at the query server. Only approve trusted embed pages.
Query-result HTML/link sanitization and a Content Security Policy are separate
follow-up work. Configuration is public client-side code; do not put secrets in it.

## Tests

Run the offline endpoint-policy tests with Node.js 18 or newer:

```sh
node --test tests/query-services.test.cjs
```

The tests use Node's built-in test runner and mocked DOM/network calls. They add
no runtime dependencies and do not contact Wikidata or another service.
