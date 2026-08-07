#!/usr/bin/env node
/**
 * 開発環境をまとめて立ち上げる。
 *
 *   npm run dev                    # DB + API + 商城(H5) + 管理画面(PC)
 *   npm run dev -- --only=api      # API だけ（微信開発者ツールで確認する場合）
 *   npm run dev -- --only=api,shop # 商城だけ
 *   npm run dev -- --fresh         # DB を作り直してシードから入れ直す
 *
 * ポートは固定せず空きを探す。開発機には既に PostgreSQL が動いていたり
 * 3000 番が別プロジェクトに使われていたりするのが普通で、
 * 固定するとその都度ここで詰まる。
 */
const { spawn, spawnSync } = require('node:child_process')
const net = require('node:net')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const ROOT = path.resolve(__dirname, '..')
const API_DIR = path.join(ROOT, 'apps', 'api')
const SHOP_DIR = path.join(ROOT, 'apps', 'shop')
const ADMIN_DIR = path.join(ROOT, 'apps', 'admin')

const args = process.argv.slice(2)
const fresh = args.includes('--fresh')

/** 起動対象。--only=api,shop のように絞れる。 */
const onlyArg = args.find((a) => a.startsWith('--only='))
const targets = onlyArg
  ? new Set(onlyArg.slice('--only='.length).split(',').map((s) => s.trim()))
  : new Set(['api', 'shop', 'admin'])

const DB_CONTAINER = 'hfs-postgres'
const DB_NAME = 'health_food_shop'
const DB_PASSWORD = 'password'

const children = []

/**
 * 自分が起動したプロセスの PID を残しておくファイル。
 * ターミナルを閉じられたりクラッシュしたりすると webpack や nest が生き残り、
 * 次回の起動でポートを奪い合う。「自分が起動したものだけ」を記録しておき、
 * 次回はそれだけを片付ける（無関係なプロセスは触らない）。
 */
const PID_FILE = path.join(__dirname, '.dev-pids.json')

// ---------------------------------------------------------------
// 小物
// ---------------------------------------------------------------

const color = (code, s) => `[${code}m${s}[0m`
const info = (s) => console.log(`${color(36, '›')} ${s}`)
const ok = (s) => console.log(`${color(32, '✓')} ${s}`)
const warn = (s) => console.log(`${color(33, '!')} ${s}`)
const fail = (s) => console.log(`${color(31, '✗')} ${s}`)

/**
 * Windows では npm/npx がバッチファイルなので shell 経由でないと起動できない。
 * shell: true に配列を渡すと Node が DEP0190 を出すため、1 本の文字列で渡す。
 */
function toShellCommand(cmd, cmdArgs) {
  const quoted = cmdArgs.map((arg) =>
    /^["'].*["']$/.test(arg) || /^[\w.:/=@^$-]+$/.test(arg) ? arg : `"${arg}"`,
  )
  return [cmd, ...quoted].join(' ')
}

function run(cmd, cmdArgs, options = {}) {
  const result = spawnSync(toShellCommand(cmd, cmdArgs), {
    cwd: options.cwd ?? ROOT,
    stdio: options.quiet ? 'pipe' : 'inherit',
    shell: true,
    encoding: 'utf8',
    env: { ...process.env, ...options.env },
  })
  return { code: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

function hasCommand(cmd) {
  return run(cmd, ['--version'], { quiet: true }).code === 0
}

/**
 * そのポートで listen できるか（= 空いているか）。
 *
 * host を指定せずに listen するのが要点。'0.0.0.0' だと IPv4 しか見ないが、
 * NestJS も webpack-dev-server も host 未指定＝ IPv6 のデュアルスタック
 * （:::PORT）で bind する。IPv4 だけ見て「空き」と判断すると、
 * IPv6 側が塞がっていた場合に起動時 EADDRINUSE で落ちる。
 */
function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => server.close(() => resolve(true)))
    server.listen(port)
  })
}

