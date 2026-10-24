import assert from "node:assert/strict";
import test from "node:test";
import { parseDbf, readShapefileGeometry } from "./read-shapefile.mjs";

const square = (x, y, size) => [[x, y], [x, y + size], [x + size, y + size], [x + size, y], [x, y]];
function polygon(rings) {
  const points = rings.flat(), buffer = Buffer.alloc(44 + rings.length * 4 + points.length * 16);
  buffer.writeInt32LE(5);
  const xs = points.map(([x]) => x), ys = points.map(([, y]) => y);
  [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].forEach((value, i) => buffer.writeDoubleLE(value, 4 + i * 8));
  buffer.writeInt32LE(rings.length, 36); buffer.writeInt32LE(points.length, 40);
  let start = 0;
  rings.forEach((ring, i) => { buffer.writeInt32LE(start, 44 + i * 4); start += ring.length; });
  points.forEach(([x, y], i) => { buffer.writeDoubleLE(x, 44 + rings.length * 4 + i * 16); buffer.writeDoubleLE(y, 52 + rings.length * 4 + i * 16); });
  return buffer;
}
function header(length, type = 5) {
  const buffer = Buffer.alloc(100);
  buffer.writeInt32BE(9994); buffer.writeInt32BE(length / 2, 24); buffer.writeInt32LE(1000, 28); buffer.writeInt32LE(type, 32);
  [-180, -90, 180, 90].forEach((value, i) => buffer.writeDoubleLE(value, 36 + i * 8));
  return buffer;
}
function files(records, type = 5) {
  const shp = Buffer.alloc(100 + records.reduce((size, record) => size + record.length + 8, 0)), shx = Buffer.alloc(100 + records.length * 8);
  header(shp.length, type).copy(shp); header(shx.length, type).copy(shx);
  let offset = 100;
  records.forEach((record, i) => {
    shp.writeInt32BE(i + 1, offset); shp.writeInt32BE(record.length / 2, offset + 4); record.copy(shp, offset + 8);
    shx.writeInt32BE(offset / 2, 100 + i * 8); shx.writeInt32BE(record.length / 2, 104 + i * 8);
    offset += record.length + 8;
  });
  return { shp, shx };
}
function dbf(rows, fields = [{ name: "adm4_pcode", width: 12 }, { name: "NAME", width: 20 }]) {
  const headerLength = 33 + fields.length * 32, recordLength = 1 + fields.reduce((sum, field) => sum + field.width, 0);
  const buffer = Buffer.alloc(headerLength + rows.length * recordLength + 1);
  buffer[0] = 3; buffer.writeUInt32LE(rows.length, 4); buffer.writeUInt16LE(headerLength, 8); buffer.writeUInt16LE(recordLength, 10);
  fields.forEach((field, i) => {
    const offset = 32 + i * 32;
    buffer.write(field.name, offset, "ascii"); buffer[offset + 11] = 67; buffer[offset + 16] = field.width;
    buffer.writeUInt32LE(0xffffffff, offset + 12);
  });
  buffer[headerLength - 1] = 0x0d; buffer[buffer.length - 1] = 0x1a;
  rows.forEach((row, i) => {
    let offset = headerLength + i * recordLength;
    buffer[offset++] = row === null ? 0x2a : 0x20;
    fields.forEach((field) => { buffer.fill(0x20, offset, offset + field.width); if (row) buffer.write(row[field.name] || "", offset, field.width, "utf8"); offset += field.width; });
  });
  return buffer;
}

test("Polygon preserves every coordinate, including repeated vertices, with indexed and sequential reads", () => {
  const ring = square(120.000000001, 12.000000001, 0.001); ring.splice(2, 0, [...ring[1]]);
  const { shp, shx } = files([polygon([ring])]);
  assert.deepEqual(readShapefileGeometry(shp, shx, 0), { type: "Polygon", coordinates: [ring] });
  assert.deepEqual(readShapefileGeometry(shp, null, 0), { type: "Polygon", coordinates: [ring] });
});

test("unordered holes attach to their containing exterior and islands remain separate", () => {
  const outer = square(0, 0, 20), hole = square(2, 2, 16).reverse(), island = square(5, 5, 5), islandHole = square(6, 6, 1).reverse();
  const other = square(30, 0, 5), { shp, shx } = files([polygon([islandHole, hole, other, island, outer])]);
  assert.deepEqual(readShapefileGeometry(shp, shx, 0), { type: "MultiPolygon", coordinates: [[other], [island, islandHole], [outer, hole]] });
});

test("rounded record envelopes do not change actual vertices; finite WGS84 coordinates are validated independently", () => {
  const ring = square(120.60873005000008, 18.223549262000063, 0.02), record = polygon([ring]);
  for (const offset of [4, 12]) record.writeBigUInt64LE(record.readBigUInt64LE(offset) + 2n, offset);
  record.writeBigUInt64LE(record.readBigUInt64LE(20) - 8n, 20);
  record.writeBigUInt64LE(record.readBigUInt64LE(28) - 16n, 28);
  const valid = files([record]);
  assert.deepEqual(readShapefileGeometry(valid.shp, valid.shx, 0).coordinates, [ring]);
  for (const invalidRing of [square(180, 0, 1), square(0, 90, 1), square(-181, 0, 1), square(0, -91, 1)]) {
    const invalid = files([polygon([invalidRing])]);
    assert.throws(() => readShapefileGeometry(invalid.shp, invalid.shx, 0), /WGS84/);
  }
});

