import { useState } from 'react'

type AssetImageProps = {
  src: string
  alt: string
  className?: string
  fallbackSrc?: string
}

export function AssetImage({ src, alt, className, fallbackSrc }: AssetImageProps) {
  const [fallbackAttemptedFor, setFallbackAttemptedFor] = useState<string | null>(null)
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const showingFallback = fallbackSrc !== undefined && fallbackAttemptedFor === src
  if (failedSource === src) return <span className={`asset-fallback ${className ?? ''}`} role="img" aria-label={`${alt}素材加载失败`}>素材加载失败</span>
  const imageSrc = showingFallback ? fallbackSrc : src
  return <img src={imageSrc} alt={alt} className={className} draggable={false} onError={() => {
    if (!showingFallback && fallbackSrc) {
      setFallbackAttemptedFor(src)
      return
    }
    setFailedSource(src)
  }} />
}
