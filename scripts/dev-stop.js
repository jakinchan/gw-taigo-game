#!/usr/bin/env node
/**
 * 開発環境の後片付け。
 *
 *   npm run dev:stop            # 残ったプロセスと DB コンテナを停止（データは残る）
 *   npm run dev:stop -- --purge # コンテナごと削除（データも消える）
 *
 * npm run dev は Ctrl+C で API と H5 を止めるが、npm → node → taro と
 * 段が深いため孫プロセスが取り残されることがある。残ったまま次を起動すると
 * ポートが押し出されて別番号になり、.env に書いた CORS_ORIGINS と
 * 実際の商城のオリジンがずれて API 呼び出しが全滅する。ここで確実に片付ける。
 */
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const DB_CONTAINER = 'hfs-postgres'
const REPO_ROOT = path.resolve(__dirname, '..')
const purge = process.argv.includes('--purge')

const color = (code, s) => `[${code}m${s}[0m`

/**
 * shell: true に配列を渡すと Node が DEP0190 を出すので、
 * 1 本の文字列にしてから渡す（引数は英数字とハイフンのみで安全）。
 */
function docker(args) {
  return spawnSync(['docker', ...args].join(' '), { shell: true, encoding: 'utf8' })
}

/**
 * このリポジトリ配下で動いている node プロセスを列挙する。
 *
 * 判定はコマンドラインにリポジトリのパスが含まれるかどうかだけで行う。
 * 「node を全部殺す」は絶対にやらないこと。利用者が別プロジェクトの
 * 開発サーバを同時に動かしているのが普通で、巻き添えで落ちる。
 */
function findOwnProcesses() {
  const needle = REPO_ROOT.toLowerCase()

  /**
   * 自分自身と、自分を起動した npm を除く。
   * 片付ける側が片付けられると DB の停止まで到達しない。
   */
  const isSelf = (cmd) => cmd.toLowerCase().includes('dev-stop')

  if (process.platform === 'win32') {
    const ps = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Get-CimInstance Win32_Process | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress',
      ],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
    )
    if (ps.status !== 0 || !ps.stdout.trim()) return []

    let rows
    try {
      rows = JSON.parse(ps.stdout)
    } catch {
      return []
    }
    return (Array.isArray(rows) ? rows : [rows])
      .filter((r) => r && r.CommandLine && r.CommandLine.toLowerCase().includes(needle))
      .filter((r) => !isSelf(r.CommandLine))
      .map((r) => r.ProcessId)
      .filter((pid) => pid !== process.pid)
  }

  const ps = spawnSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8' })
  if (ps.status !== 0) return []
  return ps.stdout
    .split('\n')
    .map((line) => line.trim().match(/^(\d+)\s+(.*)$/))
    .filter((m) => m && m[2].toLowerCase().includes(needle) && !isSelf(m[2]))
    .map((m) => Number(m[1]))
    .filter((pid) => pid !== process.pid)
}

function killOwnProcesses() {
  const pids = findOwnProcesses()
  if (pids.length === 0) {
    console.log(color(90, 'このリポジトリの残プロセスは無い'))
    return
  }

  for (const pid of pids) {
    try {
      // Windows は子プロセスを道連れにしないと npm → node → taro が残る
      if (process.platform === 'win32') {
        spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
      } else {
        process.kill(pid, 'SIGTERM')
      }
    } catch {
      /* 既に終了していれば何もしなくてよい */
    }
  }
  console.log(color(32, `✓ 残っていた開発プロセス ${pids.length} 個を停止`))
}

killOwnProcesses()

if (docker(['--version']).status !== 0) {
  console.log(color(33, '! docker が見つからない。停止するものは無い。'))
  process.exit(0)
}

const exists = docker(['ps', '-aq', '-f', `name=^${DB_CONTAINER}$`]).stdout.trim()
if (!exists) {
  console.log(color(90, `${DB_CONTAINER} は存在しない`))
  process.exit(0)
}

if (purge) {
  docker(['rm', '-f', DB_CONTAINER])
  console.log(color(32, `✓ ${DB_CONTAINER} を削除（データも消えた）`))
  console.log(color(90, '  次回 npm run dev でマイグレーションとシードから作り直される'))
} else {
  docker(['stop', DB_CONTAINER])
  console.log(color(32, `✓ ${DB_CONTAINER} を停止（データは残っている）`))
  console.log(color(90, '  完全に消す場合: npm run dev:stop -- --purge'))
}
