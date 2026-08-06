import type { UserConfigExport } from '@tarojs/cli'

/**
 * デザイン基準幅は 750（微信小程序の rpx 基準）。
 * designWidth: 750 のとき、スタイルに書いた `1px` は `2rpx` に変換される。
 * つまり iPhone 論理ピクセル（= pt）と 1:1 で書ける。
 * 仕様の「22pt / 17pt / 15pt / 14pt / 12pt」はそのまま `px` で記述する。
 */
const config: UserConfigExport = {
  projectName: 'health-food-shop',
  date: '2026-08-06',
  designWidth: 750,
  deviceRatio: {
    640: 2.34 / 2,
    750: 1,
    828: 1.81 / 2,
  },
  sourceRoot: 'src',
  outputRoot: 'dist',
  plugins: [],
  defineConstants: {},
  alias: {
    '@': require('path').resolve(__dirname, '..', 'src'),
  },
  copy: {
    patterns: [],
    options: {},
  },
  framework: 'react',
  compiler: 'webpack5',
  cache: {
    enable: true, // ビルドキャッシュ（初回以降のビルド高速化）
  },
  sass: {
    // 全ての .scss から変数/mixin を参照できるようにする
    resource: [
      require('path').resolve(__dirname, '..', 'src/styles/variables.scss'),
      require('path').resolve(__dirname, '..', 'src/styles/mixins.scss'),
    ],
  },
  mini: {
    postcss: {
      pxtransform: { enable: true, config: {} },
      url: {
        enable: true,
        config: { limit: 1024 }, // 1KB 未満の画像は base64 インライン化
      },
      cssModules: {
        enable: false,
        config: { namingPattern: 'module', generateScopedName: '[name]__[local]___[hash:base64:5]' },
      },
    },
    optimizeMainPackage: { enable: true },
  },
  h5: {
    publicPath: '/',
    staticDirectory: 'static',
    output: {
      filename: 'js/[name].[hash:8].js',
      chunkFilename: 'js/[chunkhash:8].js',
    },
    miniCssExtractPluginOption: {
      ignoreOrder: true,
      filename: 'css/[name].[hash].css',
      chunkFilename: 'css/[chunkhash:8].css',
    },
    postcss: {
      autoprefixer: { enable: true, config: {} },
      cssModules: {
        enable: false,
        config: { namingPattern: 'module', generateScopedName: '[name]__[local]___[hash:base64:5]' },
      },
    },
  },
}

export default function (merge: (...args: unknown[]) => UserConfigExport) {
  if (process.env.NODE_ENV === 'development') {
    return merge({}, config, require('./dev'))
  }
  return merge({}, config, require('./prod'))
}
