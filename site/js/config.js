// Installation settings. Edit this file to use another Wikibase or template wiki.
window.configuration = {
    wikiUrl: "https://www.wikidata.org",
    namespace: "Wikidata:Synia:",
    templateApiUrl: "https://www.wikidata.org/w/api.php",
    templateBaseUrl: "https://www.wikidata.org/wiki/Wikidata:Synia:",

    // Optional layout: inline text, or { page: "Wikidata:Synia:header" }.
    // Page titles are full titles on templateApiUrl. null disables a region.
    layout: {
        header: { text: "{{Synia link | label = Home | target = #}}" },
        footer: null,
    },

    // Default SPARQL endpoint; it must also appear in allowedQueryServices.
    endpoint: "https://query.wikidata.org/sparql",

    // Templates may select only these exact endpoints (not whole hostnames).
    // Add trusted services here; no destinations are inferred from an endpoint.
    // Omit queryServiceUrl or embedUrl (or set null) if a service lacks that UI.
    allowedQueryServices: [
        {
            endpoint: "https://query.wikidata.org/sparql",
            queryServiceUrl: "https://query.wikidata.org/",
            embedUrl: "https://query.wikidata.org/embed.html",
        },
        {
            endpoint: "https://query-main.wikidata.org/sparql",
            queryServiceUrl: "https://query-main.wikidata.org/",
            embedUrl: "https://query-main.wikidata.org/embed.html",
        },
        {
            endpoint: "https://query-scholarly.wikidata.org/sparql",
            queryServiceUrl: "https://query-scholarly.wikidata.org/",
            embedUrl: "https://query-scholarly.wikidata.org/embed.html",
        },
    ],
};
