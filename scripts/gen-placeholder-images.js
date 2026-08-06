#!/usr/bin/env node
/**
 * プレースホルダ画像を生成する。
 *
 *   node scripts/gen-placeholder-images.js
 *
 * 商品写真・バナー・QR コードは本来 CDN から配信するが、開発中や
 * 画像未入稿の段階で「壊れた画像アイコン」が並ぶと、レイアウトの
 * 検証ができない。ブランドカラーの無地＋ロゴマークを敷いておく。
 *
 * 依存ゼロ（Node 標準の zlib だけで PNG を書く）。
 */
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const BLUE = [0x2b, 0x5c, 0xe6]
const BLUE_LIGHT = [0x5b, 0x85, 0xf5]
const SURFACE = [0xff, 0xff, 0xff]
const MUTED = [0xe6, 0xe8, 0xeb]

// ---------------------------------------------------------------
// PNG エンコード（gen-tabbar-icons.js と同じ方式）
// ---------------------------------------------------------------

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

function encodePng(width, height, raw) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/**
 * paint(x, y) が [r,g,b] または [r,g,b,a] を返す。
 */
function render(width, height, paint) {
  const raw = Buffer.alloc(height * (width * 4 + 1))
  let offset = 0
  for (let y = 0; y < height; y++) {
    raw[offset++] = 0 // filter: None
    for (let x = 0; x < width; x++) {
      const c = paint(x, y)
      raw[offset++] = c[0]
      raw[offset++] = c[1]
      raw[offset++] = c[2]
      raw[offset++] = c.length > 3 ? c[3] : 255
    }
  }
  return raw
}

// ---------------------------------------------------------------
// 図形
// ---------------------------------------------------------------

const lerp = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))

/** 葉のマーク（ロゴと同じ意匠）を中心に置く */
function leafAt(cx, cy, scale) {
  const r = 54 * scale
  const d = 20 * scale
  return (x, y) => {
    const dx1 = x - (cx - d)
    const dy1 = y - (cy - d)
    const dx2 = x - (cx + d)
    const dy2 = y - (cy + d)
    return dx1 * dx1 + dy1 * dy1 <= r * r && dx2 * dx2 + dy2 * dy2 <= r * r
  }
}

// ---------------------------------------------------------------
// 生成対象
// ---------------------------------------------------------------

const outDir = path.resolve(__dirname, '..', 'src', 'assets', 'placeholder')
fs.mkdirSync(outDir, { recursive: true })

const targets = [
  // バナー: 青のグラデーション + 中央に葉
  {
    name: 'banner',
    width: 750,
    height: 320,
    paint: (x, y, w, h) => {
      const base = lerp(BLUE_LIGHT, BLUE, x / w)
      return leafAt(w / 2, h / 2, 0.9)(x, y) ? lerp(base, SURFACE, 0.85) : base
    },
  },
  // 商品サムネイル: 薄いグレー + 中央に淡い葉
  {
    name: 'product',
    width: 300,
    height: 400,
    paint: (x, y, w, h) => (leafAt(w / 2, h / 2, 0.85)(x, y) ? MUTED.map((v) => v - 14) : SURFACE),
  },
  // カテゴリアイコン: 淡青の角丸 + 葉
  {
    name: 'category',
    width: 120,
    height: 120,
    paint: (x, y, w, h) => {
      const inRound =
        x >= 8 && x <= w - 8 && y >= 8 && y <= h - 8
      if (!inRound) return [0, 0, 0, 0]
      return leafAt(w / 2, h / 2, 0.55)(x, y) ? BLUE : [0xea, 0xf1, 0xff]
    },
  },
  // アバター: 円形のグレー
  {
    name: 'avatar',
    width: 120,
    height: 120,
    paint: (x, y, w, h) => {
      const dx = x - w / 2
      const dy = y - h / 2
      if (dx * dx + dy * dy > (w / 2) * (w / 2)) return [0, 0, 0, 0]
      return leafAt(w / 2, h / 2, 0.5)(x, y) ? SURFACE : MUTED
    },
  },
]

for (const target of targets) {
  const { name, width, height, paint } = target
  const raw = render(width, height, (x, y) => paint(x, y, width, height))
  fs.writeFileSync(path.join(outDir, `${name}.png`), encodePng(width, height, raw))
}

console.log(`generated ${targets.length} placeholder images -> ${outDir}`)
