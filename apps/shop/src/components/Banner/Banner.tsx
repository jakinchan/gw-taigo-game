import { useState } from 'react'
import { Swiper, SwiperItem, View, Text } from '@tarojs/components'
import type { CommonEventFunction } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { IMAGE_PRESET } from '@/utils/image'
import SafeImage from '@/components/SafeImage'

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
 *
 * キャプションを SwiperItem の中ではなく外に重ねているのには理由がある。
 * circular の Swiper は H5 で先頭・末尾のスライドを DOM ごと複製して繋げるため、
 * スライドの中身は React の管理から外れる。中に置くと、言語を切り替えたときに
 * 複製側だけ前の言語の文言が残る。外に出して現在の index だけを見れば、
 * 描画は最後まで React の側にある。
 */
export default function Banner({ items, interval = 4000, height = 160 }: Props) {
  const [current, setCurrent] = useState(0)

  if (items.length === 0) return null

  const handleChange: CommonEventFunction<{ current: number }> = (event) => {
    setCurrent(event.detail.current)
  }

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

  const caption = items[current]?.caption

  return (
    <View className='banner-wrap' style={{ height: `${height}px` }}>
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
        onChange={handleChange}
      >
        {items.map((item) => (
          <SwiperItem key={item.id} className='banner__item'>
            <View className='banner__inner' onClick={() => handleTap(item)}>
              <SafeImage
                className='banner__image'
                src={item.image}
                options={{ ...IMAGE_PRESET.banner, height }}
                fallback='banner'
                mode='aspectFill'
                lazyLoad
              />
            </View>
          </SwiperItem>
        ))}
      </Swiper>

      {caption && (
        <View className='banner__caption'>
          <Text className='banner__caption-text'>{caption}</Text>
        </View>
      )}
    </View>
  )
}
