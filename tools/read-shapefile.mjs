// Polygon/Null source files only. Buffers are immutable inputs; cache offsets for bulk reads.
const indexes = new WeakMap();
const utf8 = new TextDecoder("utf-8", { fatal: true });

export function parseDbf(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 33) throw new Error("Invalid DBF header");
  if (![0x03, 0x83].includes(buffer[0])) throw new Error("Unsupported DBF version");
  const count = buffer.readUInt32LE(4), headerLength = buffer.readUInt16LE(8), recordLength = buffer.readUInt16LE(10);
  if (headerLength < 33 || headerLength > buffer.length || (headerLength - 33) % 32 || buffer[headerLength - 1] !== 0x0d) throw new Error("Invalid DBF field header length");
  const dataEnd = headerLength + count * recordLength;
  if (dataEnd > buffer.length || (buffer.length !== dataEnd && !(buffer.length === dataEnd + 1 && buffer[dataEnd] === 0x1a))) throw new Error("Invalid DBF record length");
  const fields = [], names = new Set();
  let offset = 1;
  for (let position = 32; position < headerLength - 1; position += 32) {
    const bytes = buffer.subarray(position, position + 11), end = bytes.indexOf(0);
    const nameBytes = bytes.subarray(0, end === -1 ? bytes.length : end);
    if (nameBytes.some((byte) => byte > 0x7f)) throw new Error("DBF field names must be ASCII");
    const name = nameBytes.toString("ascii").trim().toUpperCase(), width = buffer[position + 16];
    if (!/^[A-Z_][A-Z0-9_]*$/.test(name) || names.has(name) || !width) throw new Error("Invalid or duplicate DBF field");
    const type = String.fromCharCode(buffer[position + 11]);
    if (!["C", "N", "F", "L", "D"].includes(type)) throw new Error("Unsupported DBF field type: " + type);
    if (name === "ADM4_PCODE" && type !== "C") throw new Error("ADM4_PCODE must be a character field");
    names.add(name); fields.push({ name, width, offset }); offset += width;
  }
  if (recordLength !== offset) throw new Error("DBF field widths do not match record length");
  return Array.from({ length: count }, (_, index) => {
    const start = headerLength + index * recordLength, status = buffer[start];
    if (status === 0x2a) return null;
    if (status !== 0x20) throw new Error("Invalid DBF deletion flag");
    const row = {};
    for (const field of fields) {
      const bytes = buffer.subarray(start + field.offset, start + field.offset + field.width);
      if (field.name === "ADM4_PCODE" && bytes.some((byte) => byte > 0x7f)) throw new Error("ADM4_PCODE must be ASCII");
      row[field.name] = utf8.decode(bytes).trimEnd();
    }
    return row;
  });
}

function header(buffer, name) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 100 || buffer.readInt32BE(0) !== 9994 || buffer.readInt32LE(28) !== 1000) throw new Error("Invalid " + name + " header");
  if (buffer.readInt32BE(24) * 2 !== buffer.length) throw new Error(name + " header length does not match file");
  const type = buffer.readInt32LE(32);
  if (![0, 5].includes(type)) throw new Error("Unsupported " + name + " shape type: " + type);
  const bounds = Array.from({ length: 4 }, (_, i) => buffer.readDoubleLE(36 + i * 8));
  if (!bounds.every(Number.isFinite) || bounds[0] > bounds[2] || bounds[1] > bounds[3]) throw new Error("Invalid " + name + " bounds");
  return type;
}

function recordIndex(shp, shx) {
  const type = header(shp, "SHP");
  if (shx != null && (header(shx, "SHX") !== type || (shx.length - 100) % 8)) throw new Error("Invalid SHX type or index length");
  const cached = indexes.get(shp);
  if (cached?.shx === shx) return cached;
  const records = [];
  let offset = 100;
  while (offset < shp.length) {
    if (offset + 8 > shp.length || shp.readInt32BE(offset) !== records.length + 1) throw new Error("Invalid SHP record header");
    const length = shp.readInt32BE(offset + 4) * 2;
    if (length < 4 || offset + 8 + length > shp.length) throw new Error("Invalid SHP record length");
    if (shx != null) {
      const entry = 100 + records.length * 8;
      if (entry + 8 > shx.length || shx.readInt32BE(entry) * 2 !== offset || shx.readInt32BE(entry + 4) * 2 !== length) throw new Error("SHX offset or length does not match SHP");
    }
    records.push({ offset: offset + 8, length }); offset += 8 + length;
  }
  if (shx != null && 100 + records.length * 8 !== shx.length) throw new Error("SHX record count does not match SHP");
  const result = { shx, type, records };
  indexes.set(shp, result);
  return result;
}

