import sourceManifest from '../../public/assets/source-manifest.v1.json'
import { loadAssetManifest } from '@/assets/manifest'
import { SOURCED_DECKS_V1 } from '@/cards/decks'
import { CARD_DEFINITIONS_V1 } from '@/cards/registry'

describe('loadAssetManifest', () => {
  it('reports an explicit HTTP failure', async () => {
    const fetcher = vi.fn(async () => new Response('', { status: 503 }))

    await expect(loadAssetManifest(fetcher)).rejects.toThrow('ASSET_MANIFEST_HTTP_503')
  })

  it('registers original art for every supported minion', async () => {
    const manifest = await loadAssetManifest(async () => new Response(JSON.stringify(sourceManifest), {
      headers: { 'content-type': 'application/json' },
    }))
    const minionIds = Object.values(CARD_DEFINITIONS_V1)
      .filter((definition) => definition.type === 'MINION')
      .map((definition) => definition.id)
    const cardArt = new Map(manifest.assets.filter((asset) => asset.kind === 'CARD_ART').map((asset) => [asset.id, asset]))

    expect(cardArt.size).toBe(minionIds.length)
    for (const definitionId of minionIds) {
      expect(cardArt.get(`card-art:${definitionId}`)).toMatchObject({
        localPath: `/assets/card-art/${definitionId}.png`,
        sourceUrl: `https://art.hearthstonejson.com/v1/orig/${definitionId}.png`,
      })
    }
  })

  it('resolves every card definition asset id through the manifest', async () => {
    const manifest = await loadAssetManifest(async () => new Response(JSON.stringify(sourceManifest), {
      headers: { 'content-type': 'application/json' },
    }))
    const assetIds = new Set(manifest.assets.map((asset) => asset.id))

    for (const definition of Object.values(CARD_DEFINITIONS_V1)) {
      expect(assetIds.has(definition.assetId), definition.id).toBe(true)
    }
  })

  it('registers portraits for every sourced hero and hero power', async () => {
    const manifest = await loadAssetManifest(async () => new Response(JSON.stringify(sourceManifest), {
      headers: { 'content-type': 'application/json' },
    }))
    const assetsById = new Map(manifest.assets.map((asset) => [asset.id, asset]))

    for (const deck of SOURCED_DECKS_V1) {
      expect(assetsById.get(`hero-art:${deck.heroId}`)).toMatchObject({
        kind: 'HERO_ART',
        localPath: `/assets/hero-art/${deck.heroId}.png`,
      })
      expect(assetsById.get(`hero-power-art:${deck.heroPowerId}`)).toMatchObject({
        kind: 'HERO_POWER_ART',
        localPath: `/assets/hero-power-art/${deck.heroPowerId}.png`,
      })
    }
  })
})
