import type { UserConfigExport } from '@tarojs/cli'

export default {
  env: {
    NODE_ENV: '"development"',
  },
  defineConstants: {
    // 開発中は微信開発者ツールの「域名校验をスキップ」を有効にすること
    API_BASE_URL: '"http://localhost:3000/api"',
  },
  mini: {},
  h5: {},
} satisfies UserConfigExport
