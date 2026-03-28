// Minimal TAR file builder + parser (POSIX ustar, no compression).
// Sufficient for exporting and importing a set of text files in the browser.

const enc = new TextEncoder();
const dec = new TextDecoder();

function tarHeader(path: string, size: number): Uint8Array {
  const header = new Uint8Array(512);

  // File name (0–99)
  header.set(enc.encode(path.slice(0, 100)));

  // File mode (100–107): 0644
  header.set(enc.encode('0000644\0'), 100);

  // Owner/group ID (108–123): 0
  header.set(enc.encode('0000000\0'), 108);
  header.set(enc.encode('0000000\0'), 116);

  // File size in octal (124–135)
  header.set(enc.encode(size.toString(8).padStart(11, '0') + '\0'), 124);

  // Mod time (136–147): 0
  header.set(enc.encode('00000000000\0'), 136);

  // Type flag (156): '0' = regular file
  header[156] = 48; // '0'

  // ustar indicator (257–262)
  header.set(enc.encode('ustar\0'), 257);

  // ustar version (263–264)
  header.set(enc.encode('00'), 263);

  // Checksum (148–155): compute over header with checksum field as spaces
  header.set(enc.encode('        '), 148);
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += header[i];
  header.set(enc.encode(sum.toString(8).padStart(6, '0') + '\0 '), 148);

  return header;
}

export function buildTar(files: Array<{ path: string; content: string }>): Blob {
  const parts: Uint8Array[] = [];

  for (const file of files) {
    const data = enc.encode(file.content);
    parts.push(tarHeader(file.path, data.length));
    parts.push(data);
    // Pad to 512-byte boundary
    const remainder = data.length % 512;
    if (remainder > 0) parts.push(new Uint8Array(512 - remainder));
  }

  // Two 512-byte zero blocks mark end of archive
  parts.push(new Uint8Array(1024));

  return new Blob(parts, { type: 'application/x-tar' });
}

/** Parse a tar archive (ArrayBuffer) into an array of {path, content} entries.
 *  Skips directory entries and zero-filled end-of-archive blocks. */
export function parseTar(buffer: ArrayBuffer): Array<{ path: string; content: string }> {
  const bytes = new Uint8Array(buffer);
  const files: Array<{ path: string; content: string }> = [];
  let offset = 0;

  while (offset + 512 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 512);

    // End of archive: two consecutive zero blocks
    if (header.every(b => b === 0)) break;

    // File name: bytes 0–99, null-terminated
    const nameEnd = header.indexOf(0);
    const path = dec.decode(header.subarray(0, nameEnd > 0 && nameEnd < 100 ? nameEnd : 100));

    // File size: bytes 124–135, octal null-terminated
    const sizeStr = dec.decode(header.subarray(124, 136)).replace(/\0/g, '').trim();
    const size = parseInt(sizeStr, 8) || 0;

    // Type flag: byte 156 — '0' or '\0' = regular file, '5' = directory
    const type = header[156];

    offset += 512; // move past header

    if ((type === 48 || type === 0) && size > 0) { // '0' or null = regular file
      const content = dec.decode(bytes.subarray(offset, offset + size));
      files.push({ path, content });
    }

    // Advance past data, padded to 512-byte boundary
    offset += Math.ceil(size / 512) * 512;
  }

  return files;
}