async function findFreePort(start, label) {
  for (let port = start; port < start + 50; port++) {
    if (await isPortFree(port)) {
      if (port !== start) warn(`${label}: ${start} は使用中のため ${port} を使う`)
      return port
    }
  }
  throw new Error(`${label}: ${start} から 50 個試しても空きポートが無い`)
}

async function waitFor(check, { timeoutMs = 240_000, intervalMs = 1000, label = '' } = {}) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await check()) return true
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  fail(`${label} がタイムアウトした（${Math.round(timeoutMs / 1000)} 秒）`)
  return false
}

/**
 * 疎通確認。
 *
 * サーバによって IPv4 だけ・IPv6 だけで listen していることがあり、
 * 片方だけ試すと「起動しているのに繋がらない」と誤判定する。
 *   - NestJS は :::PORT（IPv6 デュアルスタック）
 *   - Vite は既定で localhost（環境により ::1 のみ）
 * 実際に両方試して、どちらかで応答すれば起動とみなす。
 */
async function httpOk(url) {
  const candidates = url.includes('//localhost:')
    ? [url.replace('//localhost:', '//127.0.0.1:'), url]
    : [url]

  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate, { signal: AbortSignal.timeout(3000) })
      if (res.status > 0) return true
    } catch {
      /* 次の候補を試す */
    }
  }
  return false
}

// ---------------------------------------------------------------
// プロセス管理
// ---------------------------------------------------------------

function recordPid(pid) {
  if (!pid) return
  let pids = []
  try {
    pids = JSON.parse(fs.readFileSync(PID_FILE, 'utf8'))
  } catch {
    /* 初回は存在しない */
  }
  pids.push(pid)
  fs.writeFileSync(PID_FILE, JSON.stringify(pids))
}

function killStaleProcesses() {
  let pids = []
  try {
    pids = JSON.parse(fs.readFileSync(PID_FILE, 'utf8'))
  } catch {
    return
  }

  let killed = 0
  for (const pid of pids) {
    try {
      process.kill(pid, 0) // 存在確認だけ
    } catch {
      continue
    }
    if (process.platform === 'win32') {
      // /T で子孫まで落とす。webpack は孫プロセスとして生きるため必須。
      spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' })
    } else {
      try {
        process.kill(-pid, 'SIGKILL')
      } catch {
        try {
          process.kill(pid, 'SIGKILL')
        } catch {
          /* 競合で消えていた */
        }
      }
    }
    killed++
  }

  fs.rmSync(PID_FILE, { force: true })
  if (killed > 0) info(`前回の残りプロセス ${killed} 件を停止`)
}

function startProcess(name, cmd, cmdArgs, options = {}) {
  const env = { ...process.env, ...options.env }
  // 空文字を渡すと webpack-dev-server などが不正な値として扱うため、キーごと消す
  for (const key of options.unsetEnv ?? []) delete env[key]

  const child = spawn(toShellCommand(cmd, cmdArgs), {
    cwd: options.cwd ?? ROOT,
    shell: true,
    env,
  })
  children.push({ name, child })
  recordPid(child.pid)

  const prefix = color(90, `[${name}]`)
  const pipe = (stream, isErr) => {
    let buffer = ''
    stream.on('data', (chunk) => {
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const rawLine of lines) {
        // 端末制御文字（webpack の進捗バー）を落としたうえで中身が残る行だけ出す
        const line = rawLine.replace(/\[[0-9;]*[A-Za-z]/g, '').trimEnd()
        if (!line.trim()) continue
        console.log(`${prefix} ${isErr ? color(31, line) : line}`)
      }
    })
  }
  pipe(child.stdout, false)
  pipe(child.stderr, true)

  child.on('exit', (code) => {
    if (code !== 0 && code !== null) fail(`${name} が終了コード ${code} で落ちた`)
  })
  return child
}

