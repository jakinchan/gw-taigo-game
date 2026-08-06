import type { UserConfigExport } from '@tarojs/cli'

export default {
  env: {
    NODE_ENV: '"production"',
  },
  defineConstants: {
    // 微信小程序は HTTPS 必須。request 合法域名に登録したドメインのみ使用可。
    API_BASE_URL: '"https://api.example.com/api"',
  },
  mini: {},
  h5: {
    /**
     * バンドル解析が必要な場合は下記を有効化:
     * webpackChain (chain) { chain.plugin('analyzer').use(require('webpack-bundle-analyzer').BundleAnalyzerPlugin, []) }
     */
  },
} satisfies UserConfigExport
