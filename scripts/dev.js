#!/usr/bin/env node
/**
 * 開発環境をまとめて立ち上げる。
 *
 *   npm run dev            # DB + API + H5 を起動
 *   npm run dev -- --no-h5 # API だけ（微信開発者ツールで確認する場合）
 *   npm run dev -- --fresh # DB を作り直してシードから入れ直す
 *
 * やっていること:
 *   1. 依存のインストール（node_modules が無ければ）
 *   2. PostgreSQL を Docker で起動（空きポートを自動で選ぶ）
 *   3. backend/.env の生成（秘密鍵はランダム。既存があれば触らない）
 *   4. prisma generate → migrate → seed
 *   5. API と H5 dev server を起動し、準備できるまで待つ
 *
 * ポートは固定せず空きを探す。開発機には既に PostgreSQL が動いていたり、
 * 3000 番が別プロジェクトに使われていたりするのが普通なので、
 * 固定するとその都度ここで詰まる。
 */
const { spawn, spawnSync } = require('node:child_process')
const net = require('node:net')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const ROOT = path.resolve(__dirname, '..')
const BACKEND = path.join(ROOT, 'backend')

const args = process.argv.slice(2)
const withH5 = !args.includes('--no-h5')
const fresh = args.includes('--fresh')

const DB_CONTAINER = 'hfs-postgres'
const DB_NAME = 'health_food_shop'
const DB_PASSWORD = 'password'

/** 起動した子プロセス。終了時にまとめて片付ける。 */
const children = []

/**
 * 自分が起動したプロセスの PID を残しておくファイル。
 *
 * Ctrl+C なら終了処理で片付くが、ターミナルを閉じられたりクラッシュしたりすると
 * webpack や nest が生き残り、次回の起動でポートを奪い合う。
 * 「自分が起動したものだけ」を記録しておき、次回はそれだけを片付ける。
 * 無関係なプロセスを PID の総当たりで殺さないための仕組み。
 */
const PID_FILE = path.join(__dirname, '.dev-pids.json')

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

/** 前回の実行が残したプロセスを片付ける */
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
      // シグナル 0 は存在確認だけで何もしない
      process.kill(pid, 0)
    } catch {
      continue // 既に終了している
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
 * shell: true に配列を渡すと Node が DEP0190 を出すため、
 * 引数を組み立てて 1 本の文字列で渡す。
 */
function toShellCommand(cmd, cmdArgs) {
  const quoted = cmdArgs.map((arg) =>
    // 既に引用符が付いているものと、素朴な引数はそのまま
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
  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

function hasCommand(cmd) {
  return run(cmd, ['--version'], { quiet: true }).code === 0
}

/**
 * そのポートで listen できるか（= 空いているか）。
 *
 * host を指定せずに listen することが重要。
 * '0.0.0.0' を指定すると IPv4 しか見ないが、NestJS や webpack-dev-server は
 * host 未指定＝ IPv6 のデュアルスタック（:::PORT）で bind する。
 * IPv4 だけ見て「空き」と判断すると、IPv6 側が塞がっていた場合に
 * 起動時になって EADDRINUSE で落ちる。実際に使う条件と同じ方法で確かめる。
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

/** 条件が満たされるまで待つ。満たされなければ false。 */
async function waitFor(check, { timeoutMs = 120_000, intervalMs = 1000, label = '' } = {}) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await check()) return true
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  fail(`${label} がタイムアウトした（${timeoutMs / 1000} 秒）`)
  return false
}

/**
 * 疎通確認。
 * localhost だと Node の fetch が IPv6 (::1) を先に引いて、
 * IPv4 でしか listen していないサーバに繋がらないことがあるので、
 * チェックは必ず 127.0.0.1 で行う（表示は localhost のまま）。
 */
async function httpOk(url) {
  try {
    const res = await fetch(url.replace('//localhost:', '//127.0.0.1:'), {
      signal: AbortSignal.timeout(3000),
    })
    return res.status > 0
  } catch {
    return false
  }
}

/** ログを前置きつきで流す長時間プロセス */
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
      for (const line of lines) {
        // webpack の進捗バーは書き換え制御文字だらけなので落とす
        if (!line.trim() || line.includes('[2K')) continue
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
    // Windows では子孫プロセスまで落とさないと webpack が残る
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    } else {
      child.kill('SIGTERM')
    }
  }
  fs.rmSync(PID_FILE, { force: true })
  info(`DB コンテナは動かしたままにする（止める場合: docker stop ${DB_CONTAINER}）`)
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

// ---------------------------------------------------------------
// 各ステップ
// ---------------------------------------------------------------

function installDeps() {
  for (const [label, dir] of [
    ['ミニプログラム', ROOT],
    ['バックエンド', BACKEND],
  ]) {
    if (fs.existsSync(path.join(dir, 'node_modules'))) continue
    info(`${label}の依存をインストール中（初回のみ・数分かかる）`)
    if (run('npm', ['install', '--no-audit', '--no-fund'], { cwd: dir }).code !== 0) {
      throw new Error(`${label}の npm install に失敗`)
    }
  }
  ok('依存を確認')
}