function shutdown() {
  console.log('\n')
  info('終了処理中...')
  for (const { name, child } of children) {
    if (child.killed || child.exitCode !== null) continue
    info(`${name} を停止`)
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    } else {
      child.kill('SIGTERM')
    }
  }
  fs.rmSync(PID_FILE, { force: true })
  info(`DB コンテナは動かしたままにする（止める場合: npm run dev:stop）`)
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

// ---------------------------------------------------------------
// 各ステップ
// ---------------------------------------------------------------

function installDeps() {
  // npm workspaces なのでルートで一度入れれば全アプリに行き渡る
  if (fs.existsSync(path.join(ROOT, 'node_modules', '@hfs'))) {
    ok('依存を確認')
    return
  }
  info('依存をインストール中（初回のみ・数分かかる）')
  if (run('npm', ['install', '--no-audit', '--no-fund']).code !== 0) {
    throw new Error('npm install に失敗')
  }
  ok('依存を確認')
}

async function startDatabase() {
  if (!hasCommand('docker')) {
    warn('docker が見つからない。apps/api/.env の DATABASE_URL を自分で設定すること')
    return null
  }

  if (fresh) {
    info('--fresh: DB コンテナを作り直す')
    run('docker', ['rm', '-f', DB_CONTAINER], { quiet: true })
  }

  const running = run('docker', ['ps', '-q', '-f', `name=^${DB_CONTAINER}$`], { quiet: true })
  if (running.stdout.trim()) {
    const portInfo = run('docker', ['port', DB_CONTAINER, '5432'], { quiet: true }).stdout.trim()
    const port = Number(portInfo.split(':').pop())
    ok(`PostgreSQL は起動済み（ポート ${port}）`)
    return port
  }

  // 停止状態のコンテナが残っていれば作り直す（ポートが変わっている可能性がある）
  const exists = run('docker', ['ps', '-aq', '-f', `name=^${DB_CONTAINER}$`], { quiet: true })
  if (exists.stdout.trim()) run('docker', ['rm', '-f', DB_CONTAINER], { quiet: true })

  const port = await findFreePort(55432, 'PostgreSQL')
  info(`PostgreSQL をポート ${port} で起動`)

  const created = run(
    'docker',
    [
      'run', '-d',
      '--name', DB_CONTAINER,
      '-e', `POSTGRES_PASSWORD=${DB_PASSWORD}`,
      '-e', `POSTGRES_DB=${DB_NAME}`,
      '-p', `${port}:5432`,
      'postgres:16-alpine',
    ],
    { quiet: true },
  )
  if (created.code !== 0) throw new Error(`DB コンテナの起動に失敗:\n${created.stderr}`)

  const ready = await waitFor(
    async () =>
      run('docker', ['exec', DB_CONTAINER, 'pg_isready', '-U', 'postgres'], { quiet: true })
        .code === 0,
    { timeoutMs: 60_000, label: 'PostgreSQL の起動' },
  )
  if (!ready) throw new Error('PostgreSQL が起動しなかった')

  ok(`PostgreSQL 起動（localhost:${port}）`)
  return port
}

function ensureEnv(dbPort, apiPort, corsOrigins) {
  const envPath = path.join(API_DIR, '.env')
  const examplePath = path.join(API_DIR, '.env.example')

  if (!fs.existsSync(envPath)) {
    info('apps/api/.env を生成（秘密鍵はランダム生成・コミットされない）')
    const rand = (bytes) => crypto.randomBytes(bytes).toString('base64')
    const env = fs
      .readFileSync(examplePath, 'utf8')
      .replace(/^JWT_SECRET=.*/m, `JWT_SECRET=${rand(48)}`)
      .replace(/^ENCRYPTION_KEY=.*/m, `ENCRYPTION_KEY=${rand(32)}`)
      .replace(/^HASH_PEPPER=.*/m, `HASH_PEPPER=${rand(32)}`)
    fs.writeFileSync(envPath, env)
  }

  let env = fs.readFileSync(envPath, 'utf8')
  if (dbPort) {
    env = env.replace(
      /^DATABASE_URL=.*/m,
      `DATABASE_URL=postgresql://postgres:${DB_PASSWORD}@localhost:${dbPort}/${DB_NAME}?schema=public`,
    )
  }
  env = env.replace(/^PORT=.*/m, `PORT=${apiPort}`)

  /**
   * CORS も実際に使うポートに追随させる。固定にしていると、
   * H5 や管理画面が別ポートに逃げた瞬間にプリフライトで全部弾かれる。
   */
  if (corsOrigins.length > 0) {
    env = env.replace(/^CORS_ORIGINS=.*/m, `CORS_ORIGINS=${corsOrigins.join(',')}`)
  }

  fs.writeFileSync(envPath, env)
  ok('apps/api/.env を更新')
}

