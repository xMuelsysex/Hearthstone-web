import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decode } from 'deckstrings'
import { SOURCED_DECK_INPUTS_250339 } from './data/sourced-decks.250339.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = resolve(root, '.cache/hearthstone/cards-250339-zhCN.json')
const outputDir = resolve(root, 'src/cards/data')

const BUILD = 250339
const LOCALE = 'zhCN'
const CUTOFF_DATE = '2026-08-31'
const OFFICIAL_FORMAT_SOURCE = {
  sourceUrl: 'https://hearthstone.blizzard.com/en-us/news/24293283',
  publishedAt: '2026-08-24',
  title: '36.4 Patch Notes',
}
const SOURCE_URL = `https://api.hearthstonejson.com/v1/${BUILD}/${LOCALE}/cards.json`
const SOURCE_SHA256 = '4c815ace15781d07e45588265971a7e4e46e2b91bc47c640378c488fea16e5bf'

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
  'CS2_boar', 'EX1_025t', 'skele21', 'GAME_005',
  'HERO_11bpt', 'CS2_101t', 'CS2_050', 'CS2_051', 'CS2_052', 'CS2_058', 'CS2_082',
  'DINO_136t', 'DINO_410t', 'DINO_410t2', 'DINO_410t3', 'DINO_410t4', 'DINO_410t5',
  'UNG_809t1', 'CATA_153t',
  'JAIL_732', 'CATA_479t3', 'EDR_810t',
]

const expandDeckCards = (cards, byDbfId, deckId) => cards.flatMap(([dbfId, count]) => {
  const card = byDbfId.get(dbfId)
  if (!card) throw new Error(`Deck references missing dbfId: ${deckId}:${dbfId}`)
  return Array.from({ length: count }, () => card.id)
})

const decodeSideboards = (cards, byDbfId, deckId) => {
  const byOwner = new Map()
  for (const [dbfId, count, ownerDbfId] of cards) {
    const card = byDbfId.get(dbfId)
    const owner = byDbfId.get(ownerDbfId)
    if (!card || !owner) throw new Error(`Sideboard references missing dbfId: ${deckId}:${dbfId}:${ownerDbfId}`)
    const cardIds = byOwner.get(owner.id) ?? []
    cardIds.push(...Array.from({ length: count }, () => card.id))
    byOwner.set(owner.id, cardIds)
  }
  return [...byOwner].map(([ownerCardId, cardIds]) => ({ ownerCardId, cardIds }))
}

const allowedFields = [
  'id', 'dbfId', 'name', 'cost', 'attack', 'health', 'durability', 'type',
  'cardClass', 'classes', 'rarity', 'set', 'text', 'mechanics', 'race', 'races', 'collectible',
]

const sourceBytes = await readFile(sourcePath)
const actualDigest = createHash('sha256').update(sourceBytes).digest('hex')
if (actualDigest !== SOURCE_SHA256) {
  throw new Error(`Source digest mismatch: expected ${SOURCE_SHA256}, received ${actualDigest}`)
}

const sourceCards = JSON.parse(sourceBytes.toString('utf8'))
const byId = new Map(sourceCards.map((card) => [card.id, card]))
const byDbfId = new Map(sourceCards.map((card) => [card.dbfId, card]))
const sourcedDecks = SOURCED_DECK_INPUTS_250339.map((input) => {
  if (input.sourceDate > CUTOFF_DATE) throw new Error(`Deck source is after cutoff: ${input.id}`)

  if (input.sourceEvidence) {
    if (
      input.sourceEvidence.provider !== 'HSReplay'
      || !/^https:\/\/hsreplay\.net\/decks\/[A-Za-z0-9_-]+\/$/.test(input.sourceEvidence.url)
      || input.sourceEvidence.checkedAt !== '2026-09-02'
      || input.sourceEvidence.scope !== 'DECK_CODE_AND_CARD_LIST'
    ) {
      throw new Error(`Invalid source evidence: ${input.id}`)
    }
  }

  const decoded = decode(input.deckCode)
  const expectedFormat = input.format === 'STANDARD' ? 2 : 1
  if (decoded.format !== expectedFormat) throw new Error(`Deck format mismatch: ${input.id}`)
  if (decoded.heroes.length !== 1) throw new Error(`Deck hero count mismatch: ${input.id}`)

  const hero = byDbfId.get(decoded.heroes[0])
  if (!hero) throw new Error(`Deck references missing hero dbfId: ${input.id}:${decoded.heroes[0]}`)
  const cardIds = expandDeckCards(decoded.cards, byDbfId, input.id)
  if (![30, 40].includes(cardIds.length)) throw new Error(`Deck size mismatch: ${input.id}:${cardIds.length}`)

  return {
    ...input,
    ...(input.sourceEvidence
      ? {
          sourceEvidence: {
            ...input.sourceEvidence,
            deckCodeUrl: `https://hsreplay.net/decks/${encodeURIComponent(input.deckCode)}/`,
          },
        }
      : {}),
    heroId: hero.id,
    cardIds,
    sideboards: decodeSideboards(decoded.sideboardCards, byDbfId, input.id),
  }
})
const sourcedCardIds = [...new Set(sourcedDecks.flatMap((deck) => [
  ...deck.cardIds,
  ...deck.sideboards.flatMap((sideboard) => sideboard.cardIds),
]))]
const selectedIds = [...new Set([
  ...mageDeck,
  ...warriorDeck,
  ...fixtureCards,
  ...collectiblePool,
  ...dependencies,
  ...sourcedDecks.flatMap(({ heroId, heroPowerId, cardIds, sideboards }) => [
    heroId,
    heroPowerId,
    ...cardIds,
    ...sideboards.flatMap((sideboard) => sideboard.cardIds),
  ]),
])]
const missing = selectedIds.filter((id) => !byId.has(id))
if (missing.length > 0) {
  throw new Error(`Missing selected card ids: ${missing.join(', ')}`)
}

