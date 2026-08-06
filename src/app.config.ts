export default defineAppConfig({
  pages: [
    'pages/index/index',
    'pages/category/category',
    'pages/cart/cart',
    'pages/user/user',
    // tabBar 以外のページ（メインパッケージ）
    'pages/product/detail',
    'pages/checkout/checkout',
    'pages/order/list',
    'pages/address/list',
    'pages/address/edit',
    'pages/settings/settings',
  ],

  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTitleText: '营养工厂',
    navigationBarTextStyle: 'black',
    backgroundColor: '#f5f7f5',
    // 下拉刷新はページ側の enablePullDownRefresh で個別に有効化する
  },

  /**
   * tabBar は最大 5 つ。仕様どおり 4 つに絞る。
   * text はビルド時に固定されるため、言語切り替え時は
   * services/i18n.ts の syncTabBarText() が Taro.setTabBarItem で書き換える。
   */
  tabBar: {
    color: '#9aa19c',
    selectedColor: '#4caf50',
    backgroundColor: '#ffffff',
    borderStyle: 'white',
    list: [
      {
        pagePath: 'pages/index/index',
        text: '首页',
        iconPath: 'assets/tabbar/home.png',
        selectedIconPath: 'assets/tabbar/home-active.png',
      },
      {
        pagePath: 'pages/category/category',
        text: '分类',
        iconPath: 'assets/tabbar/category.png',
        selectedIconPath: 'assets/tabbar/category-active.png',
      },
      {
        pagePath: 'pages/cart/cart',
        text: '购物车',
        iconPath: 'assets/tabbar/cart.png',
        selectedIconPath: 'assets/tabbar/cart-active.png',
      },
      {
        pagePath: 'pages/user/user',
        text: '我的',
        iconPath: 'assets/tabbar/user.png',
        selectedIconPath: 'assets/tabbar/user-active.png',
      },
    ],
  },

  // 越境EC の配送先入力で住所を扱うため、必要になった時点で申請する
  permission: {
    'scope.userLocation': {
      desc: '用于自动填写收货地址所在地区',
    },
  },

  // 画像 CDN を使う場合は request/downloadFile の合法域名に登録すること
  networkTimeout: {
    request: 10000,
    downloadFile: 20000,
  },

  lazyCodeLoading: 'requiredComponents',
})
