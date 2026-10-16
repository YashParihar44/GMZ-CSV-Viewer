import { readFileSync } from "node:fs";
import path from "node:path";
import { parseModel } from "../src/lib/geometry";
import { SAMPLES } from "../src/lib/samples";

for (const sample of SAMPLES) {
  const text = readFileSync(path.join(process.cwd(), "public/samples", sample.file), "utf8");
  const model = parseModel(text, sample.file);
  const byType = new Map<string, number>();
  for (const element of model.elements) {
    byType.set(element.elementType, (byType.get(element.elementType) ?? 0) + 1);
  }
  const reasons = new Map<string, number>();
  for (const skip of model.skipped) {
    const key = `${skip.elementType}: ${skip.reason}`;
    reasons.set(key, (reasons.get(key) ?? 0) + 1);
  }
  console.log("\n==", sample.title);
  console.log("rows", model.rowCount, "drawn", model.elements.length, "skipped", model.skipped.length);
  console.log("by type", Object.fromEntries(byType));
  console.log("fallbacks", model.fallbacks);
  console.log("skips", Object.fromEntries(reasons));
  const sampleEl = model.elements.find((element) => element.elementType === "Window") ?? model.elements[0];
  if (sampleEl) {
    console.log(
      "sample",
      sampleEl.elementType,
      sampleEl.id,
      sampleEl.measurements.slice(0, 6).map((item) => `${item.label}=${item.value.toFixed(3)}`),
      "dims",
      sampleEl.dimensions.map((line) => line.label),
      "tris",
      sampleEl.positions.length / 9,
    );
  }
}
