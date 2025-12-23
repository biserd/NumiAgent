import pRetry from 'p-retry';

const SPARQL_ENDPOINT = 'https://nomisma.org/sparql';

interface SparqlBinding {
  type: string;
  value: string;
  'xml:lang'?: string;
}

interface SparqlResult {
  head: { vars: string[] };
  results: { bindings: Array<Record<string, SparqlBinding>> };
}

export interface CoinType {
  uri: string;
  label?: string;
  denomination?: string;
  denominationLabel?: string;
  mint?: string;
  mintLabel?: string;
  authority?: string;
  authorityLabel?: string;
  material?: string;
  materialLabel?: string;
  startDate?: string;
  endDate?: string;
  obverseDescription?: string;
  reverseDescription?: string;
  weight?: number;
  diameter?: number;
}

async function executeSparql(query: string): Promise<SparqlResult> {
  const encodedQuery = encodeURIComponent(query);
  const url = `${SPARQL_ENDPOINT}?query=${encodedQuery}&output=json`;

  const result = await pRetry(
    async () => {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/sparql-results+json',
          'User-Agent': 'NumisVault/1.0 (Coin Research Platform)',
        },
      });

      if (!response.ok) {
        throw new Error(`SPARQL query failed: ${response.status} ${response.statusText}`);
      }

      return response.json() as Promise<SparqlResult>;
    },
    {
      retries: 3,
      minTimeout: 1000,
      maxTimeout: 5000,
    }
  );

  return result;
}

export async function getCoinTypesForMint(mintUri: string, limit: number = 50): Promise<CoinType[]> {
  const query = `
    PREFIX nmo: <http://nomisma.org/ontology#>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
    PREFIX dcterms: <http://purl.org/dc/terms/>
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>

    SELECT DISTINCT ?coinType ?label ?denomination ?denomLabel ?authority ?authLabel ?material ?matLabel ?startDate ?endDate
    WHERE {
      ?coinType a nmo:TypeSeriesItem ;
                nmo:hasMint <${mintUri}> .
      
      OPTIONAL { 
        ?coinType skos:prefLabel ?label .
        FILTER(langMatches(lang(?label), "EN") || lang(?label) = "")
      }
      OPTIONAL { 
        ?coinType nmo:hasDenomination ?denomination .
        ?denomination skos:prefLabel ?denomLabel .
        FILTER(langMatches(lang(?denomLabel), "EN") || lang(?denomLabel) = "")
      }
      OPTIONAL { 
        ?coinType nmo:hasAuthority ?authority .
        ?authority skos:prefLabel ?authLabel .
        FILTER(langMatches(lang(?authLabel), "EN") || lang(?authLabel) = "")
      }
      OPTIONAL { 
        ?coinType nmo:hasMaterial ?material .
        ?material skos:prefLabel ?matLabel .
        FILTER(langMatches(lang(?matLabel), "EN") || lang(?matLabel) = "")
      }
      OPTIONAL { ?coinType nmo:hasStartDate ?startDate }
      OPTIONAL { ?coinType nmo:hasEndDate ?endDate }
    }
    LIMIT ${limit}
  `;

  const result = await executeSparql(query);

  return result.results.bindings.map(binding => ({
    uri: binding.coinType?.value,
    label: binding.label?.value,
    denomination: binding.denomination?.value,
    denominationLabel: binding.denomLabel?.value,
    authority: binding.authority?.value,
    authorityLabel: binding.authLabel?.value,
    material: binding.material?.value,
    materialLabel: binding.matLabel?.value,
    startDate: binding.startDate?.value,
    endDate: binding.endDate?.value,
  }));
}

export async function getCoinTypesForRuler(rulerUri: string, limit: number = 50): Promise<CoinType[]> {
  const query = `
    PREFIX nmo: <http://nomisma.org/ontology#>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
    PREFIX dcterms: <http://purl.org/dc/terms/>

    SELECT DISTINCT ?coinType ?label ?denomination ?denomLabel ?mint ?mintLabel ?material ?matLabel ?startDate ?endDate
    WHERE {
      ?coinType a nmo:TypeSeriesItem ;
                nmo:hasAuthority <${rulerUri}> .
      
      OPTIONAL { 
        ?coinType skos:prefLabel ?label .
        FILTER(langMatches(lang(?label), "EN") || lang(?label) = "")
      }
      OPTIONAL { 
        ?coinType nmo:hasDenomination ?denomination .
        ?denomination skos:prefLabel ?denomLabel .
        FILTER(langMatches(lang(?denomLabel), "EN") || lang(?denomLabel) = "")
      }
      OPTIONAL { 
        ?coinType nmo:hasMint ?mint .
        ?mint skos:prefLabel ?mintLabel .
        FILTER(langMatches(lang(?mintLabel), "EN") || lang(?mintLabel) = "")
      }
      OPTIONAL { 
        ?coinType nmo:hasMaterial ?material .
        ?material skos:prefLabel ?matLabel .
        FILTER(langMatches(lang(?matLabel), "EN") || lang(?matLabel) = "")
      }
      OPTIONAL { ?coinType nmo:hasStartDate ?startDate }
      OPTIONAL { ?coinType nmo:hasEndDate ?endDate }
    }
    LIMIT ${limit}
  `;

  const result = await executeSparql(query);

  return result.results.bindings.map(binding => ({
    uri: binding.coinType?.value,
    label: binding.label?.value,
    denomination: binding.denomination?.value,
    denominationLabel: binding.denomLabel?.value,
    mint: binding.mint?.value,
    mintLabel: binding.mintLabel?.value,
    material: binding.material?.value,
    materialLabel: binding.matLabel?.value,
    startDate: binding.startDate?.value,
    endDate: binding.endDate?.value,
  }));
}

