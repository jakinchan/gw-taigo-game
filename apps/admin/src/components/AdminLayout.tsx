import { NavLink, Outlet, useLocation } from 'react-router-dom'

interface NavItem {
  to: string
  label: string
  icon: string
  end?: boolean
}

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: '概況',
    items: [{ to: '/', label: 'ダッシュボード', icon: '▤', end: true }],
  },
  {
    section: '商品・注文',
    items: [
      { to: '/products', label: '商品管理', icon: '▦' },
      { to: '/orders', label: '注文管理', icon: '▧' },
    ],
  },
  {
    section: '越境EC',
    items: [{ to: '/compliance', label: '通関・税率', icon: '⚖' }],
  },
  {
    section: 'キャンペーン',
    items: [{ to: '/lottery', label: '抽選設定', icon: '◎' }],
  },
]

const TITLES: Record<string, string> = {
  '/': 'ダッシュボード',
  '/products': '商品管理',
  '/orders': '注文管理',
  '/compliance': '通関・税率',
  '/lottery': '抽選設定',
}

/**
 * 管理画面のシェル。
 * 商城とは別アプリなので、サイドバー固定の PC レイアウトにしている。
 */
export default function AdminLayout() {
  const { pathname } = useLocation()

  return (
    <div className='layout'>
      <aside className='sidebar'>
        <div className='sidebar__brand'>
          <span className='sidebar__brand-mark'>营</span>
          <span>营养工厂 管理</span>
        </div>

        {NAV.map((group) => (
          <div key={group.section}>
            <div className='sidebar__section'>{group.section}</div>
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `sidebar__link ${isActive ? 'is-active' : ''}`}
              >
                <span aria-hidden>{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        ))}

        <div className='sidebar__foot'>
          商城は別アプリ（微信小程序 / H5）
        </div>
      </aside>

      <div className='main'>
        <header className='topbar'>
          <div className='topbar__title'>{TITLES[pathname] ?? '管理画面'}</div>
          <div className='muted' style={{ fontSize: 12 }}>
            開発環境
          </div>
        </header>

        <main className='content'>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
