#!/usr/bin/env node
/**
 * 開発環境の後片付け。
 *
 *   npm run dev:stop            # DB コンテナを停止（データは残る）
 *   npm run dev:stop -- --purge # コンテナごと削除（データも消える）
 *
 * npm run dev は Ctrl+C で API と H5 を止めるが、DB コンテナは
 * 次回すぐ使えるよう動かしたままにしている。完全に止めたいときはこれ。
 */
const { spawnSync } = require('node:child_process')

const DB_CONTAINER = 'hfs-postgres'
const purge = process.argv.includes('--purge')

const color = (code, s) => `[${code}m${s}[0m`

/**
 * shell: true に配列を渡すと Node が DEP0190 を出すので、
 * 1 本の文字列にしてから渡す（引数は英数字とハイフンのみで安全）。
 */
function docker(args) {
  return spawnSync(['docker', ...args].join(' '), { shell: true, encoding: 'utf8' })
}

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