function ringArea(ring) {
  const [x, y] = ring[0];
  let twice = 0;
  for (let i = 1; i < ring.length; i++) twice += (ring[i - 1][0] - x) * (ring[i][1] - y) - (ring[i][0] - x) * (ring[i - 1][1] - y);
  return twice / 2;
}

// Return -1 outside, 0 on the boundary, and 1 inside.
function inRing([x, y], ring) {
  let inside = false;
  for (let i = 1; i < ring.length; i++) {
    const [ax, ay] = ring[i - 1], [bx, by] = ring[i];
    if ((x - ax) * (by - ay) === (y - ay) * (bx - ax) && x >= Math.min(ax, bx) && x <= Math.max(ax, bx) && y >= Math.min(ay, by) && y <= Math.max(ay, by)) return 0;
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside ? 1 : -1;
}

function containsHole(outer, hole) {
  if (hole.bounds.some((value, i) => i < 2 ? value < outer.bounds[i] : value > outer.bounds[i])) return false;
  for (let i = 1; i < hole.ring.length; i++) {
    const location = inRing(hole.ring[i - 1], outer.ring);
    if (location) return location > 0;
  }
  for (let i = 1; i < hole.ring.length; i++) {
    const a = hole.ring[i - 1], b = hole.ring[i], location = inRing([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], outer.ring);
    if (location) return location > 0;
  }
  return false;
}

export function readShapefileGeometry(shp, shx, index) {
  const source = recordIndex(shp, shx);
  if (!Number.isInteger(index) || index < 0 || index >= source.records.length) throw new RangeError("SHP record index is outside the file");
  const { offset, length } = source.records[index], type = shp.readInt32LE(offset);
  if (type === 0) {
    if (length !== 4) throw new Error("Invalid Null shape length");
    return null;
  }
  if (type !== 5 || source.type !== 5) throw new Error("Unsupported or mismatched SHP record type: " + type);
  if (length < 44) throw new Error("Truncated Polygon record");
  const bounds = Array.from({ length: 4 }, (_, i) => shp.readDoubleLE(offset + 4 + i * 8));
  const partCount = shp.readInt32LE(offset + 36), pointCount = shp.readInt32LE(offset + 40);
  if (!bounds.every(Number.isFinite) || bounds[0] > bounds[2] || bounds[1] > bounds[3] || partCount < 1 || pointCount < partCount * 4 || length !== 44 + partCount * 4 + pointCount * 16) throw new Error("Invalid Polygon counts, bounds, or length");
  const parts = Array.from({ length: partCount }, (_, i) => shp.readInt32LE(offset + 44 + i * 4));
  if (parts[0] !== 0 || parts.some((start, i) => start < 0 || start >= pointCount || (parts[i + 1] ?? pointCount) - start < 4)) throw new Error("Invalid Polygon part range");
  const pointOffset = offset + 44 + partCount * 4;
  // Source envelopes are rounded metadata; preserve and validate the actual WGS84 vertices.
  const points = Array.from({ length: pointCount }, (_, i) => {
    const x = shp.readDoubleLE(pointOffset + i * 16), y = shp.readDoubleLE(pointOffset + i * 16 + 8);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < -180 || x > 180 || y < -90 || y > 90) throw new Error("Invalid WGS84 Polygon coordinate");
    return [x, y];
  });
  const rings = parts.map((start, i) => {
    const ring = points.slice(start, parts[i + 1] ?? pointCount), first = ring[0], last = ring.at(-1);
    if (first[0] !== last[0] || first[1] !== last[1]) throw new Error("Polygon ring is not closed");
    const area = ringArea(ring);
    if (!Number.isFinite(area) || area === 0) throw new Error("Invalid zero-area Polygon ring");
    const bounds = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, y] of ring) {
      bounds[0] = Math.min(bounds[0], x); bounds[1] = Math.min(bounds[1], y);
      bounds[2] = Math.max(bounds[2], x); bounds[3] = Math.max(bounds[3], y);
    }
    return { ring, area, bounds, coordinates: [ring] };
  });
  const outers = rings.filter((ring) => ring.area < 0);
  for (const hole of rings.filter((ring) => ring.area > 0)) {
    const parent = outers.filter((outer) => containsHole(outer, hole)).sort((a, b) => Math.abs(a.area) - Math.abs(b.area))[0];
    if (!parent) throw new Error("Polygon hole has no containing exterior");
    parent.coordinates.push(hole.ring);
  }
  if (!outers.length) throw new Error("Polygon has no clockwise exterior");
  return outers.length === 1 ? { type: "Polygon", coordinates: outers[0].coordinates } : { type: "MultiPolygon", coordinates: outers.map((outer) => outer.coordinates) };
}
