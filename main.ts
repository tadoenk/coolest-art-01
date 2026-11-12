import * as fs from 'node:fs';
import * as path from 'node:path';

function fail(msg: string): never {
  process.stderr.write(`Error: ${msg}\n`);
  process.exit(1);
}

const sourcePath = path.join(path.dirname(new URL(import.meta.url).pathname), 'entry.png');

let buf: Buffer;
try {
  buf = fs.readFileSync(sourcePath);
} catch (err) {
  fail(`Source image missing or unreadable: ${sourcePath}`);
}

if (buf.length === 0 || buf.length > 1048576) {
  fail(`Byte size ${buf.length} is invalid (must be > 0 and <= 1048576)`);
}

const isPng =
  buf.length >= 8 &&
  buf[0] === 0x89 &&
  buf[1] === 0x50 &&
  buf[2] === 0x4e &&
  buf[3] === 0x47 &&
  buf[4] === 0x0d &&
  buf[5] === 0x0a &&
  buf[6] === 0x1a &&
  buf[7] === 0x0a;

const isJpeg = buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;

if (!isPng && !isJpeg) {
  fail('Magic bytes are neither valid PNG signature nor JPEG SOI');
}

let width = 0;
let height = 0;
let formatName = '';

// Precompute CRC table for PNG CRC32
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[i] = c;
}

function computeCrc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

if (isPng) {
  formatName = 'PNG';
  if (buf.length < 24) {
    fail('PNG file is too short to contain IHDR chunk');
  }
  const chunkType = buf.subarray(12, 16).toString('ascii');
  if (chunkType !== 'IHDR') {
    fail('First PNG chunk is not IHDR');
  }
  width = buf.readUInt32BE(16);
  height = buf.readUInt32BE(20);

  // Walk PNG chunks starting right after signature (offset 8)
  let offset = 8;
  let iendFound = false;

  while (offset < buf.length) {
    if (offset + 12 > buf.length) {
      fail('PNG chunk header runs past the end of the file');
    }
    const length = buf.readUInt32BE(offset);
    const type = buf.subarray(offset + 4, offset + 8).toString('ascii');
    
    const dataEnd = offset + 8 + length;
    const totalChunkEnd = dataEnd + 4;

    if (totalChunkEnd > buf.length) {
      fail(`PNG chunk length for ${type} runs past the end of the file`);
    }

    const chunkDataForCrc = buf.subarray(offset + 4, dataEnd);
    const expectedCrc = buf.readUInt32BE(dataEnd);
    const actualCrc = computeCrc32(chunkDataForCrc);

    if (actualCrc !== expectedCrc) {
      fail(`CRC mismatch in chunk ${type}`);
    }

    if (type === 'IEND') {
      iendFound = true;
      if (totalChunkEnd !== buf.length) {
        fail('Trailing bytes found after PNG IEND chunk');
      }
      break;
    }

    offset = totalChunkEnd;
  }

  if (!iendFound) {
    fail('Missing IEND chunk in PNG file');
  }
} else {
  formatName = 'JPEG';
  if (buf.length < 4 || buf[buf.length - 2] !== 0xff || buf[buf.length - 1] !== 0xd9) {
    fail('JPEG file is truncated (missing EOI marker FF D9)');
  }

  let offset = 2; // skip SOI (FF D8)
  let sofFound = false;

  while (offset < buf.length) {
    while (offset < buf.length && buf[offset] === 0xff) {
      offset++;
    }
    if (offset >= buf.length) {
      break;
    }
    const marker = buf[offset];
    offset++;

    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      continue;
    }

    if (offset + 2 > buf.length) {
      fail('JPEG marker segment length runs past the end of the buffer');
    }
    const segLen = buf.readUInt16BE(offset);
    if (segLen < 2 || offset + segLen > buf.length) {
      fail('Invalid JPEG segment length');
    }

    if (marker === 0xc0 || marker === 0xc2) {
      if (segLen < 7) {
        fail('SOF segment too short');
      }
      height = buf.readUInt16BE(offset + 3);
      width = buf.readUInt16BE(offset + 5);
      sofFound = true;
      break;
    }

    offset += segLen;
  }

  if (!sofFound) {
    fail('JPEG Start Of Frame (SOF) marker not found or not whole');
  }
}

if (width === 0 || height === 0 || width > 1024 || height > 1024) {
  fail(`Dimensions ${width}x${height} are invalid (must be between 1 and 1024)`);
}

const outputDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';
const destPath = path.join(outputDir, 'entry.png');

try {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(destPath, buf);
} catch (err) {
  fail(`Failed to write output file: ${err instanceof Error ? err.message : String(err)}`);
}

let writtenBuf: Buffer;
try {
  writtenBuf = fs.readFileSync(destPath);
} catch (err) {
  fail(`Failed to read back written file: ${err instanceof Error ? err.message : String(err)}`);
}

if (!buf.equals(writtenBuf)) {
  fail('Written file differs byte-for-byte from source buffer');
}

process.stdout.write(`Detected format: ${formatName}, Dimensions: ${width}x${height}, Size: ${buf.length} bytes\n`);
