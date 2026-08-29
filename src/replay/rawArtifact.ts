export const RAW_ARTIFACT_BYTE_LIMIT = 1_048_576
export const UNKNOWN_RAW_INPUT_BYTE_LIMIT = RAW_ARTIFACT_BYTE_LIMIT

export type RawArtifactFileLike = {
  size: number
  arrayBuffer?: () => Promise<ArrayBuffer>
  text?: () => Promise<string>
}

export type RawArtifactUrlRuntime = {
  createObjectURL(blob: Blob): string
  revokeObjectURL(url: string): void
  createAnchor(): { href: string; download: string; click(): void }
}

export class RawArtifactError extends Error {
  constructor(
    readonly code: 'RAW_INPUT_TOO_LARGE' | 'RAW_INPUT_INVALID' | 'RAW_INPUT_UNREADABLE',
    readonly artifact?: RawArtifactV1,
  ) {
    super(code)
    this.name = 'RawArtifactError'
  }
}

function cloneBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes)
}

function defaultUrlRuntime(): RawArtifactUrlRuntime {
  return {
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
    createAnchor: () => document.createElement('a'),
  }
}

export class RawArtifactV1 {
  readonly bytes: Uint8Array
  readonly blob: Blob

  constructor(bytes: Uint8Array, readonly mimeType = 'application/octet-stream') {
    if (bytes.byteLength > RAW_ARTIFACT_BYTE_LIMIT) throw new RawArtifactError('RAW_INPUT_TOO_LARGE')
    this.bytes = cloneBytes(bytes)
    const buffer = new ArrayBuffer(this.bytes.byteLength)
    new Uint8Array(buffer).set(this.bytes)
    this.blob = new Blob([buffer], { type: mimeType })
  }

  toBytes(): Uint8Array {
    return cloneBytes(this.bytes)
  }

  download(filename: string, runtime: RawArtifactUrlRuntime = defaultUrlRuntime()): void {
    downloadRawArtifact(this, filename, runtime)
  }
}

export async function readRawArtifact(file: RawArtifactFileLike): Promise<RawArtifactV1> {
  if (!Number.isSafeInteger(file.size) || file.size < 0) throw new RawArtifactError('RAW_INPUT_INVALID')
  if (file.size > RAW_ARTIFACT_BYTE_LIMIT) throw new RawArtifactError('RAW_INPUT_TOO_LARGE')

  try {
    if (file.arrayBuffer) {
      const bytes = new Uint8Array(await file.arrayBuffer())
      if (bytes.byteLength > RAW_ARTIFACT_BYTE_LIMIT) throw new RawArtifactError('RAW_INPUT_TOO_LARGE')
      return new RawArtifactV1(bytes)
    }
    if (file.text) return new RawArtifactV1(new TextEncoder().encode(await file.text()))
  } catch (error) {
    if (error instanceof RawArtifactError) throw error
    throw new RawArtifactError('RAW_INPUT_UNREADABLE')
  }
  throw new RawArtifactError('RAW_INPUT_UNREADABLE')
}

export function createRawArtifact(bytes: Uint8Array | ArrayBuffer, mimeType = 'application/octet-stream'): RawArtifactV1 {
  return new RawArtifactV1(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), mimeType)
}

export async function parseRawArtifact(file: RawArtifactFileLike): Promise<{ artifact: RawArtifactV1; value: unknown }> {
  const artifact = await readRawArtifact(file)
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(artifact.bytes))
  } catch {
    throw new RawArtifactError('RAW_INPUT_UNREADABLE', artifact)
  }
  return { artifact, value }
}

export function downloadRawArtifact(artifact: RawArtifactV1, filename: string, runtime: RawArtifactUrlRuntime = defaultUrlRuntime()): void {
  const url = runtime.createObjectURL(artifact.blob)
  try {
    const anchor = runtime.createAnchor()
    anchor.href = url
    anchor.download = filename
    anchor.click()
  } finally {
    runtime.revokeObjectURL(url)
  }
}

export class RawArtifactStoreV1 {
  private artifact: RawArtifactV1 | null = null
  private activeUrl: string | null = null

  replace(artifact: RawArtifactV1 | null): void {
    this.revokeActiveUrl()
    this.artifact = artifact
  }

  get current(): RawArtifactV1 | null {
    return this.artifact
  }

  download(filename: string, runtime: RawArtifactUrlRuntime = defaultUrlRuntime()): void {
    if (!this.artifact) throw new RawArtifactError('RAW_INPUT_UNREADABLE')
    const url = runtime.createObjectURL(this.artifact.blob)
    this.activeUrl = url
    try {
      const anchor = runtime.createAnchor()
      anchor.href = url
      anchor.download = filename
      anchor.click()
    } finally {
      this.revokeActiveUrl(runtime)
    }
  }

  dispose(runtime: RawArtifactUrlRuntime = defaultUrlRuntime()): void {
    this.revokeActiveUrl(runtime)
    this.artifact = null
  }

  private revokeActiveUrl(runtime: RawArtifactUrlRuntime = defaultUrlRuntime()): void {
    if (this.activeUrl === null) return
    runtime.revokeObjectURL(this.activeUrl)
    this.activeUrl = null
  }
}
