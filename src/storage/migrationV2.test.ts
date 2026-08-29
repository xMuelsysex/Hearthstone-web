import { createShowcaseState } from '@/scenarios/showcase'
import { SessionController } from '@/app/session/SessionController'
import { buildStorageRootV2FromV1, MIGRATION_RAW_BYTE_LIMIT } from '@/storage/migrationV2'
import { GameRepository, MemoryStorageAdapter } from '@/storage/repository'
import { STORAGE_KEY } from '@/storage/schema'

describe('V1 to V2 migration', () => {
  it('preserves the exact original UTF-8 bytes and gives migrated logs zero reward eligibility', async () => {
    const storage = new MemoryStorageAdapter()
    const controller = new SessionController(new GameRepository(storage), { now: () => '2026-08-24T00:00:00.000Z' }, { gameId: () => 'migration-game' })
    await controller.start(createShowcaseState())
    const concede = controller.snapshot()?.legalActions.find((action) => action.type === 'CONCEDE')
    if (!concede) throw new Error('missing concede fixture')
    await controller.dispatchAction(concede)

    const persisted = storage.getItem(STORAGE_KEY)
    if (persisted === null) throw new Error('missing V2 storage fixture')
    expect(JSON.parse(persisted)).toMatchObject({ schemaVersion: 2, revision: 2 })
    const raw = JSON.stringify(controller.getRoot())
    const migrated = await buildStorageRootV2FromV1(raw, { now: '2026-08-24T00:00:01.000Z' })
    const encoded = new TextEncoder().encode(raw)

    expect(migrated.revision).toBe(0)
    expect(migrated.migration.sourceRaw?.bytes).toEqual(Array.from(encoded))
    expect(migrated.migration.sourceRaw?.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(migrated.completedGameLogs).toHaveLength(1)
    expect(migrated.finalizedGames['migration-game']).toMatchObject({ eligible: false, source: 'V1_MIGRATION' })
    expect(migrated.wallet.gold).toBe(500)
    expect(migrated.rewardLedger).toEqual({})
  })

  it('rejects raw input over the one MiB migration budget before parsing', async () => {
    const raw = 'x'.repeat(MIGRATION_RAW_BYTE_LIMIT + 1)

    await expect(buildStorageRootV2FromV1(raw)).rejects.toThrow('MIGRATION_RAW_TOO_LARGE')
  })

  it('rejects malformed V1 roots without producing a V2 candidate', async () => {
    const raw = JSON.stringify({ schemaVersion: 1, activeGameLog: null, completedGameLogs: [], tutorialCompleted: 'yes' })

    await expect(buildStorageRootV2FromV1(raw)).rejects.toThrow('MIGRATION_TUTORIAL_INVALID')
  })
})