const selectedCards = selectedIds.map((id) => {
  const source = byId.get(id)
  return Object.fromEntries(allowedFields.filter((field) => source[field] !== undefined).map((field) => [field, source[field]]))
})
const selectedById = new Map(selectedCards.map((card) => [card.id, card]))
for (const deck of sourcedDecks) {
  const hero = selectedById.get(deck.heroId)
  const heroPower = selectedById.get(deck.heroPowerId)
  const heroClasses = Array.isArray(hero.classes) && hero.classes.length > 0 ? hero.classes : [hero.cardClass]
  if (hero.type !== 'HERO' || !heroClasses.includes(deck.ownerClass)) {
    throw new Error(`Deck hero mismatch: ${deck.id}:${deck.heroId}`)
  }
  const heroPowerClasses = Array.isArray(heroPower.classes) && heroPower.classes.length > 0
    ? heroPower.classes
    : [heroPower.cardClass]
  const rawHero = byId.get(deck.heroId)
  if (
    heroPower.type !== 'HERO_POWER'
    || !heroPowerClasses.includes(deck.ownerClass)
    || rawHero.heroPowerDbfId !== heroPower.dbfId
  ) {
    throw new Error(`Deck hero power mismatch: ${deck.id}:${deck.heroPowerId}`)
  }
  for (const cardId of deck.cardIds) {
    const card = selectedById.get(cardId)
    const classes = Array.isArray(card.classes) && card.classes.length > 0 ? card.classes : [card.cardClass]
    if (!classes.includes('NEUTRAL') && !classes.includes(deck.ownerClass)) {
      throw new Error(`Deck class mismatch: ${deck.id}:${cardId}`)
    }
  }
  for (const sideboard of deck.sideboards) {
    if (!deck.cardIds.includes(sideboard.ownerCardId)) {
      throw new Error(`Sideboard owner is not in main deck: ${deck.id}:${sideboard.ownerCardId}`)
    }
  }
}

const sourceSnapshot = {
  schemaVersion: 1,
  build: BUILD,
  locale: LOCALE,
  cutoffDate: CUTOFF_DATE,
  sourceUrl: SOURCE_URL,
  sourceSha256: SOURCE_SHA256,
  sourceByteLength: sourceBytes.byteLength,
  officialFormatSource: OFFICIAL_FORMAT_SOURCE,
  selectedCards,
  sourcedDecks,
}

const deckFile = `export const MAGE_DECK_V1 = ${JSON.stringify(mageDeck.flatMap((id) => [id, id]), null, 2)} as const\n\nexport const WARRIOR_DECK_V1 = ${JSON.stringify(warriorDeck.flatMap((id) => [id, id]), null, 2)} as const\n\nexport const FIXTURE_CARD_IDS_V1 = ${JSON.stringify(fixtureCards, null, 2)} as const\n`

const sourcedDeckFile = `export const CARD_CATALOG_CUTOFF_V1 = ${JSON.stringify(CUTOFF_DATE)} as const\n\nexport const CARD_CATALOG_CUTOFF_SOURCE_V1 = ${JSON.stringify(OFFICIAL_FORMAT_SOURCE, null, 2)} as const\n\nexport const SOURCED_CARD_IDS_V1 = ${JSON.stringify(sourcedCardIds, null, 2)} as const\n\nexport const SOURCED_DECKS_V1 = ${JSON.stringify(sourcedDecks, null, 2)} as const\n`

const cardFile = `import snapshot from './source-selected.250339.json' with { type: 'json' }\n\nexport const CARD_DATA_VERSION = '250339-zhCN-v1' as const\nexport const CARD_SOURCE = {\n  build: snapshot.build,\n  locale: snapshot.locale,\n  cutoffDate: snapshot.cutoffDate,\n  sourceUrl: snapshot.sourceUrl,\n  sourceSha256: snapshot.sourceSha256,\n  sourceByteLength: snapshot.sourceByteLength,\n} as const\n\nexport const SELECTED_CARD_SOURCE_V1 = snapshot.selectedCards\n`
const poolFile = `export const M1_COLLECTIBLE_POOL_V1 = ${JSON.stringify(collectiblePool, null, 2)} as const\n`

await mkdir(outputDir, { recursive: true })
await writeFile(resolve(outputDir, 'source-selected.250339.json'), `${JSON.stringify(sourceSnapshot, null, 2)}\n`)
await writeFile(resolve(outputDir, 'decks.v1.ts'), deckFile)
await writeFile(resolve(outputDir, 'sourced-decks.v1.ts'), sourcedDeckFile)
await writeFile(resolve(outputDir, 'cards.v1.ts'), cardFile)
await writeFile(resolve(outputDir, 'collectible-pool.v1.ts'), poolFile)

console.log(JSON.stringify({ selectedCards: selectedCards.length, collectibleCards: selectedCards.filter((card) => card.collectible).length, collectiblePoolCards: collectiblePool.length, mageDeckCards: mageDeck.length * 2, warriorDeckCards: warriorDeck.length * 2 }))
