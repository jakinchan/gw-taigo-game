import { useState } from 'react'
import { request, setToken } from '@/api/client'

interface Props {
  onSignedIn: () => void
}

export default function Login({ onSignedIn }: Props) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy || !password) return

    setBusy(true)
    setError(null)
    try {
      const { token } = await request<{ token: string }>('/admin/login', {
        method: 'POST',
        body: { password },
      })
      setToken(token)
      onSignedIn()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className='login'>
      <form className='login__box' onSubmit={submit}>
        <h1 className='login__title'>营养工厂 管理画面</h1>
        <p className='login__sub'>運用担当者向け。商城のアカウントとは別です。</p>

        {error && <div className='error-banner'>{error}</div>}

        <div className='login__field'>
          <label htmlFor='password'>パスワード</label>
          <input
            id='password'
            className='input'
            type='password'
            autoComplete='current-password'
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
        </div>

        <button className='btn' type='submit' disabled={busy || !password}>
          {busy ? 'ログイン中…' : 'ログイン'}
        </button>

        <p className='muted' style={{ fontSize: 11, marginTop: 14, marginBottom: 0 }}>
          パスワードは <code>apps/api/.env</code> の <code>ADMIN_PASSWORD</code> に設定します。
          未設定の場合、管理 API はすべて 401 を返します。
        </p>
      </form>
    </div>
  )
}
