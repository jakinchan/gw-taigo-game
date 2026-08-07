/// <reference types="@tarojs/taro" />
/// <reference types="@tarojs/components" />
/// <reference types="webpack-env" />

// 画像は webpack のローダーが URL 文字列（または base64）に変換する
declare module '*.png' {
  const content: string
  export default content
}
declare module '*.gif' {
  const content: string
  export default content
}
declare module '*.jpg' {
  const content: string
  export default content
}
declare module '*.jpeg' {
  const content: string
  export default content
}
declare module '*.svg' {
  const content: string
  export default content
}
declare module '*.css'
declare module '*.less'
declare module '*.scss'
declare module '*.sass'
declare module '*.styl'

declare namespace NodeJS {
  interface ProcessEnv {
    /** NODE_ENV */
    NODE_ENV: 'development' | 'production'
    /** ビルド対象プラットフォーム: weapp / h5 など */
    TARO_ENV: 'weapp' | 'swan' | 'alipay' | 'h5' | 'rn' | 'tt' | 'quickapp' | 'qq' | 'jd'
  }
}

/** config/dev.ts・config/prod.ts の defineConstants で注入される */
declare const API_BASE_URL: string
