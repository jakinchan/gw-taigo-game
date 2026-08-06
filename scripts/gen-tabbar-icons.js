#!/usr/bin/env node
/**
 * tabBar アイコン（81x81 PNG）を生成する。
 *
 * 微信小程序の tabBar は iconPath に PNG/JPG しか受け付けず（SVG 不可）、
 * かつ推奨サイズが 81x81px なので、デザイン確定前でもビルドが通るように
 * プレースホルダを依存ゼロで生成する。
 *
 *   node scripts/gen-tabbar-icons.js
 *
 * 本番デザインが決まったら src/assets/tabbar/*.png を差し替えるだけでよい。
 */
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

let SIZE = 81
const SS = 3 // スーパーサンプリング倍率（アンチエイリアス用）

const COLOR_INACTIVE = [0x9a, 0xa0, 0xa6]
const COLOR_ACTIVE = [0x2b, 0x5c, 0xe6]

// ---------------------------------------------------------------
// 図形プリミティブ: (x, y) がその図形の内側なら true を返す関数を作る
// ---------------------------------------------------------------

const circle = (cx, cy, r) => (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r

const ellipse = (cx, cy, rx, ry) => (x, y) =>
  ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1

const rect = (x0, y0, x1, y1) => (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1

const roundRect = (x0, y0, x1, y1, r) => (x, y) => {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false
  const dx = Math.max(x0 + r - x, 0, x - (x1 - r))
  const dy = Math.max(y0 + r - y, 0, y - (y1 - r))
  return dx * dx + dy * dy <= r * r
}

/** 3 点で囲まれた三角形 */
const triangle = (ax, ay, bx, by, cx, cy) => (x, y) => {
  const sign = (px, py, qx, qy, rx, ry) => (px - rx) * (qy - ry) - (qx - rx) * (py - ry)
  const d1 = sign(x, y, ax, ay, bx, by)
  const d2 = sign(x, y, bx, by, cx, cy)
  const d3 = sign(x, y, cx, cy, ax, ay)
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0
  return !(hasNeg && hasPos)
}

/** 凸多角形（頂点は時計回り／反時計回りのどちらでも可） */
const polygon = (points) => (x, y) => {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]
    const [xj, yj] = points[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** 太さ w の線分 */
const line = (x0, y0, x1, y1, w) => (x, y) => {
  const dx = x1 - x0
  const dy = y1 - y0
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / len2))
  const px = x0 + t * dx
  const py = y0 + t * dy
  return (x - px) ** 2 + (y - py) ** 2 <= (w / 2) ** 2
}

const union =
  (...shapes) =>
  (x, y) =>
    shapes.some((s) => s(x, y))

const intersect =
  (...shapes) =>
  (x, y) =>
    shapes.every((s) => s(x, y))

const subtract = (base, hole) => (x, y) => base(x, y) && !hole(x, y)

// ---------------------------------------------------------------
// アイコン定義
// ---------------------------------------------------------------

/**
 * tabBar は 3 つ（首页 / 全部商品 / 我的）。
 * 実機の意匠に合わせ、塗りつぶしではなく線画（アウトライン）にする。
 */
const OUTLINE = 5 // 線幅

/** 図形の輪郭だけを残す（内側を一回り小さい相似形で抜く） */
const strokeRoundRect = (x0, y0, x1, y1, r, w = OUTLINE) =>
  subtract(
    roundRect(x0, y0, x1, y1, r),
    roundRect(x0 + w, y0 + w, x1 - w, y1 - w, Math.max(r - w, 1)),
  )

const strokeCircle = (cx, cy, r, w = OUTLINE) =>
  subtract(circle(cx, cy, r), circle(cx, cy, r - w))

const icons = {
  // 家（アウトライン）: 屋根の線 2 本 + 壁の線 + 床
  home: union(
    line(12, 40, 40.5, 15, OUTLINE),
    line(40.5, 15, 69, 40, OUTLINE),
    line(19, 38, 19, 67, OUTLINE),
    line(62, 38, 62, 67, OUTLINE),
    line(19, 65, 62, 65, OUTLINE),
  ),

  // ショッピングバッグ（全部商品）: 本体の枠 + 取っ手のアーチ
  category: union(
    strokeRoundRect(15, 28, 66, 68, 6),
    // 取っ手は半円。下半分を切り落としてアーチにする。
    subtract(strokeCircle(40.5, 28, 13), rect(0, 28, 81, 81)),
  ),

  // 笑顔（我的）: 輪郭 + 目 + 口
  user: union(
    strokeCircle(40.5, 40.5, 28),
    circle(31, 34, 3.5),
    circle(50, 34, 3.5),
    // 口: 下半分だけ残した円弧
    subtract(subtract(circle(40.5, 42, 15), circle(40.5, 42, 11)), rect(0, 0, 81, 48)),
  ),
}

// ---------------------------------------------------------------
// ラスタライズ & PNG エンコード
// ---------------------------------------------------------------

/**
 * レイヤーを手前から奥へ重ねてラスタライズする。
 * layers = [{ shape, color: [r,g,b] }, ...]（配列の先頭が最前面）
 */
function rasterizeLayers(layers) {
  // RGBA、各行の先頭にフィルタバイト 0 を付ける
  const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1))
  let offset = 0

  for (let y = 0; y < SIZE; y++) {
    raw[offset++] = 0 // filter type: None
    for (let x = 0; x < SIZE; x++) {
      let written = false
      for (const { shape, color } of layers) {
        let hits = 0
        for (let sy = 0; sy < SS; sy++) {
          for (let sx = 0; sx < SS; sx++) {
            if (shape(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS)) hits++
          }
        }
        if (hits === 0) continue
        raw[offset++] = color[0]
        raw[offset++] = color[1]
        raw[offset++] = color[2]
        raw[offset++] = Math.round((hits / (SS * SS)) * 255)
        written = true
        break
      }
      if (!written) offset += 4 // 透明のまま
    }
  }
  return raw
}

