import { createHash } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const snapshot = JSON.parse(await readFile(resolve(root, 'src/cards/data/source-selected.250339.json'), 'utf8'))
const assets = []
const originalArtAssets = snapshot.selectedCards.flatMap((card) => {
  if (card.type === 'MINION') return [{ id: card.id, kind: 'CARD_ART', folder: 'card-art' }]
  if (card.type === 'HERO') return [{ id: card.id, kind: 'HERO_ART', folder: 'hero-art' }]
  if (card.type === 'HERO_POWER') return [{ id: card.id, kind: 'HERO_POWER_ART', folder: 'hero-power-art' }]
  return []
})

async function hashFile(path) {
  const bytes = await readFile(path)
  return { sha256: createHash('sha256').update(bytes).digest('hex'), byteLength: bytes.byteLength }
}

async function download(url, path) {
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) throw new Error(`Asset download failed ${response.status}: ${url}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (!response.headers.get('content-type')?.startsWith('image/')) throw new Error(`Asset is not an image: ${url}`)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, bytes)
}

for (const card of snapshot.selectedCards) {
  const kind = card.type === 'HERO' ? 'HERO' : card.type === 'HERO_POWER' ? 'HERO_POWER' : 'CARD'
  const folder = kind === 'HERO' ? 'heroes' : kind === 'HERO_POWER' ? 'hero-powers' : 'cards'
  const localPath = `/assets/${folder}/${card.id}.png`
  const absolutePath = resolve(root, `public${localPath}`)
  const sourceUrl = `https://art.hearthstonejson.com/v1/render/latest/zhCN/512x/${card.id}.png`
  try {
    await stat(absolutePath)
  } catch {
    await download(sourceUrl, absolutePath)
  }
  const integrity = await hashFile(absolutePath)
  assets.push({ id: `${kind.toLowerCase()}:${card.id}`, kind, sourceUrl, localPath, ...integrity, purpose: `${card.name} 的官方中文渲染图` })
}

for (const asset of originalArtAssets) {
  const localPath = `/assets/${asset.folder}/${asset.id}.png`
  const absolutePath = resolve(root, `public${localPath}`)
  const sourceUrl = `https://art.hearthstonejson.com/v1/orig/${asset.id}.png`
  try {
    await stat(absolutePath)
  } catch {
    await download(sourceUrl, absolutePath)
  }
  const integrity = await hashFile(absolutePath)
  const manifestId = `${asset.kind.toLowerCase().replaceAll('_', '-')}:${asset.id}`
  assets.push({ id: manifestId, kind: asset.kind, sourceUrl, localPath, ...integrity, purpose: `${asset.id} 的官方原画` })
}

const staticAssets = [
  {
    id: 'board:witchwood', kind: 'BOARD',
    sourceUrl: 'https://blizzard.gamespress.com/Kit/Details/The-Witchwood-Announcement-Press-Kit',
    localPath: '/assets/board/witchwood-board.jpg', purpose: '展示战棋盘视觉',
  },
  {
    id: 'card-back:dark-wood', kind: 'CARD_BACK',
    sourceUrl: 'https://blizzard.gamespress.com/Kit/Details/The-Witchwood-Announcement-Press-Kit',
    localPath: '/assets/card-back/in-a-dark-wood.png', purpose: '对手隐藏手牌卡背',
  },
]

for (const asset of staticAssets) {
  const integrity = await hashFile(resolve(root, `public${asset.localPath}`))
  assets.push({ ...asset, ...integrity })
}

assets.sort((left, right) => left.id.localeCompare(right.id))
await writeFile(resolve(root, 'public/assets/source-manifest.v1.json'), `${JSON.stringify({ schemaVersion: 1, assets }, null, 2)}\n`)
console.log(JSON.stringify({ assets: assets.length, bytes: assets.reduce((sum, asset) => sum + asset.byteLength, 0), manifest: basename('source-manifest.v1.json') }))