async function startDatabase() {
  if (!hasCommand('docker')) {
    warn('docker が見つからない。backend/.env の DATABASE_URL を自分で設定すること')
    return null
  }

  if (fresh) {
    info('--fresh: DB コンテナを作り直す')
    run('docker', ['rm', '-f', DB_CONTAINER], { quiet: true })
  }

  const running = run('docker', ['ps', '-q', '-f', `name=^${DB_CONTAINER}$`], { quiet: true })
  if (running.stdout.trim()) {
    // 既に動いている。割り当て済みのポートを読み取る。
    const portInfo = run('docker', ['port', DB_CONTAINER, '5432'], { quiet: true }).stdout.trim()
    const port = Number(portInfo.split(':').pop())
    ok(`PostgreSQL は起動済み（ポート ${port}）`)
    return port
  }

  // 停止状態のコンテナが残っていれば作り直す（ポートが変わっている可能性があるため）
  const exists = run('docker', ['ps', '-aq', '-f', `name=^${DB_CONTAINER}$`], { quiet: true })
  if (exists.stdout.trim()) run('docker', ['rm', '-f', DB_CONTAINER], { quiet: true })

  const port = await findFreePort(55432, 'PostgreSQL')
  info(`PostgreSQL をポート ${port} で起動`)

  const created = run('docker', [
    'run', '-d',
    '--name', DB_CONTAINER,
    '-e', `POSTGRES_PASSWORD=${DB_PASSWORD}`,
    '-e', `POSTGRES_DB=${DB_NAME}`,
    '-p', `${port}:5432`,
    'postgres:16-alpine',
  ], { quiet: true })

  if (created.code !== 0) throw new Error(`DB コンテナの起動に失敗:\n${created.stderr}`)

  const ready = await waitFor(
    async () => run('docker', ['exec', DB_CONTAINER, 'pg_isready', '-U', 'postgres'], { quiet: true }).code === 0,
    { timeoutMs: 60_000, label: 'PostgreSQL の起動' },
  )
  if (!ready) throw new Error('PostgreSQL が起動しなかった')

  ok(`PostgreSQL 起動（localhost:${port}）`)
  return port
}

function ensureEnv(dbPort, apiPort, h5Port) {
  const envPath = path.join(BACKEND, '.env')
  const examplePath = path.join(BACKEND, '.env.example')

  if (!fs.existsSync(envPath)) {
    info('backend/.env を生成（秘密鍵はランダム生成・コミットされない）')
    const rand = (bytes) => crypto.randomBytes(bytes).toString('base64')
    let env = fs.readFileSync(examplePath, 'utf8')
    env = env
      .replace(/^JWT_SECRET=.*/m, `JWT_SECRET=${rand(48)}`)
      .replace(/^ENCRYPTION_KEY=.*/m, `ENCRYPTION_KEY=${rand(32)}`)
      .replace(/^HASH_PEPPER=.*/m, `HASH_PEPPER=${rand(32)}`)
    fs.writeFileSync(envPath, env)
  }

  // ポートは毎回選び直すので、その都度書き戻す
  let env = fs.readFileSync(envPath, 'utf8')
  if (dbPort) {
    env = env.replace(
      /^DATABASE_URL=.*/m,
      `DATABASE_URL=postgresql://postgres:${DB_PASSWORD}@localhost:${dbPort}/${DB_NAME}?schema=public`,
    )
  }
  env = env.replace(/^PORT=.*/m, `PORT=${apiPort}`)

  /**
   * CORS も H5 のポートに追随させる。
   * ここを固定にしていると、H5 が別ポートに逃げた瞬間に
   * ブラウザからの API 呼び出しが全部プリフライトで弾かれる。
   */
  if (h5Port) {
    const origins = [`http://localhost:${h5Port}`, `http://127.0.0.1:${h5Port}`].join(',')
    env = env.replace(/^CORS_ORIGINS=.*/m, `CORS_ORIGINS=${origins}`)
  }

  fs.writeFileSync(envPath, env)
  ok('backend/.env を更新')
}

/**
 * Prisma クライアントの再生成が必要か。
 *
 * 毎回走らせると、Windows では query engine の DLL が
 * 実行中の Node プロセスに掴まれていて EPERM で落ちる。
 * スキーマが生成物より新しいときだけ生成すれば、その競合はほぼ起きない。
 */
function needsPrismaGenerate() {
  const schema = path.join(BACKEND, 'prisma', 'schema.prisma')
  const client = path.join(BACKEND, 'node_modules', '.prisma', 'client', 'index.js')
  try {
    return fs.statSync(schema).mtimeMs > fs.statSync(client).mtimeMs
  } catch {
    return true // 生成物が無い（初回）
  }
}