function rasterize(shape, color) {
  return rasterizeLayers([{ shape, color }])
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typeAndData), 0)
  return Buffer.concat([length, typeAndData, crc])
}

function encodePng(raw) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(SIZE, 0)
  ihdr.writeUInt32BE(SIZE, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  ihdr[10] = 0 // compression
  ihdr[11] = 0 // filter
  ihdr[12] = 0 // interlace

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---------------------------------------------------------------

const outDir = path.resolve(__dirname, '..', 'src', 'assets', 'tabbar')
fs.mkdirSync(outDir, { recursive: true })

for (const [name, shape] of Object.entries(icons)) {
  fs.writeFileSync(path.join(outDir, `${name}.png`), encodePng(rasterize(shape, COLOR_INACTIVE)))
  fs.writeFileSync(
    path.join(outDir, `${name}-active.png`),
    encodePng(rasterize(shape, COLOR_ACTIVE)),
  )
}

console.log(`generated ${Object.keys(icons).length * 2} icons -> ${outDir}`)

// ---------------------------------------------------------------
// アプリロゴ（120x120）: 緑の角丸 + 白い葉
// ---------------------------------------------------------------

SIZE = 120

// 2 円の交差（レンズ形）で葉を作る。中心を (1,1) 方向にずらすと、
// 葉の長軸は直交する (1,-1) 方向 = 右上がりになる。
const leaf = intersect(circle(40, 40, 54), circle(80, 80, 54))
const stem = line(30, 90, 44, 76, 5)

const logoRaw = rasterizeLayers([
  // 葉脈は背景より濃い緑で抜いてコントラストを出す
  { shape: intersect(leaf, line(28, 92, 92, 28, 4)), color: [0x38, 0x8e, 0x3c] },
  { shape: union(leaf, stem), color: [0xff, 0xff, 0xff] },
  { shape: roundRect(0, 0, 119, 119, 26), color: [0x4c, 0xaf, 0x50] },
])

const logoPath = path.resolve(__dirname, '..', 'src', 'assets', 'logo.png')
fs.writeFileSync(logoPath, encodePng(logoRaw))
console.log(`generated logo -> ${logoPath}`)
