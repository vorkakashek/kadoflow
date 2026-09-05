import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const recipes = [
  {
    input: 'assets/source-media/env/studio_small_09_2k.hdr',
    output: 'public/env/studio_small_09_256.hdr',
    width: 256,
  },
  {
    input: 'assets/source-media/env/studio_small_03_1k.hdr',
    output: 'public/env/studio_small_03_256.hdr',
    width: 256,
  },
]
const scriptMtime = (await stat(new URL(import.meta.url))).mtimeMs

function decodeScanline(buffer, offset, width) {
  if (
    buffer[offset] !== 2
    || buffer[offset + 1] !== 2
    || ((buffer[offset + 2] << 8) | buffer[offset + 3]) !== width
  ) {
    throw new Error('Only modern Radiance RLE scanlines are supported')
  }
  offset += 4
  const channels = Array.from({ length: 4 }, () => new Uint8Array(width))
  for (let channel = 0; channel < 4; channel += 1) {
    let x = 0
    while (x < width) {
      const count = buffer[offset++]
      if (count > 128) {
        const length = count - 128
        const value = buffer[offset++]
        channels[channel].fill(value, x, x + length)
        x += length
      } else {
        channels[channel].set(buffer.subarray(offset, offset + count), x)
        offset += count
        x += count
      }
    }
  }
  const pixels = new Uint8Array(width * 4)
  for (let x = 0; x < width; x += 1) {
    for (let channel = 0; channel < 4; channel += 1) {
      pixels[x * 4 + channel] = channels[channel][x]
    }
  }
  return { pixels, offset }
}

function rgbeToLinear(rgbe, offset, target) {
  const exponent = rgbe[offset + 3]
  if (!exponent) {
    target[0] = target[1] = target[2] = 0
    return
  }
  const scale = 2 ** (exponent - 136)
  target[0] = (rgbe[offset] + 0.5) * scale
  target[1] = (rgbe[offset + 1] + 0.5) * scale
  target[2] = (rgbe[offset + 2] + 0.5) * scale
}

function linearToRgbe(rgb, target, offset) {
  const max = Math.max(rgb[0], rgb[1], rgb[2])
  if (max < 1e-32) {
    target.fill(0, offset, offset + 4)
    return
  }
  const exponent = Math.floor(Math.log2(max)) + 1
  const scale = 256 / 2 ** exponent
  target[offset] = Math.min(255, Math.max(0, Math.floor(rgb[0] * scale)))
  target[offset + 1] = Math.min(255, Math.max(0, Math.floor(rgb[1] * scale)))
  target[offset + 2] = Math.min(255, Math.max(0, Math.floor(rgb[2] * scale)))
  target[offset + 3] = exponent + 128
}

function encodeChannel(channel) {
  const chunks = []
  let cursor = 0
  while (cursor < channel.length) {
    let runStart = -1
    let runLength = 0
    for (let candidate = cursor; candidate < channel.length;) {
      let length = 1
      while (
        candidate + length < channel.length
        && length < 127
        && channel[candidate + length] === channel[candidate]
      ) length += 1
      if (length >= 4) {
        runStart = candidate
        runLength = length
        break
      }
      candidate += length
    }

    if (runStart === cursor) {
      chunks.push(Buffer.from([128 + runLength, channel[cursor]]))
      cursor += runLength
      continue
    }

    const literalEnd = Math.min(
      channel.length,
      cursor + 128,
      runStart === -1 ? channel.length : runStart,
    )
    const literalLength = literalEnd - cursor
    chunks.push(
      Buffer.from([literalLength]),
      Buffer.from(channel.subarray(cursor, literalEnd)),
    )
    cursor = literalEnd
  }
  return chunks
}

function encodeScanline(pixels, width) {
  const chunks = [Buffer.from([2, 2, width >> 8, width & 255])]
  for (let channel = 0; channel < 4; channel += 1) {
    const values = new Uint8Array(width)
    for (let x = 0; x < width; x += 1) values[x] = pixels[x * 4 + channel]
    chunks.push(...encodeChannel(values))
  }
  return Buffer.concat(chunks)
}

async function optimize({ input, output, width: targetWidth }) {
  const inputPath = resolve(input)
  const outputPath = resolve(output)
  try {
    const [sourceStat, targetStat] = await Promise.all([stat(inputPath), stat(outputPath)])
    if (
      targetStat.mtimeMs >= sourceStat.mtimeMs
      && targetStat.mtimeMs >= scriptMtime
    ) return
  } catch {
    // Missing output: build it below.
  }

  const buffer = await readFile(inputPath)
  const headerText = buffer.subarray(0, Math.min(buffer.length, 1024)).toString('ascii')
  const match = /-Y\s+(\d+)\s+\+X\s+(\d+)\s*\n/.exec(headerText)
  if (!match) throw new Error(`Unsupported HDR orientation: ${input}`)
  const sourceHeight = Number(match[1])
  const sourceWidth = Number(match[2])
  const dataStart = match.index + match[0].length
  const scale = sourceWidth / targetWidth
  if (!Number.isInteger(scale) || sourceHeight % scale !== 0) {
    throw new Error(`Target width ${targetWidth} must divide ${sourceWidth}`)
  }
  const targetHeight = sourceHeight / scale
  const sourcePixels = new Uint8Array(sourceWidth * sourceHeight * 4)
  let offset = dataStart
  for (let y = 0; y < sourceHeight; y += 1) {
    const scanline = decodeScanline(buffer, offset, sourceWidth)
    sourcePixels.set(scanline.pixels, y * sourceWidth * 4)
    offset = scanline.offset
  }

  const outputRows = []
  const rgb = new Float64Array(3)
  const sample = new Float64Array(3)
  for (let y = 0; y < targetHeight; y += 1) {
    const row = new Uint8Array(targetWidth * 4)
    for (let x = 0; x < targetWidth; x += 1) {
      rgb.fill(0)
      for (let yy = 0; yy < scale; yy += 1) {
        for (let xx = 0; xx < scale; xx += 1) {
          const sourceOffset = (((y * scale + yy) * sourceWidth) + x * scale + xx) * 4
          rgbeToLinear(sourcePixels, sourceOffset, sample)
          rgb[0] += sample[0]
          rgb[1] += sample[1]
          rgb[2] += sample[2]
        }
      }
      const area = scale * scale
      rgb[0] /= area
      rgb[1] /= area
      rgb[2] /= area
      linearToRgbe(rgb, row, x * 4)
    }
    outputRows.push(encodeScanline(row, targetWidth))
  }

  const header = Buffer.from(
    `#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${targetHeight} +X ${targetWidth}\n`,
  )
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, Buffer.concat([header, ...outputRows]))
  console.log(`Generated ${output} (${targetWidth}x${targetHeight})`)
}

await Promise.all(recipes.map(optimize))
