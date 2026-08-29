import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = resolve(root, '.cache/hearthstone/cards-249896-zhCN.json')
const outputDir = resolve(root, 'src/cards/data')

const BUILD = 249896
const LOCALE = 'zhCN'
const SOURCE_URL = `https://api.hearthstonejson.com/v1/${BUILD}/${LOCALE}/cards.json`
const SOURCE_SHA256 = '0a48530c48e0c15995790fcbedbc4d6e07474d8d1cf1c18eaaad8f2f0c1d3a3c'

const mageDeck = [
  'RLK_843', 'BAR_541', 'DRG_066', 'BOT_563', 'BOT_309',
  'CS2_029', 'CS2_023', 'CS2_182', 'CS2_120', 'CS2_168',
  'CS2_172', 'CS2_200', 'CS2_189', 'CS2_196', 'CS2_179',
]

const warriorDeck = [
  'BT_233', 'EX1_606', 'CS2_106', 'EX1_400', 'CS2_105',
  'CS2_108', 'CS2_119', 'CS2_118', 'CS2_121', 'CS2_150',
  'DS1_055', 'EX1_025', 'CS2_186', 'CORE_GVG_053', 'CORE_OG_149',
]

const fixtureCards = ['EX1_029', 'EX1_556']
const collectiblePool = [
  'RLK_843', 'BAR_541', 'DRG_066', 'BOT_563', 'BOT_309', 'BT_233', 'CORE_OG_149', 'EX1_029', 'EX1_556',
  'AT_001', 'AT_006', 'AT_007', 'AT_064', 'AT_066', 'AT_068', 'AT_082',
  'CORE_GVG_053', 'AT_002', 'AT_003', 'AT_005', 'AT_065', 'AT_069', 'AT_071', 'AT_086', 'AT_088', 'AT_105', 'AT_106', 'AT_108',
  'AT_004', 'AT_008', 'AT_017', 'AT_067', 'AT_080', 'AT_098', 'AT_099', 'AT_113',
  'AT_009', 'AT_070', 'AT_072', 'AT_122',
]
const dependencies = [
  'CS2_boar', 'EX1_025t', 'skele21',
  'HERO_08', 'HERO_08bp', 'HERO_01', 'HERO_01bp', 'GAME_005',
]
const selectedIds = [...new Set([...mageDeck, ...warriorDeck, ...fixtureCards, ...collectiblePool, ...dependencies])]

const allowedFields = [
  'id', 'dbfId', 'name', 'cost', 'attack', 'health', 'durability', 'type',
  'cardClass', 'rarity', 'set', 'text', 'mechanics', 'race', 'races', 'collectible',
]

const sourceBytes = await readFile(sourcePath)
const actualDigest = createHash('sha256').update(sourceBytes).digest('hex')
if (actualDigest !== SOURCE_SHA256) {
  throw new Error(`Source digest mismatch: expected ${SOURCE_SHA256}, received ${actualDigest}`)
}

const sourceCards = JSON.parse(sourceBytes.toString('utf8'))
const byId = new Map(sourceCards.map((card) => [card.id, card]))
const missing = selectedIds.filter((id) => !byId.has(id))
if (missing.length > 0) {
  throw new Error(`Missing selected card ids: ${missing.join(', ')}`)
}

const selectedCards = selectedIds.map((id) => {
  const source = byId.get(id)
  return Object.fromEntries(allowedFields.filter((field) => source[field] !== undefined).map((field) => [field, source[field]]))
})

const sourceSnapshot = {
  schemaVersion: 1,
  build: BUILD,
  locale: LOCALE,
  sourceUrl: SOURCE_URL,
  sourceSha256: SOURCE_SHA256,
  sourceByteLength: sourceBytes.byteLength,
  selectedCards,
}

const deckFile = `export const MAGE_DECK_V1 = ${JSON.stringify(mageDeck.flatMap((id) => [id, id]), null, 2)} as const\n\nexport const WARRIOR_DECK_V1 = ${JSON.stringify(warriorDeck.flatMap((id) => [id, id]), null, 2)} as const\n\nexport const FIXTURE_CARD_IDS_V1 = ${JSON.stringify(fixtureCards, null, 2)} as const\n`

const cardFile = `import snapshot from './source-selected.249896.json' with { type: 'json' }\n\nexport const CARD_DATA_VERSION = '249896-zhCN-v1' as const\nexport const CARD_SOURCE = {\n  build: snapshot.build,\n  locale: snapshot.locale,\n  sourceUrl: snapshot.sourceUrl,\n  sourceSha256: snapshot.sourceSha256,\n  sourceByteLength: snapshot.sourceByteLength,\n} as const\n\nexport const SELECTED_CARD_SOURCE_V1 = snapshot.selectedCards\n`
const poolFile = `export const M1_COLLECTIBLE_POOL_V1 = ${JSON.stringify(collectiblePool, null, 2)} as const\n`

await mkdir(outputDir, { recursive: true })
await writeFile(resolve(outputDir, 'source-selected.249896.json'), `${JSON.stringify(sourceSnapshot, null, 2)}\n`)
await writeFile(resolve(outputDir, 'decks.v1.ts'), deckFile)
await writeFile(resolve(outputDir, 'cards.v1.ts'), cardFile)
await writeFile(resolve(outputDir, 'collectible-pool.v1.ts'), poolFile)

console.log(JSON.stringify({ selectedCards: selectedCards.length, collectibleCards: selectedCards.filter((card) => card.collectible).length, collectiblePoolCards: collectiblePool.length, mageDeckCards: mageDeck.length * 2, warriorDeckCards: warriorDeck.length * 2 }))
