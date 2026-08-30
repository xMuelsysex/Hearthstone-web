import sourceManifest from '../../public/assets/source-manifest.v1.json'
import { loadAssetManifest } from '@/assets/manifest'
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
})
