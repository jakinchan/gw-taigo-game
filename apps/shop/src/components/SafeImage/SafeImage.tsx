import { useEffect, useState } from 'react'
import { Image, type ImageProps } from '@tarojs/components'
import { imageUrl, PLACEHOLDER, type ImageOptions, type PlaceholderKind } from '@/utils/image'

interface Props extends Omit<ImageProps, 'src' | 'onError'> {
  /** 元画像の URL。空でもプレースホルダが出る。 */
  src: string
  /** CDN のリサイズ・WebP 変換パラメータ */
  options?: ImageOptions
  /** 失敗時に出す絵柄 */
  fallback?: PlaceholderKind
}

/**
 * 読み込みに失敗してもレイアウトが崩れない Image。
 *
 * 商品画像は CDN 配信で、未入稿・URL 変更・ネットワーク断で普通に落ちる。
 * 素の <Image> だと壊れたアイコンや空白になり、グリッドの見た目が崩れる。
 * onError でプレースホルダに差し替えることで、少なくとも枠は保たれる。
 */
export default function SafeImage({
  src,
  options,
  fallback = 'product',
  ...rest
}: Props) {
  const resolved = imageUrl(src, options, fallback)
  const [current, setCurrent] = useState(resolved)

  // 親から別の src が渡されたら追随する（リスト再利用時に前の画像が残らないように）
  useEffect(() => {
    setCurrent(resolved)
  }, [resolved])

  return (
    <Image
      {...rest}
      src={current}
      onError={() => {
        // 既にプレースホルダなら再設定しない（無限ループ防止）
        if (current !== PLACEHOLDER[fallback]) setCurrent(PLACEHOLDER[fallback])
      }}
    />
  )
}