test("a hole touching its exterior at its first vertex is assigned without losing its points", () => {
  const outer = square(0, 0, 10), hole = [[0, 5], [3, 3], [3, 7], [0, 5]];
  const { shp, shx } = files([polygon([hole, outer])]);
  assert.deepEqual(readShapefileGeometry(shp, shx, 0), { type: "Polygon", coordinates: [outer, hole] });
});

test("Null records preserve indexes; out-of-range requests fail", () => {
  const ring = square(1, 1, 1), { shp, shx } = files([Buffer.alloc(4), polygon([ring])]);
  assert.equal(readShapefileGeometry(shp, shx, 0), null);
  assert.deepEqual(readShapefileGeometry(shp, shx, 1).coordinates, [ring]);
  for (const index of [-1, 2, 0.5, NaN]) assert.throws(() => readShapefileGeometry(shp, shx, index), /index/);
  const nullFile = files([Buffer.alloc(4)], 0);
  assert.equal(readShapefileGeometry(nullFile.shp, nullFile.shx, 0), null);
});

test("DBF preserves uppercase keys, UTF-8 names, leading code zeroes, and deleted row alignment", () => {
  const rows = parseDbf(dbf([{ adm4_pcode: "001234567890", NAME: "Santo Niño" }, null, { adm4_pcode: "000000000001", NAME: "Last" }]));
  assert.deepEqual(rows, [{ ADM4_PCODE: "001234567890", NAME: "Santo Niño" }, null, { ADM4_PCODE: "000000000001", NAME: "Last" }]);
});

test("SHP/SHX headers, full index lengths, offsets and record numbering are validated", () => {
  const mutations = [
    ({ shp }) => shp.writeInt32BE(0, 0),
    ({ shp }) => shp.writeInt32LE(999, 28),
    ({ shp }) => shp.writeInt32BE(50, 24),
    ({ shp }) => shp.writeInt32LE(15, 32),
    ({ shx }) => shx.writeInt32LE(3, 32),
    ({ shx }) => shx.writeInt32BE(51, 100),
    ({ shx }) => shx.writeInt32BE(3, 104),
    ({ shp }) => shp.writeInt32BE(2, 100),
    ({ shp }) => shp.writeInt32BE(1e6, 104)
  ];
  for (const mutate of mutations) {
    const input = files([polygon([square(0, 0, 10)])]); mutate(input);
    assert.throws(() => readShapefileGeometry(input.shp, input.shx, 0));
  }
  const { shp, shx } = files([polygon([square(0, 0, 10)]), Buffer.alloc(4)]);
  const shortIndex = shx.subarray(0, 108); shortIndex.writeInt32BE(54, 24);
  assert.throws(() => readShapefileGeometry(shp, shortIndex, 0), /SHX/);
});

test("invalid polygon record types, counts, parts, coordinates, closure and orphan holes fail", () => {
  const mutations = [
    (record) => record.writeInt32LE(3),
    (record) => record.writeInt32LE(-1, 36),
    (record) => record.writeInt32LE(1e6, 40),
    (record) => record.writeInt32LE(1, 44),
    (record) => record.writeDoubleLE(Infinity, 48),
    (record) => record.writeDoubleLE(1, record.length - 16)
  ];
  for (const mutate of mutations) {
    const record = polygon([square(0, 0, 10)]); mutate(record);
    const { shp, shx } = files([record]); assert.throws(() => readShapefileGeometry(shp, shx, 0));
  }
  for (const rings of [[square(0, 0, 2).reverse()], [square(0, 0, 2), square(5, 5, 1).reverse()], [[[0, 0], [1, 1], [2, 2], [0, 0]]]]) {
    const { shp, shx } = files([polygon(rings)]); assert.throws(() => readShapefileGeometry(shp, shx, 0), /hole|exterior|zero-area/);
  }
  for (const partStart of [-1, 0, 1, 9, 10]) {
    const record = polygon([square(0, 0, 10), square(20, 0, 2)]); record.writeInt32LE(partStart, 48);
    const { shp, shx } = files([record]); assert.throws(() => readShapefileGeometry(shp, shx, 0), /part range/);
  }
  const { shp, shx } = files([Buffer.alloc(8)]);
  assert.throws(() => readShapefileGeometry(shp, shx, 0), /Null shape length/);
});

test("DBF malformed lengths, descriptors, statuses and non-ASCII code bytes fail", () => {
  for (const mutate of [
    (buffer) => buffer.writeUInt32LE(1000, 4),
    (buffer) => buffer.writeUInt16LE(1, 8),
    (buffer) => buffer.writeUInt16LE(1, 10),
    (buffer) => { buffer[96] = 0; },
    (buffer) => { buffer[97] = 0; },
    (buffer) => { buffer[98] = 0xff; },
    (buffer) => { buffer[48] = 0; },
    (buffer) => { buffer[32] = 0xc1; },
    (buffer) => { buffer[43] = 78; }
  ]) {
    const buffer = dbf([{ adm4_pcode: "001234567890", NAME: "Name" }]); mutate(buffer);
    assert.throws(() => parseDbf(buffer));
  }
});
