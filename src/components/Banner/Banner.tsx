import { Swiper, SwiperItem, Image, View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { imageUrl, IMAGE_PRESET } from '@/utils/image'

import './Banner.scss'

export interface BannerItem {
  id: string
  image: string
  /** タップ時の遷移先。'/pages/product/detail?id=xxx' 形式。空なら遷移しない。 */
  link?: string
  /** 画像に重ねるキャッチコピー（任意） */
  caption?: string
}

interface Props {
  items: BannerItem[]
  /** 自動再生の間隔（ms）。0 で自動再生しない。 */
  interval?: number
  height?: number
}

/**
 * トップのキャンペーンバナー。
 * 画像は 750x320 (=375x160pt) を基準にする。仕様の「縦 500px 以内」に収まる。
 */
export default function Banner({ items, interval = 4000, height = 160 }: Props) {
  if (items.length === 0) return null

  const handleTap = (item: BannerItem) => {
    if (!item.link) return
    // tabBar ページへはリンクできないため switchTab と navigateTo を出し分ける
    const isTabPage = [
      '/pages/index/index',
      '/pages/products/products',
      '/pages/user/user',
    ].some((p) => item.link!.startsWith(p))
    if (isTabPage) {
      Taro.switchTab({ url: item.link })
    } else {
      Taro.navigateTo({ url: item.link })
    }
  }

  return (
    <Swiper
      className='banner'
      style={{ height: `${height}px` }}
      indicatorDots
      indicatorColor='rgba(255,255,255,0.45)'
      indicatorActiveColor='#ffffff'
      autoplay={interval > 0 && items.length > 1}
      interval={interval}
      duration={400}
      circular
    >
      {items.map((item) => (
        <SwiperItem key={item.id} className='banner__item'>
          <View className='banner__inner' onClick={() => handleTap(item)}>
            <Image
              className='banner__image'
              src={imageUrl(item.image, { ...IMAGE_PRESET.banner, height })}
              mode='aspectFill'
              lazyLoad
            />
            {item.caption && (
              <View className='banner__caption'>
                <Text className='banner__caption-text'>{item.caption}</Text>
              </View>
            )}
          </View>
        </SwiperItem>
      ))}
    </Swiper>
  )
}