function prepareDatabase() {
  if (needsPrismaGenerate()) {
    info('Prisma クライアントを生成')
    let generated = run('npx', ['prisma', 'generate'], { cwd: BACKEND, quiet: true })

    if (generated.code !== 0) {
      // 直前のプロセスがまだ DLL を掴んでいることがあるので、待って一度だけ再試行
      warn('prisma generate に失敗。ファイルロックの解放を待って再試行する')
      spawnSync(process.execPath, ['-e', 'setTimeout(()=>{}, 4000)'], { stdio: 'ignore' })
      generated = run('npx', ['prisma', 'generate'], { cwd: BACKEND, quiet: true })
    }

    if (generated.code !== 0) {
      // 既存のクライアントがあるなら、それで動く可能性が高いので止めない
      if (fs.existsSync(path.join(BACKEND, 'node_modules', '.prisma', 'client', 'index.js'))) {
        warn('prisma generate に失敗したが、既存のクライアントで続行する')
        warn('スキーマを変更した場合は、全プロセスを止めてから npx prisma generate を実行すること')
      } else {
        throw new Error(`prisma generate に失敗:\n${generated.stderr || generated.stdout}`)
      }
    }
  } else {
    ok('Prisma クライアントは最新')
  }

  info('マイグレーションを適用')
  const migrate = run('npx', ['prisma', 'migrate', 'deploy'], { cwd: BACKEND, quiet: true })
  if (migrate.code !== 0) throw new Error(`prisma migrate deploy に失敗:\n${migrate.stderr}`)

  // 既に商品が入っていれば seed しない（seed は重複を作るので二度流さない）
  if (hasSeedData()) {
    ok('シードデータは投入済み')
    return
  }

  info('シードデータを投入')
  const seeded = run('npm', ['run', 'seed'], { cwd: BACKEND, quiet: true })
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

  // 先に前回の残骸を片付ける。残っているとポートを奪い合って EADDRINUSE になる。
  killStaleProcesses()

  installDeps()
  const dbPort = await startDatabase()

  /**
   * ポートは起動より先に全部決めておく。
   * API を立ててから H5 のポートを決めると、CORS の許可オリジンを
   * .env に書く時点で H5 のポートが分からず、後追いで直せない。
   */
  const apiPort = await findFreePort(3100, 'API')
  const h5Port = withH5 ? await findFreePort(10086, 'H5') : null

  ensureEnv(dbPort, apiPort, h5Port)

  if (dbPort) prepareDatabase()

  // --- API ---
  info(`API を起動（ポート ${apiPort}）`)
  startProcess('api', 'npm', ['run', 'start:dev'], {
    cwd: BACKEND,
    // シェルに PORT が残っていると ConfigService がそちらを優先してしまう
    env: { PORT: String(apiPort) },
  })

  const apiUrl = `http://localhost:${apiPort}/api`
  // nest の初回コンパイルは、マシンが混んでいると 2 分を超えることがある
  if (
    !(await waitFor(() => httpOk(`${apiUrl}/categories`), {
      timeoutMs: 240_000,
      label: 'API の起動',
    }))
  ) {
    throw new Error('API が起動しなかった（上のログを確認）')
  }
  ok(`API 起動 → ${apiUrl}`)

  // --- H5 ---
  if (h5Port) {
    info(`ミニプログラム（H5）をビルド中... 初回は 1〜2 分かかる`)
    startProcess('h5', 'npm', ['run', 'dev:h5'], {
      env: {
        // API のポートは毎回変わりうるので、ビルド時に定数として注入する
        API_BASE_URL: apiUrl,
        // config/index.ts の h5.devServer.port が読む
        H5_PORT: String(h5Port),
      },
      // NestJS 用の PORT を引き継ぐと dev server が別ポートを掴んでしまう
      unsetEnv: ['PORT'],
    })

    if (!(await waitFor(() => httpOk(`http://localhost:${h5Port}/`), { timeoutMs: 300_000, label: 'H5 の起動' }))) {
      throw new Error('H5 dev server が起動しなかった')
    }
    ok(`H5 起動 → http://localhost:${h5Port}`)
  }

  console.log(color(1, '\n───────────────────────────────────────'))
  if (h5Port) console.log(`  画面      ${color(36, `http://localhost:${h5Port}`)}`)
  console.log(`  API       ${color(36, apiUrl)}`)
  console.log(`  API ドキュメント ${color(36, `http://localhost:${apiPort}/api/docs`)}`)
  if (dbPort) console.log(`  DB        ${color(36, `localhost:${dbPort}`)}（${DB_CONTAINER}）`)
  console.log(color(1, '───────────────────────────────────────'))
  console.log(
    `\n  微信開発者ツールで確認する場合は ${color(36, 'npm run build:weapp')} 後に ${color(36, 'dist/weapp')} を開く`,
  )
  console.log(`  業務ロジックの通し検証: ${color(36, 'cd backend && npm run e2e')}`)
  console.log(`\n  ${color(90, 'Ctrl+C で停止')}\n`)
}

main().catch((err) => {
  fail(String(err.message ?? err))
  shutdown()
  process.exitCode = 1
})
