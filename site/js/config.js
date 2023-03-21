queryServiceUrl = "https://query.wikidata.org";
wikiUrl = "https://www.wikidata.org",
namespace = "Wikidata:Synia:",

endpoint = queryServiceUrl + "/sparql",
templateApiUrl = wikiUrl + "/w/api.php",
templateBaseUrl = wikiUrl + '/wiki/' + namespace,

window.configuration = {
    queryServiceUrl: queryServiceUrl,
    wikiUrl: wikiUrl,
    namespace: namespace,

    endpoint: endpoint,
    templateApiUrl: templateApiUrl,
    templateBaseUrl: templateBaseUrl,
}