/**
 * Prisma クライアントの再生成が必要か。
 * 毎回走らせると Windows では query engine の DLL が実行中のプロセスに
 * 掴まれて EPERM で落ちる。スキーマが生成物より新しいときだけ生成する。
 */
function needsPrismaGenerate() {
  const schema = path.join(API_DIR, 'prisma', 'schema.prisma')
  const client = path.join(ROOT, 'node_modules', '.prisma', 'client', 'index.js')
  try {
    return fs.statSync(schema).mtimeMs > fs.statSync(client).mtimeMs
  } catch {
    return true
  }
}

function prepareDatabase() {
  if (needsPrismaGenerate()) {
    info('Prisma クライアントを生成')
    let generated = run('npx', ['prisma', 'generate'], { cwd: API_DIR, quiet: true })

    if (generated.code !== 0) {
      warn('prisma generate に失敗。ファイルロックの解放を待って再試行する')
      spawnSync(process.execPath, ['-e', 'setTimeout(()=>{}, 4000)'], { stdio: 'ignore' })
      generated = run('npx', ['prisma', 'generate'], { cwd: API_DIR, quiet: true })
    }

    if (generated.code !== 0) {
      const clientPath = path.join(ROOT, 'node_modules', '.prisma', 'client', 'index.js')
      if (fs.existsSync(clientPath)) {
        warn('prisma generate に失敗したが、既存のクライアントで続行する')
      } else {
        throw new Error(`prisma generate に失敗:\n${generated.stderr || generated.stdout}`)
      }
    }
  } else {
    ok('Prisma クライアントは最新')
  }

  info('マイグレーションを適用')
  const migrate = run('npx', ['prisma', 'migrate', 'deploy'], { cwd: API_DIR, quiet: true })
  if (migrate.code !== 0) throw new Error(`prisma migrate deploy に失敗:\n${migrate.stderr}`)

  if (hasSeedData()) {
    ok('シードデータは投入済み')
    return
  }

  info('シードデータを投入')
  const seeded = run('npm', ['run', 'seed'], { cwd: API_DIR, quiet: true })
  if (seeded.code !== 0) throw new Error(`シード投入に失敗:\n${seeded.stderr}`)
  ok('データベースを準備')
}

/** Product が 1 件でもあるか。コンテナ内の psql で直接数える。 */
function hasSeedData() {
  const result = run(
    'docker',
    [
      'exec', DB_CONTAINER,
      'psql', '-U', 'postgres', '-d', DB_NAME, '-t', '-A',
      '-c', '"SELECT COUNT(*) FROM \\"Product\\";"',
    ],
    { quiet: true },
  )
  if (result.code !== 0) return false
  return Number(result.stdout.trim()) > 0
}

// ---------------------------------------------------------------
// メイン
// ---------------------------------------------------------------

