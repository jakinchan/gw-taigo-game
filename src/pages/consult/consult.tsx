import { View, Text, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useI18n } from '@/services/i18n'

import './consult.scss'

/** 顧問の QR コード画像。実運用では CMS から配信し、担当者ごとに出し分ける。 */
const QR_IMAGE = 'https://images.example.com/health-food/advisor-qr.png'

/**
 * 加健康顾问。
 *
 * 微信の個人アカウントへの誘導は QR コードの長押し認識で行う。
 * 小程序から個人アカウントを直接開く API は無いため、
 * 画像を showMenuByLongpress で「識別」可能にするのが定石。
 */
export default function Consult() {
  const { t } = useI18n()

  const saveQr = async () => {
    try {
      const { tempFilePath } = await Taro.downloadFile({ url: QR_IMAGE })
      await Taro.saveImageToPhotosAlbum({ filePath: tempFilePath })
      Taro.showToast({ title: t('consult.saved'), icon: 'success' })
    } catch (err) {
      console.error('[consult] save qr failed', err)
      Taro.showToast({ title: t('consult.saveFailed'), icon: 'none' })
    }
  }

  return (
    <View className='consult'>
      <Text className='consult__heading'>{t('consult.heading')}</Text>

      <Image
        className='consult__qr'
        src={QR_IMAGE}
        mode='aspectFit'
        // 長押しで「識別」メニューを出す。これが無いと友だち追加できない。
        showMenuByLongpress
      />

      <Text className='consult__fingerprint'>👆</Text>

      <Text className='consult__tip'>{t('consult.tip')}</Text>

      <View className='consult__save' hoverClass='consult__save--hover' onClick={saveQr}>
        <Text>{t('consult.saveImage')}</Text>
      </View>
    </View>
  )
}
