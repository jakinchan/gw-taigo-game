import type { UserConfigExport } from '@tarojs/cli'

export default {
  env: {
    NODE_ENV: '"development"',
  },
  // API_BASE_URL は config/index.ts の defineConstants に一本化している。
  // 開発中は微信開発者ツールの「域名校验をスキップ」を有効にすること。
  mini: {},
  h5: {},
} satisfies UserConfigExport
