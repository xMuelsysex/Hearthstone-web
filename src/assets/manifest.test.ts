import { loadAssetManifest } from '@/assets/manifest'

describe('loadAssetManifest', () => {
  it('reports an explicit HTTP failure', async () => {
    const fetcher = vi.fn(async () => new Response('', { status: 503 }))

    await expect(loadAssetManifest(fetcher)).rejects.toThrow('ASSET_MANIFEST_HTTP_503')
  })
})
