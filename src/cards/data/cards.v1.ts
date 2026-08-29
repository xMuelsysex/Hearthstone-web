import snapshot from './source-selected.249896.json' with { type: 'json' }

export const CARD_DATA_VERSION = '249896-zhCN-v1' as const
export const CARD_SOURCE = {
  build: snapshot.build,
  locale: snapshot.locale,
  sourceUrl: snapshot.sourceUrl,
  sourceSha256: snapshot.sourceSha256,
  sourceByteLength: snapshot.sourceByteLength,
} as const

export const SELECTED_CARD_SOURCE_V1 = snapshot.selectedCards