export async function getCoinTypesForDenomination(denomUri: string, limit: number = 50): Promise<CoinType[]> {
  const query = `
    PREFIX nmo: <http://nomisma.org/ontology#>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

    SELECT DISTINCT ?coinType ?label ?authority ?authLabel ?mint ?mintLabel ?material ?matLabel ?startDate ?endDate
    WHERE {
      ?coinType a nmo:TypeSeriesItem ;
                nmo:hasDenomination <${denomUri}> .
      
      OPTIONAL { 
        ?coinType skos:prefLabel ?label .
        FILTER(langMatches(lang(?label), "EN") || lang(?label) = "")
      }
      OPTIONAL { 
        ?coinType nmo:hasAuthority ?authority .
        ?authority skos:prefLabel ?authLabel .
        FILTER(langMatches(lang(?authLabel), "EN") || lang(?authLabel) = "")
      }
      OPTIONAL { 
        ?coinType nmo:hasMint ?mint .
        ?mint skos:prefLabel ?mintLabel .
        FILTER(langMatches(lang(?mintLabel), "EN") || lang(?mintLabel) = "")
      }
      OPTIONAL { 
        ?coinType nmo:hasMaterial ?material .
        ?material skos:prefLabel ?matLabel .
        FILTER(langMatches(lang(?matLabel), "EN") || lang(?matLabel) = "")
      }
      OPTIONAL { ?coinType nmo:hasStartDate ?startDate }
      OPTIONAL { ?coinType nmo:hasEndDate ?endDate }
    }
    LIMIT ${limit}
  `;

  const result = await executeSparql(query);

  return result.results.bindings.map(binding => ({
    uri: binding.coinType?.value,
    label: binding.label?.value,
    authority: binding.authority?.value,
    authorityLabel: binding.authLabel?.value,
    mint: binding.mint?.value,
    mintLabel: binding.mintLabel?.value,
    material: binding.material?.value,
    materialLabel: binding.matLabel?.value,
    startDate: binding.startDate?.value,
    endDate: binding.endDate?.value,
  }));
}

export async function getPhysicalCoinsForType(typeUri: string, limit: number = 20): Promise<Array<{
  uri: string;
  collection?: string;
  weight?: number;
  diameter?: number;
  axis?: number;
  obverseImage?: string;
  reverseImage?: string;
}>> {
  const query = `
    PREFIX nmo: <http://nomisma.org/ontology#>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>

    SELECT DISTINCT ?coin ?collection ?weight ?diameter ?axis ?obvThumb ?revThumb
    WHERE {
      ?coin nmo:hasTypeSeriesItem <${typeUri}> .
      
      OPTIONAL { 
        ?coin nmo:hasCollection ?coll .
        ?coll skos:prefLabel ?collection .
        FILTER(langMatches(lang(?collection), "EN") || lang(?collection) = "")
      }
      OPTIONAL { ?coin nmo:hasWeight ?weight }
      OPTIONAL { ?coin nmo:hasDiameter ?diameter }
      OPTIONAL { ?coin nmo:hasAxis ?axis }
      OPTIONAL { 
        ?coin nmo:hasObverse ?obv .
        ?obv foaf:thumbnail ?obvThumb 
      }
      OPTIONAL { 
        ?coin nmo:hasReverse ?rev .
        ?rev foaf:thumbnail ?revThumb 
      }
    }
    LIMIT ${limit}
  `;

  const result = await executeSparql(query);

  return result.results.bindings.map(binding => ({
    uri: binding.coin?.value,
    collection: binding.collection?.value,
    weight: binding.weight?.value ? parseFloat(binding.weight.value) : undefined,
    diameter: binding.diameter?.value ? parseFloat(binding.diameter.value) : undefined,
    axis: binding.axis?.value ? parseInt(binding.axis.value) : undefined,
    obverseImage: binding.obvThumb?.value,
    reverseImage: binding.revThumb?.value,
  }));
}

export async function getMintCoordinates(mintUri: string): Promise<{ lat?: number; lng?: number } | null> {
  const query = `
    PREFIX geo: <http://www.w3.org/2003/01/geo/wgs84_pos#>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

    SELECT ?lat ?long
    WHERE {
      <${mintUri}> geo:lat ?lat ;
                   geo:long ?long .
    }
    LIMIT 1
  `;

  const result = await executeSparql(query);
  
  if (result.results.bindings.length === 0) {
    return null;
  }

  const binding = result.results.bindings[0];
  return {
    lat: binding.lat?.value ? parseFloat(binding.lat.value) : undefined,
    lng: binding.long?.value ? parseFloat(binding.long.value) : undefined,
  };
}
