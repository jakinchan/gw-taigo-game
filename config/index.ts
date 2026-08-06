import type { UserConfigExport } from '@tarojs/cli'

/**
 * 出力先はプラットフォームごとに分ける。
 *
 * 共有すると、weapp と h5 を同時に（あるいは続けて）ビルドしたときに
 * 一方が dist/ を消そうとして他方のプロセスが掴んでいるファイルに当たり、
 * Windows では EPERM で落ちる。
 *
 * 微信開発者ツールで開くのは dist/weapp（project.config.json 参照）。
 */
function resolveOutputRoot(): string {
  const fromEnv = process.env.TARO_ENV
  if (fromEnv) return `dist/${fromEnv}`

  // CLI が TARO_ENV を立てる前に config が読まれる場合に備えて argv も見る
  const typeIndex = process.argv.indexOf('--type')
  const fromArgv = typeIndex >= 0 ? process.argv[typeIndex + 1] : undefined
  return `dist/${fromArgv ?? 'weapp'}`
}

const config: UserConfigExport = {
  projectName: 'health-food-shop',
  date: '2026-08-06',
  outputRoot: resolveOutputRoot(),

  /**
   * デザイン基準幅は 375（iPhone の論理ピクセル = pt）。
   *
   * 750 にすると SCSS に書いた `1px` が `1rpx`（= 0.5pt）に変換され、
   * 全ての寸法が意図の半分になる。375 なら `1px` → `2rpx` = 1pt となり、
   * 仕様の「22pt / 17pt / 15pt / 14pt / 12pt」をそのまま px で書ける。
   */
  designWidth: 375,
  deviceRatio: {
    375: 2 / 1,
    640: 2.34 / 2,
    750: 1,
    828: 1.81 / 2,
  },
  sourceRoot: 'src',
  plugins: [],

  /**
   * ビルド時に埋め込む定数。
   *
   * dev.ts / prod.ts 側に書くと merge の順序やモジュール interop の影響で
   * 適用されないことがあり、実行時に ReferenceError になっても
   * ビルドは通ってしまう。事故りやすいのでここに一本化する。
   *
   * 既定ポートを 3100 にしているのは、3000 が他プロジェクトと衝突しやすいため。
   * 上書きするときは backend/.env の PORT と揃えること:
   *   API_BASE_URL=http://localhost:3000/api npm run dev:h5
   */
  defineConstants: {
    API_BASE_URL: JSON.stringify(
      process.env.API_BASE_URL ??
        (process.env.NODE_ENV === 'production'
          ? 'https://api.example.com/api'
          : 'http://localhost:3100/api'),
    ),
  },
  alias: {
    '@': require('path').resolve(__dirname, '..', 'src'),
  },
  copy: {
    patterns: [],
    options: {},
  },
  framework: 'react',
  compiler: {
    type: 'webpack5',
    /**
     * プリバンドルを無効化する。
     * Taro 3.6 の webpack5-prebundle は webpack-virtual-modules の新しい版と
     * 非互換で、H5 の dev server が
     * 「_writeVirtualFile is not a function」で落ちる。
     * 開発時のビルド高速化機能なので、無効でも成果物は変わらない。
     */
    prebundle: { enable: false },
  },
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
    devServer: {
      // scripts/dev.js が空きポートを選んで渡してくる
      port: Number(process.env.H5_PORT) || 10086,
      client: {
        /**
         * 画像 CDN 未接続の開発環境では商品画像が 404 になり、
         * その都度エラーオーバーレイが画面を覆って確認作業ができない。
         * 404 は SafeImage がプレースホルダへフォールバックして処理済みなので、
         * オーバーレイは出さずコンソールログに任せる。
         */
        overlay: false,
      },
    },

    /**
     * React Refresh は webpack-dev-server とは別に自前のオーバーレイを持つ。
     * devServer.client.overlay だけでは消えないので、プラグイン側も無効化する。
     */
    webpackChain(chain: { plugins: { has: (n: string) => boolean }; plugin: (n: string) => { tap: (fn: (args: unknown[]) => unknown[]) => void } }) {
      for (const name of ['ReactRefreshWebpackPlugin', 'reactRefresh', 'react-refresh']) {
        if (chain.plugins.has(name)) {
          chain.plugin(name).tap((args) => {
            const current = (args[0] ?? {}) as Record<string, unknown>
            args[0] = { ...current, overlay: false }
            return args
          })
        }
      }
    },
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

/**
 * dev.ts / prod.ts は `export default` なので、ts-node が CJS に変換すると
 * `require()` は `{ default: {...} }` を返す。そのまま merge すると
 * `defineConstants` が適用されず、API_BASE_URL が実行時に undefined になる。
 * ビルドは通ってしまうので、必ず default を取り出すこと。
 */
function loadConfig(path: string): UserConfigExport {
  const loaded = require(path) as UserConfigExport & { default?: UserConfigExport }
  return loaded.default ?? loaded
}

export default function (merge: (...args: unknown[]) => UserConfigExport) {
  if (process.env.NODE_ENV === 'development') {
    return merge({}, config, loadConfig('./dev'))
  }
  return merge({}, config, loadConfig('./prod'))
}
