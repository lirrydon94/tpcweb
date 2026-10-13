import fs from 'node:fs';
import path from 'node:path';

function readVarint(buf, pos) {
  let res = 0;
  let shift = 0;
  while (pos < buf.length) {
    const b = buf[pos++];
    res |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) break;
    shift += 7;
  }
  return [res, pos];
}

function decompressSnappy(buf) {
  let pos = 0;
  const [uncompressedLen, newPos] = readVarint(buf, pos);
  pos = newPos;
  const out = [];
  while (pos < buf.length) {
    const tag = buf[pos++];
    const tagType = tag & 0x03;
    if (tagType === 0) {
      let len = tag >> 2;
      if (len < 60) len += 1;
      else if (len === 60) len = buf[pos++] + 1;
      else if (len === 61) len = (buf[pos++] | (buf[pos++] << 8)) + 1;
      else if (len === 62) len = (buf[pos++] | (buf[pos++] << 8) | (buf[pos++] << 16)) + 1;
      else if (len === 63) len = (buf[pos++] | (buf[pos++] << 8) | (buf[pos++] << 16) | (buf[pos++] << 24)) + 1;
      for (let i = 0; i < len; i++) out.push(buf[pos++]);
    } else if (tagType === 1) {
      const len = 4 + ((tag >> 2) & 7);
      const offset = ((tag >> 5) << 8) | buf[pos++];
      for (let i = 0; i < len; i++) out.push(out[out.length - offset]);
    } else if (tagType === 2) {
      const len = 1 + (tag >> 2);
      const offset = buf[pos++] | (buf[pos++] << 8);
      for (let i = 0; i < len; i++) out.push(out[out.length - offset]);
    } else if (tagType === 3) {
      const len = 1 + (tag >> 2);
      const offset = buf[pos++] | (buf[pos++] << 8) | (buf[pos++] << 16) | (buf[pos++] << 24);
      for (let i = 0; i < len; i++) out.push(out[out.length - offset]);
    }
  }
  return Buffer.from(out);
}

function decodeBlock(buf, offset, size) {
  const blockData = buf.subarray(offset, offset + size);
  const type = buf[offset + size];
  if (type === 0) return blockData;
  if (type === 1) return decompressSnappy(blockData);
  return blockData;
}

function scanDir(dir) {
  const workspaces = [];
  if (!fs.existsSync(dir)) return workspaces;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.ldb'));
  for (const file of files) {
    try {
      const buf = fs.readFileSync(path.join(dir, file));
      if (buf.length < 48) continue;
      const magic = buf.readBigUInt64LE(buf.length - 8);
      if (magic !== 0xdb4775248b80fb57n) continue;

      let pos = buf.length - 48;
      const [metaOffset, pos1] = readVarint(buf, pos);
      const [metaSize, pos2] = readVarint(buf, pos1);
      const [indexOffset, pos3] = readVarint(buf, pos2);
      const [indexSize] = readVarint(buf, pos3);

      const indexBlockData = decodeBlock(buf, indexOffset, indexSize);
      const numRestarts = indexBlockData.readUInt32LE(indexBlockData.length - 4);
      const restartsOffset = indexBlockData.length - 4 - numRestarts * 4;

      let blockPos = 0;
      let lastKey = Buffer.alloc(0);
      while (blockPos < restartsOffset) {
        const [shared, p1] = readVarint(indexBlockData, blockPos);
        const [nonShared, p2] = readVarint(indexBlockData, p1);
        const [valueLen, p3] = readVarint(indexBlockData, p2);
        const key = Buffer.concat([
          lastKey.subarray(0, shared),
          indexBlockData.subarray(p3, p3 + nonShared)
        ]);
        lastKey = key;
        const valBuf = indexBlockData.subarray(p3 + nonShared, p3 + nonShared + valueLen);
        blockPos = p3 + nonShared + valueLen;

        const [dataOffset, vp1] = readVarint(valBuf, 0);
        const [dataSize] = readVarint(valBuf, vp1);

        const dataBlock = decodeBlock(buf, dataOffset, dataSize);
        const text = dataBlock.toString('latin1');
        if (text.includes('skift-workspace-v1')) {
          const marker = 'skift-workspace-v1';
          let idx = text.indexOf(marker);
          while (idx !== -1) {
            const jStart = text.indexOf('{"working":', idx);
            if (jStart !== -1 && jStart - idx < 50) {
              let depth = 0;
              let end = -1;
              for (let i = jStart; i < text.length; i++) {
                if (text[i] === '{') depth++;
                else if (text[i] === '}') {
                  depth--;
                  if (depth === 0) { end = i + 1; break; }
                }
              }
              if (end !== -1) {
                try {
                  const obj = JSON.parse(text.slice(jStart, end));
                  if (obj?.working?.teams) workspaces.push(obj);
                } catch {}
              }
            }
            idx = text.indexOf(marker, idx + 1);
          }
        }
      }
    } catch {}
  }
  return workspaces;
}

const chromeDir = path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data', 'Default', 'Local Storage', 'leveldb');
const edgeDir = path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'User Data', 'Default', 'Local Storage', 'leveldb');

const all = [...scanDir(chromeDir), ...scanDir(edgeDir)];
all.sort((a, b) => (b.revision || 0) - (a.revision || 0));

if (!all.length) {
  console.log('Ingen sparad arbetsyta hittades i webbläsaren.');
  process.exit(0);
}

const best = all[0];
// Clean up any empty test teams with 0 members if other teams exist
if (best.working.teams.length > 1) {
  best.working.teams = best.working.teams.filter(t => t.members && t.members.length > 0);
}

const targetPath = path.resolve(import.meta.dirname, '..', 'src', 'default-data.js');
const content = `export const defaultWorkspace = ${JSON.stringify(best, null, 2)};\n`;
fs.writeFileSync(targetPath, content, 'utf8');

console.log(`✓ Schemat har synkroniserats från webbläsaren till src/default-data.js!`);
console.log(`  Revision: ${best.revision}`);
for (const t of best.working.teams) {
  console.log(`  Team "${t.name}" (${t.members.length} medarbetare):`);
  console.log(`    ${t.members.map(m => m.name).join(', ')}`);
}
console.log('\nKör nu:');
console.log('  git add src/default-data.js');
console.log('  git commit -m "Uppdaterat schema med medarbetare"');
console.log('  git push');
