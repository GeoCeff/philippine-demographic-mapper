import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const context = vm.createContext({
  Intl,
  document: {
    createElementNS(_namespace, tag) {
      return {
        tag,
        attributes: {},
        children: [],
        setAttribute(key, value) { this.attributes[key] = value; },
        appendChild(child) { this.children.push(child); }
      };
    }
  }
});
for (const file of ["src/utils.js", "src/render-utils.js"]) {
  vm.runInContext(await readFile(file, "utf8"), context, { filename: file });
}
const { labelPointForFeature, formatFeatureLabel, createFeatureLabel } = context;
const ring = (coordinates) => coordinates.map(([x, y]) => ({ x, y }));
const square = (x, y, size) => ring([[x, y], [x + size, y], [x + size, y + size], [x, y + size]]);

function insideRing(point, points) {
  let inside = false;
  points.forEach((a, index) => {
    const b = points[(index + 1) % points.length];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < a.x + (point.y - a.y) * (b.x - a.x) / (b.y - a.y)) inside = !inside;
  });
  return inside;
}

const concave = ring([[0, 0], [10, 0], [10, 2], [2, 2], [2, 8], [10, 8], [10, 10], [0, 10]]);
assert(!insideRing({ x: 5, y: 5 }, concave), "bounding-box center is offshore in this concave example");
const concavePoint = labelPointForFeature({ polygons: [concave] });
assert(insideRing(concavePoint, concave), "concave-island anchor must stay on land");

const islandPoint = labelPointForFeature({ polygonGroups: [[square(40, 0, 2)], [concave]] });
assert(insideRing(islandPoint, concave), "choose the largest island instead of the first island");
assert.equal(islandPoint.area, 52);

const outer = square(0, 0, 10);
const hole = square(3, 3, 4);
const donutPoint = labelPointForFeature({ polygonGroups: [[outer, hole]] });
assert(insideRing(donutPoint, outer), "anchor must be inside the exterior ring");
assert(!insideRing(donutPoint, hole), "anchor must not be inside a lake/hole");
assert.equal(donutPoint.area, 84);
const reversedPoint = labelPointForFeature({ polygonGroups: [[[...outer].reverse(), [...hole].reverse()]] });
assert(insideRing(reversedPoint, outer) && !insideRing(reversedPoint, hole), "ring winding must not change interior placement");

const netAreaPoint = labelPointForFeature({ polygonGroups: [[outer, square(0.5, 0.5, 9)], [square(20, 0, 5)]] });
assert(insideRing(netAreaPoint, square(20, 0, 5)), "largest polygon must be chosen by land area after holes");
assert.equal(netAreaPoint.area, 25);
assert.equal(labelPointForFeature({ polygons: [] }), null);
assert.equal(labelPointForFeature({ polygons: [ring([[0, 0], [1, 0], [2, 0]])] }), null);
assert.equal(labelPointForFeature({ polygons: [ring([[0, 0], [NaN, 0], [1, 1]])] }), null);

const labelFeature = { name: "Cebu City", polygons: [outer] };
assert.deepEqual(Array.from(formatFeatureLabel(labelFeature, 0)), ["Cebu City", "0"], "explicit zero is a statistic");
assert.deepEqual(Array.from(formatFeatureLabel(labelFeature, NaN)), ["Cebu City"], "missing values must not become NaN text");
assert.deepEqual(Array.from(formatFeatureLabel(labelFeature, 1234.5, { customLabel: "  Growth < 5%  " })), ["Cebu City", "1,234.5", "Growth < 5%"]);
assert.deepEqual(Array.from(formatFeatureLabel(labelFeature, 7, { showName: false, showValue: false, customLabel: "Target area" })), ["Target area"]);
const element = createFeatureLabel(labelFeature, 12, { point: { x: 2, y: 4 }, fontSize: 8, customLabel: "<script>plain CSV text</script>" });
assert.equal(element.tag, "text");
assert.equal(element.attributes.x, "2");
assert.equal(element.attributes.y, "4");
assert.equal(element.attributes["paint-order"], "stroke fill", "text needs its export-safe contrast halo");
assert.equal(element.attributes["pointer-events"], "none", "labels must not block geography interactions");
assert.deepEqual(element.children.map((child) => child.textContent), ["Cebu City", "12", "<script>plain CSV text</script>"], "custom text stays textContent rather than markup");
assert.equal(createFeatureLabel(labelFeature, NaN, { showName: false }), null);
assert.equal(createFeatureLabel({ name: "No geometry", polygons: [] }, 12), null);

console.log("Checked interior map labels for concave islands, multipolygons, holes, and readable SVG text");
