import { useEffect, useState, type ReactNode } from 'react'
import { View, Text, Input, Switch, Picker } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import type { Address } from '@/types'
import { userApi } from '@/services/api'
import { useI18n } from '@/services/i18n'
import { toUserMessage } from '@/utils/request'

import './edit.scss'

type FormState = Omit<Address, 'id'>
type FieldErrors = Partial<Record<keyof FormState, string>>

const EMPTY_FORM: FormState = {
  receiverName: '',
  phone: '',
  province: '',
  city: '',
  district: '',
  detail: '',
  isDefault: false,
}

/**
 * 住所の新規作成・編集。
 *
 * エラーは仕様どおり「該当フィールドの直下」に出す。
 * トーストだけで返すと、どの項目が悪いのか分からず入力し直しになる。
 */
export default function AddressEdit() {
  const router = useRouter()
  const addressId = router.params.id
  const { t } = useI18n()

  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!addressId) return
    userApi
      .addresses()
      .then((list) => {
        const found = list.find((a) => a.id === addressId)
        if (found) {
          const { id: _id, ...rest } = found
          setForm(rest)
        }
      })
      .catch((err) => console.error('[address] load failed', err))
  }, [addressId])

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    // 入力し直したフィールドのエラーはすぐ消す
    setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  /** 中国本土の携帯番号: 1 で始まる 11 桁 */
  const isValidChinesePhone = (phone: string) => /^1[3-9]\d{9}$/.test(phone)

  const validate = (): boolean => {
    const next: FieldErrors = {}

    if (!form.receiverName.trim()) next.receiverName = t('address.errorNameRequired')
    if (!isValidChinesePhone(form.phone.trim())) next.phone = t('address.errorPhoneInvalid')
    if (!form.province || !form.city) next.province = t('address.errorRegionRequired')
    if (!form.detail.trim()) next.detail = t('address.errorDetailRequired')

    setErrors(next)
    return Object.keys(next).length === 0
  }

  const save = async () => {
    if (saving || !validate()) return

    setSaving(true)
    try {
      if (addressId) {
        await userApi.updateAddress(addressId, form)
      } else {
        await userApi.createAddress(form)
      }
      Taro.navigateBack()
    } catch (err) {
      Taro.showToast({ title: toUserMessage(err, t('common.networkError')), icon: 'none' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <View className='addr-edit'>
      <View className='addr-edit__card'>
        <Field label={t('address.receiverName')} error={errors.receiverName}>
          <Input
            className='addr-edit__input'
            value={form.receiverName}
            placeholder={t('address.receiverNamePlaceholder')}
            placeholderClass='addr-edit__placeholder'
            maxlength={20}
            onInput={(e) => setField('receiverName', e.detail.value)}
          />
        </Field>

        <Field label={t('address.phone')} error={errors.phone}>
          <Input
            className='addr-edit__input'
            type='number'
            value={form.phone}
            placeholder={t('address.phonePlaceholder')}
            placeholderClass='addr-edit__placeholder'
            maxlength={11}
            onInput={(e) => setField('phone', e.detail.value)}
          />
        </Field>

        <Field label={t('address.region')} error={errors.province}>
          <Picker
            mode='region'
            value={[form.province, form.city, form.district].filter(Boolean)}
            onChange={(e) => {
              const [province, city, district] = e.detail.value as string[]
              setForm((prev) => ({ ...prev, province, city, district }))
              setErrors((prev) => ({ ...prev, province: undefined }))
            }}
          >
            <View className='addr-edit__picker'>
              {form.province ? (
                <Text>
                  {form.province} {form.city} {form.district}
                </Text>
              ) : (
                <Text className='addr-edit__placeholder-text'>
                  {t('address.regionPlaceholder')}
                </Text>
              )}
              <Text className='addr-edit__picker-arrow'>›</Text>
            </View>
          </Picker>
        </Field>

        <Field label={t('address.detail')} error={errors.detail}>
          <Input
            className='addr-edit__input'
            value={form.detail}
            placeholder={t('address.detailPlaceholder')}
            placeholderClass='addr-edit__placeholder'
            maxlength={60}
            onInput={(e) => setField('detail', e.detail.value)}
          />
        </Field>

        <View className='addr-edit__row'>
          <Text className='addr-edit__label'>{t('address.setDefault')}</Text>
          <Switch
            checked={form.isDefault}
            color='#4caf50'
            onChange={(e) => setField('isDefault', e.detail.value)}
          />
        </View>
      </View>

      <View className='addr-edit__footer-space' />
      <View className='addr-edit__footer'>
        <View
          className={`addr-edit__save ${saving ? 'is-disabled' : ''}`}
          hoverClass={saving ? 'none' : 'addr-edit__save--hover'}
          onClick={save}
        >
          <Text>{t('address.save')}</Text>
        </View>
      </View>
    </View>
  )
}

/** ラベル + 入力 + フィールド直下のエラー */
function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: ReactNode
}) {
  return (
    <View className={`addr-edit__field ${error ? 'has-error' : ''}`}>
      <View className='addr-edit__row'>
        <Text className='addr-edit__label'>{label}</Text>
        <View className='addr-edit__control'>{children}</View>
      </View>
      {error && <Text className='addr-edit__error'>{error}</Text>}
    </View>
  )
}
