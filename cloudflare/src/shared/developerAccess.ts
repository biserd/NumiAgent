export const developerKeyScope = 'collection:read'
export const developerKeyLifespanDays = 90
export const developerRequestLimit = 120
export const developerReadPaths: readonly string[] = [
  '/collections', '/items', '/items/statistics', '/items/{id}',
  '/imports', '/imports/{id}', '/photos/{id}', '/photos/{id}/status',
  '/themes', '/themes/{id}', '/valuations/{id}', '/valuations/{id}/history', '/valuations/{id}/research',
  '/references', '/references/ocre', '/exchange-rates', '/market/search', '/watchlists'
]
