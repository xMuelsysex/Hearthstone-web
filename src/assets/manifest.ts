import { z } from 'zod'

const assetSchema = z.object({
  id: z.string().min(1).max(128),
  kind: z.enum(['CARD', 'CARD_ART', 'HERO', 'HERO_ART', 'HERO_POWER', 'HERO_POWER_ART', 'BOARD', 'CARD_BACK', 'UI']),
  sourceUrl: z.string().url(),
  localPath: z.string().startsWith('/assets/'),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  byteLength: z.number().int().nonnegative(),
  purpose: z.string().min(1).max(256),
}).strict()

export const assetManifestSchema = z.object({
  schemaVersion: z.literal(1),
  assets: z.array(assetSchema).max(1024),
}).strict()

export type AssetManifest = z.infer<typeof assetManifestSchema>

export async function loadAssetManifest(fetcher: typeof fetch = fetch): Promise<AssetManifest> {
  const response = await fetcher('/assets/source-manifest.v1.json')
  if (!response.ok) {
    throw new Error(`ASSET_MANIFEST_HTTP_${response.status}`)
  }

  return assetManifestSchema.parse(await response.json())
}