async function main() {
  console.log(color(1, '\n营养工厂 — 開発環境の起動\n'))

  killStaleProcesses()
  installDeps()

  const dbPort = await startDatabase()

  /**
   * ポートは起動より先に全部決めておく。
   * API を立ててから他のポートを決めると、CORS の許可オリジンを
   * .env に書く時点でそのポートが分からず、後追いで直せない。
   */
  const apiPort = await findFreePort(3100, 'API')
  const shopPort = targets.has('shop') ? await findFreePort(10086, '商城(H5)') : null
  const adminPort = targets.has('admin') ? await findFreePort(5200, '管理画面') : null

  const corsOrigins = []
  for (const port of [shopPort, adminPort]) {
    if (port) corsOrigins.push(`http://localhost:${port}`, `http://127.0.0.1:${port}`)
  }

  ensureEnv(dbPort, apiPort, corsOrigins)
  if (dbPort) prepareDatabase()

  const apiUrl = `http://localhost:${apiPort}/api`

  // --- API ---
  info(`API を起動（ポート ${apiPort}）`)
  startProcess('api', 'npm', ['run', 'start:dev'], {
    cwd: API_DIR,
    // シェルに PORT が残っていると ConfigService がそちらを優先してしまう
    env: { PORT: String(apiPort) },
  })

  if (!(await waitFor(() => httpOk(`${apiUrl}/categories`), { label: 'API の起動' }))) {
    throw new Error('API が起動しなかった（上のログを確認）')
  }
  ok(`API 起動 → ${apiUrl}`)

  // --- 商城（H5） ---
  if (shopPort) {
    info('商城（H5）をビルド中... 初回は 1〜2 分かかる')
    startProcess('shop', 'npm', ['run', 'dev:h5'], {
      cwd: SHOP_DIR,
      env: {
        // API のポートは毎回変わりうるので、ビルド時に定数として注入する
        API_BASE_URL: apiUrl,
        H5_PORT: String(shopPort),
      },
      // NestJS 用の PORT を引き継ぐと dev server が別ポートを掴んでしまう
      unsetEnv: ['PORT'],
    })

    if (
      !(await waitFor(() => httpOk(`http://localhost:${shopPort}/`), {
        timeoutMs: 480_000,
        label: '商城(H5) の起動',
      }))
    ) {
      throw new Error('商城の dev server が起動しなかった')
    }
    ok(`商城(H5) 起動 → http://localhost:${shopPort}`)
  }

  // --- 管理画面（PC） ---
  if (adminPort) {
    info('管理画面（PC）を起動')
    startProcess('admin', 'npm', ['run', 'dev'], {
      cwd: ADMIN_DIR,
      env: {
        ADMIN_PORT: String(adminPort),
        // Vite の proxy 先。管理画面から見て同一オリジンにするため
        API_ORIGIN: `http://127.0.0.1:${apiPort}`,
      },
      unsetEnv: ['PORT'],
    })

    if (
      !(await waitFor(() => httpOk(`http://localhost:${adminPort}/`), {
        timeoutMs: 120_000,
        label: '管理画面の起動',
      }))
    ) {
      throw new Error('管理画面が起動しなかった')
    }
    ok(`管理画面 起動 → http://localhost:${adminPort}`)
  }

  console.log(color(1, '\n───────────────────────────────────────'))
  if (shopPort) console.log(`  商城(H5)     ${color(36, `http://localhost:${shopPort}`)}`)
  if (adminPort) console.log(`  管理画面(PC) ${color(36, `http://localhost:${adminPort}`)}`)
  console.log(`  API          ${color(36, apiUrl)}`)
  console.log(`  API ドキュメント ${color(36, `http://localhost:${apiPort}/api/docs`)}`)
  if (dbPort) console.log(`  DB           ${color(36, `localhost:${dbPort}`)}（${DB_CONTAINER}）`)
  console.log(color(1, '───────────────────────────────────────'))
  console.log(
    `\n  微信小程序は ${color(36, 'npm run build:weapp')} 後に ${color(36, 'apps/shop/dist/weapp')} を開発者ツールで開く`,
  )
  console.log(`  業務ロジックの通し検証: ${color(36, 'npm run e2e')}`)
  console.log(`\n  ${color(90, 'Ctrl+C で停止')}\n`)
}

main().catch((err) => {
  fail(String(err.message ?? err))
  shutdown()
  process.exitCode = 1
})
