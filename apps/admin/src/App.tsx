import { useState } from 'react'
import { RouterProvider, createBrowserRouter } from 'react-router-dom'

import { clearToken, getToken } from './api/client'
import AdminLayout from './components/AdminLayout'
import Compliance from './pages/Compliance'
import Dashboard from './pages/Dashboard'
import Inventory from './pages/Inventory'
import Login from './pages/Login'
import Lottery from './pages/Lottery'
import Orders from './pages/Orders'
import Products from './pages/Products'

/**
 * 管理画面のルート。
 *
 * 未ログインならログイン画面だけを出す。ルータの中でリダイレクトすると、
 * 一瞬だけ管理画面が見えてから飛ばされることがあるので、
 * そもそもルータを組み立てない。
 */
export default function App() {
  const [signedIn, setSignedIn] = useState(() => Boolean(getToken()))

  if (!signedIn) return <Login onSignedIn={() => setSignedIn(true)} />

  const router = createBrowserRouter([
    {
      path: '/',
      element: (
        <AdminLayout
          onSignOut={() => {
            clearToken()
            setSignedIn(false)
          }}
        />
      ),
      children: [
        { index: true, element: <Dashboard /> },
        { path: 'products', element: <Products /> },
        { path: 'inventory', element: <Inventory /> },
        { path: 'orders', element: <Orders /> },
        { path: 'compliance', element: <Compliance /> },
        { path: 'lottery', element: <Lottery /> },
      ],
    },
  ])

  return <RouterProvider router={router} />
}
