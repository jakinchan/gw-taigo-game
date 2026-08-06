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

const COLOR_INACTIVE = [0x9a, 0xa1, 0x9c]
const COLOR_ACTIVE = [0x4c, 0xaf, 0x50]

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

const icons = {
  // 家: 屋根の三角 + 本体 - ドア
  home: subtract(
    union(triangle(40.5, 12, 10, 40, 71, 40), rect(20, 36, 61, 68)),
    rect(33, 50, 48, 68),
  ),

  // 2x2 グリッド
  category: union(
    roundRect(13, 13, 37, 37, 5),
    roundRect(44, 13, 68, 37, 5),
    roundRect(13, 44, 37, 68, 5),
    roundRect(44, 44, 68, 68, 5),
  ),

  // ショッピングカート: 取っ手 + かご + 車輪
  cart: union(
    line(8, 15, 21, 15, 5),
    line(21, 15, 26, 27, 5),
    polygon([
      [22, 27],
      [72, 27],
      [62, 55],
      [30, 55],
    ]),
    circle(33, 65, 5.5),
    circle(58, 65, 5.5),
  ),

  // 人: 頭 + 肩
  user: union(circle(40.5, 27, 13), subtract(ellipse(40.5, 72, 25, 27), rect(0, 70, 81, 81))),
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
