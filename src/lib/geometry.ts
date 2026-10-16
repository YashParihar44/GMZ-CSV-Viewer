import Papa from "papaparse";

export type Vec3 = [number, number, number];

export type Measurement = {
  label: string;
  kind: "length" | "area" | "volume";
  /** Feet, square feet, or cubic feet — the units stored in the CSV. */
  value: number;
  source: string;
};

export type DimensionLine = {
  a: Vec3;
  b: Vec3;
  label: string;
  feet: number;
};

export type Property = { key: string; value: string };

export type ElementStyle = {
  color: string;
  opacity: number;
  metalness: number;
  roughness: number;
};

export type DrawElement = {
  id: string;
  elementType: string;
  categoryId: string;
  family: string;
  typeName: string;
  mark: string;
  levelName: string;
  /** Column that distinguishes existing from proposed, when the file has it. */
  phaseField: string | null;
  /** Raw cell from `phaseField`. Empty when the column is missing or the cell is blank. */
  phaseValue: string;
  /** Yes/no column, when the file has it. */
  structuralField: string | null;
  /** Raw cell from `structuralField`. */
  structuralValue: string;
  positions: Float32Array;
  color: string;
  opacity: number;
  metalness: number;
  roughness: number;
  measurements: Measurement[];
  dimensions: DimensionLine[];
  properties: Property[];
  min: Vec3;
  max: Vec3;
  center: Vec3;
};

export type SkipRecord = {
  elementId: string;
  elementType: string;
  reason: string;
};

export type ParsedModel = {
  filename: string;
  documentName: string;
  rowCount: number;
  elements: DrawElement[];
  skipped: SkipRecord[];
  fallbacks: { note: string; count: number }[];
  /** Header used for existing vs proposed, or null when that column is absent. */
  phaseField: string | null;
  /** Yes/no header used for the structural highlight, or null when that column is absent. */
  structuralField: string | null;
};

/** The Revit phase column present in these exports. */
export const PHASE_FIELD = "Phase Created";

export type PhaseKind = "existing" | "proposed" | "unmarked";

export type PhaseHighlight = "off" | "existing" | "proposed" | "both";

/** Yes/no column present in these exports. 1 is yes. */
export const STRUCTURAL_FIELD = "Structural";
export const STRUCTURAL_YES = "1";
export const STRUCTURAL_COLOR = "#d7263d";

export function isStructuralValue(value: string): boolean {
  return value.trim() === STRUCTURAL_YES;
}

export const PHASE_LOOKS: Record<PhaseKind, { color: string; opacity: number; label: string }> = {
  existing: { color: "#1d6b4a", opacity: 1, label: "Existing" },
  proposed: { color: "#6d28d9", opacity: 1, label: "Proposed" },
  unmarked: { color: "#d5dbe2", opacity: 0.38, label: "Unmarked" },
};

/** Classify a Phase Created cell. Any other value, including New Construction, stays unmarked. */
export function phaseKind(value: string): PhaseKind {
  const normalized = value.trim().toLowerCase();
  if (normalized === "existing") return "existing";
  if (normalized === "proposed") return "proposed";
  return "unmarked";
}

export const GEOMETRY_NOTE = [
  "Coordinates in the file are Revit internal feet, Z up. The view keeps that Z as up and mirrors plan Y so the model stays right-handed.",
  "Walls, floors, and roofs are the Boundary triangle mesh when that column is filled. A wall with no Boundary is a vertical box on the Start–End line: Width is the thickness (centred, which matches location-line 0 in these files) and the height is Unconnected Height, or Area ÷ plan length when the height cell is empty.",
  "Beams and columns run from Start to End. The section is b × d when those cells are filled, otherwise Width × Height. A single recorded side is used for both, so a square hollow section with only d stays square. The section is centred on the axis — y/z justification and z offset are not applied.",
  "Doors and windows sit on Location. Location Z is the sill or threshold, Width and Height are the opening, and Orientation X± or Y± is the facing direction (width runs along the wall). Depth is Thickness, or the host wall’s Width when Host Id matches a wall and Thickness is empty.",
  "Footings use Location, Width, Length, and Z top / Z bottom. Nothing in the export gives a footing rotation, so Width is along X and Length along Y. Area is never turned into a footprint. Rows with no Boundary and no usable line or point are skipped.",
];

export const ELEMENT_STYLES: Record<string, ElementStyle> = {
  Wall: { color: "#d2c0ab", opacity: 1, metalness: 0.02, roughness: 0.92 },
  Floor: { color: "#b9b4ab", opacity: 1, metalness: 0.03, roughness: 0.88 },
  Roof: { color: "#7f8d99", opacity: 1, metalness: 0.06, roughness: 0.78 },
  Window: { color: "#7ec8e3", opacity: 0.42, metalness: 0.12, roughness: 0.12 },
  Door: { color: "#a56b45", opacity: 1, metalness: 0.04, roughness: 0.72 },
  "Structural Framing": { color: "#3e7194", opacity: 1, metalness: 0.55, roughness: 0.38 },
  "Structural Column": { color: "#243f52", opacity: 1, metalness: 0.58, roughness: 0.34 },
  "Structural Foundation": { color: "#6e7364", opacity: 1, metalness: 0.04, roughness: 0.94 },
};

const TYPE_ORDER = [
  "Wall",
  "Floor",
  "Roof",
  "Door",
  "Window",
  "Structural Column",
  "Structural Framing",
  "Structural Foundation",
];

const PINNED_KEYS = [
  "Element ID",
  "Element Type",
  "Phase Created",
  "Phase Demolished",
  "Structural",
  "Category",
  "Family",
  "Type",
  "Family Name",
  "Type Name",
  "Mark",
  "Level",
  "Base Constraint",
  "Top Constraint",
  "Host Id",
  "Location X",
  "Location Y",
  "Location Z",
  "Start X",
  "Start Y",
  "Start Z",
  "End X",
  "End Y",
  "End Z",
  "Z top",
  "Z bottom",
  "Z mid",
  "Width",
  "Height",
  "Length",
  "Thickness",
  "Unconnected Height",
  "Cut Length",
  "System Length",
  "b",
  "d",
  "width b",
  "height h",
  "Orientation",
  "Area",
  "Volume",
  "Base Offset",
  "Top Offset",
  "Location Line",
];

const CATEGORY_NAMES: Record<string, string> = {
  "-2000011": "Walls",
  "-2000014": "Windows",
  "-2000023": "Doors",
  "-2000032": "Floors",
  "-2000035": "Roofs",
  "-2001320": "Structural Framing",
  "-2001330": "Structural Columns",
  "-2001300": "Structural Foundations",
};

const LENGTH_FIELDS: { key: string; label: string }[] = [
  { key: "Width", label: "Width" },
  { key: "Height", label: "Height" },
  { key: "Length", label: "Length" },
  { key: "Thickness", label: "Thickness" },
  { key: "Unconnected Height", label: "Unconnected height" },
  { key: "Cut Length", label: "Cut length" },
  { key: "System Length", label: "System length" },
  { key: "b", label: "Section b" },
  { key: "d", label: "Section d" },
  { key: "width b", label: "Width b" },
  { key: "height h", label: "Height h" },
];

type Row = Record<string, string>;

const MM_150 = 150 / 304.8;
const MM_100 = 100 / 304.8;
const MM_50 = 50 / 304.8;

export function parseModel(csvText: string, filename: string): ParsedModel {
  const text = csvText.replace(/^\uFEFF/, "");
  const result = Papa.parse<Record<string, string | undefined>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.replace(/^\uFEFF/, "").trim(),
  });

  const headers = result.meta.fields ?? [];
  const phaseField = headers.includes(PHASE_FIELD) ? PHASE_FIELD : null;
  const structuralField = headers.includes(STRUCTURAL_FIELD) ? STRUCTURAL_FIELD : null;
  if (
    !["Boundary", "Location X", "Location Y", "Location Z", "Start X", "End X"].some(
      (header) => headers.includes(header),
    )
  ) {
    throw new Error(
      "This CSV has no Boundary, Location, or Start/End columns, so there is nothing to place.",
    );
  }

  if (result.errors.length > 0 && result.data.length === 0) {
    throw new Error(result.errors[0]?.message || "The CSV could not be parsed.");
  }

  const rows: Row[] = [];
  for (const raw of result.data) {
    const row: Row = {};
    let any = false;
    for (const [key, value] of Object.entries(raw)) {
      if (!key) continue;
      const textValue = (value ?? "").trim();
      row[key] = textValue;
      if (textValue) any = true;
    }
    if (any) rows.push(row);
  }

  const wallWidthById = new Map<string, number>();
  for (const row of rows) {
    if (row["Element Type"] !== "Wall") continue;
    const id = row["Element ID"];
    const width = positive(row["Width"]);
    if (id && width) wallWidthById.set(id, width);
  }

  const seenIds = new Map<string, number>();
  const elements: DrawElement[] = [];
  const skipped: SkipRecord[] = [];
  const fallbackCounts = new Map<string, number>();
  const documents = new Set<string>();

  rows.forEach((row, index) => {
    const documentName = row["Document"];
    if (documentName) documents.add(documentName);

    const elementType = row["Element Type"] || "Unknown";
    const rawId = row["Element ID"] || `row-${index + 1}`;
    const seen = seenIds.get(rawId) ?? 0;
    seenIds.set(rawId, seen + 1);
    const id = seen === 0 ? rawId : `${rawId}#${seen + 1}`;

    const placed = placeRow(row, elementType, wallWidthById);
    if ("skip" in placed) {
      skipped.push({ elementId: rawId, elementType, reason: placed.skip });
      return;
    }

    for (const note of placed.fallbacks) {
      fallbackCounts.set(note, (fallbackCounts.get(note) ?? 0) + 1);
    }

    const bounds = boundsOf(placed.positions);
    const style = styleFor(elementType, id);
    elements.push({
      id,
      elementType,
      categoryId: row["Category"] || "",
      family: row["Family"] || row["Family Name"] || "",
      typeName: row["Type"] || row["Type Name"] || "(no type)",
      mark: row["Mark"] || "",
      levelName: row["Base Constraint"] || row["Level"] || "",
      phaseField,
      phaseValue: phaseField ? (row[phaseField] ?? "").trim() : "",
      structuralField,
      structuralValue: structuralField ? (row[structuralField] ?? "").trim() : "",
      positions: placed.positions,
      ...style,
      measurements: fieldMeasurements(row).concat(placed.extraMeasurements),
      dimensions: placed.dimensions,
      properties: propertiesOf(row, placed.boundaryFaces),
      ...bounds,
    });
  });

  const documentName =
    documents.size === 1 ? [...documents][0] : documents.size > 1 ? "Several documents" : "";

  return {
    filename,
    documentName,
    rowCount: rows.length,
    elements,
    skipped,
    fallbacks: [...fallbackCounts.entries()].map(([note, count]) => ({ note, count })),
    phaseField,
    structuralField,
  };
}

export function elementTypeOrder(types: string[]): string[] {
  const known = TYPE_ORDER.filter((type) => types.includes(type));
  const rest = types.filter((type) => !TYPE_ORDER.includes(type)).sort();
  return [...known, ...rest];
}

export function clusterSplit(elements: DrawElement[]): {
  core: DrawElement[];
  distant: DrawElement[];
} {
  if (elements.length < 4) return { core: elements, distant: [] };
  const xs = elements.map((element) => element.center[0]).sort((a, b) => a - b);
  const zs = elements.map((element) => element.center[2]).sort((a, b) => a - b);
  const mx = xs[Math.floor(xs.length / 2)] ?? 0;
  const mz = zs[Math.floor(zs.length / 2)] ?? 0;
  const distances = elements
    .map((element) => Math.hypot(element.center[0] - mx, element.center[2] - mz))
    .sort((a, b) => a - b);
  const p95 = distances[Math.min(distances.length - 1, Math.floor(distances.length * 0.95))] ?? 0;
  const limit = Math.max(p95 * 1.35, 40);
  const core: DrawElement[] = [];
  const distant: DrawElement[] = [];
  for (const element of elements) {
    const distance = Math.hypot(element.center[0] - mx, element.center[2] - mz);
    if (distance <= limit) core.push(element);
    else distant.push(element);
  }
  if (core.length < elements.length * 0.8) return { core: elements, distant: [] };
  return { core, distant };
}

type Placed = {
  positions: Float32Array;
  dimensions: DimensionLine[];
  extraMeasurements: Measurement[];
  fallbacks: string[];
  boundaryFaces: number;
};

type Skipped = { skip: string };

function placeRow(row: Row, elementType: string, wallWidthById: Map<string, number>): Placed | Skipped {
  const faces = parseBoundary(row["Boundary"]);
  if (faces.length > 0) {
    const positions = meshFromRevitFaces(faces);
    if (positions) {
      return {
        positions,
        dimensions: meshDimensions(row, faces),
        extraMeasurements: [],
        fallbacks: [],
        boundaryFaces: faces.length,
      };
    }
  }

  if (elementType === "Wall") {
    const wall = placeWall(row);
    if (wall) return wall;
    return {
      skip: faces.length
        ? "Boundary did not contain a usable triangle, and the wall line has no height."
        : wallSkipReason(row),
    };
  }

  if (elementType === "Door" || elementType === "Window") {
    const opening = placeOpening(row, elementType, wallWidthById);
    if (opening) return opening;
    return { skip: openingSkipReason(row) };
  }

  if (elementType === "Structural Foundation") {
    const footing = placeFooting(row);
    if (footing) return footing;
    return { skip: "Foundation is missing Location, Width, Length, or Z top / Z bottom." };
  }

  const linear = placeMember(row, elementType);
  if (linear) return linear;

  if (hasPoint(row, "Location X", "Location Y", "Location Z")) {
    return {
      skip: `${elementType} has a location point but no size that places a solid.`,
    };
  }
  if (hasLine(row)) {
    return { skip: `${elementType} has a Start–End line but no section size or length.` };
  }
  return {
    skip: "No Boundary mesh, and no Start/End line or Location point.",
  };
}

function placeWall(row: Row): Placed | null {
  const line = lineOf(row);
  if (!line) return null;
  const plan = Math.hypot(line.ex - line.sx, line.ey - line.sy);
  if (plan < 0.02) return null;

  let height = positive(row["Unconnected Height"]);
  let heightSource = "Unconnected Height";
  if (height == null) {
    const area = positive(row["Area"]);
    const length = positive(row["Length"]) ?? plan;
    if (area && length > 0.02) {
      height = area / length;
      heightSource = "Area ÷ plan length (Unconnected Height empty)";
    }
  }
  if (height == null) return null;

  const fallbacks: string[] = [];
  let width = positive(row["Width"]);
  if (width == null) {
    width = MM_150;
    fallbacks.push("Wall thickness assumed 150 mm because Width was empty");
  }

  const baseOffset = finite(row["Base Offset"]) ?? 0;
  const base = Math.min(line.sz, line.ez) + baseOffset;
  const tangent = unit([line.ex - line.sx, line.ey - line.sy, line.ez - line.sz]);
  const side = unit(cross(tangent ?? [1, 0, 0], [0, 0, 1])) ?? [0, 1, 0];
  const up = unit(cross(side, tangent ?? [1, 0, 0])) ?? [0, 0, 1];
  const length = Math.hypot(line.ex - line.sx, line.ey - line.sy, line.ez - line.sz);
  const center: Vec3 = [(line.sx + line.ex) / 2, (line.sy + line.ey) / 2, base + height / 2];
  const positions = boxPositions(center, tangent ?? [1, 0, 0], side, up, length / 2, width / 2, height / 2);
  if (!positions) return null;

  const mid: Vec3 = [(line.sx + line.ex) / 2, (line.sy + line.ey) / 2, base];
  const dimensions: DimensionLine[] = [
    dim(
      [line.sx, line.sy, base + height + 1.1],
      [line.ex, line.ey, base + height + 1.1],
      "Length",
      length,
    ),
    dim(
      add(add([line.sx, line.sy, base], scale(side, width / 2 + 1.1)), [0, 0, 0]),
      add([line.sx, line.sy, base + height], scale(side, width / 2 + 1.1)),
      "Height",
      height,
    ),
    dim(
      add(mid, scale(side, -width / 2)),
      add(mid, scale(side, width / 2)),
      "Width",
      width,
    ),
  ];

  const extra: Measurement[] = [];
  if (!positive(row["Width"])) {
    extra.push({ label: "Drawn width", kind: "length", value: width, source: "assumed 150 mm — Width empty" });
  }
  if (!positive(row["Unconnected Height"])) {
    extra.push({ label: "Drawn height", kind: "length", value: height, source: heightSource });
  }
  if (!positive(row["Length"])) {
    extra.push({ label: "Drawn length", kind: "length", value: length, source: "Start–End distance" });
  }

  return { positions, dimensions, extraMeasurements: extra, fallbacks, boundaryFaces: 0 };
}

function wallSkipReason(row: Row): string {
  if (!hasLine(row)) return "Wall has no Boundary and no Start/End line.";
  const line = lineOf(row);
  if (!line || Math.hypot(line.ex - line.sx, line.ey - line.sy) < 0.02) {
    return "Wall Start–End line has no plan length.";
  }
  return "Wall has a Start–End line but no Unconnected Height or Area to derive a height.";
}

function placeOpening(
  row: Row,
  elementType: string,
  wallWidthById: Map<string, number>,
): Placed | null {
  const lx = finite(row["Location X"]);
  const ly = finite(row["Location Y"]);
  const lz = finite(row["Location Z"]);
  const width = positive(row["Width"]);
  const height = positive(row["Height"]);
  if (lx == null || ly == null || lz == null || width == null || height == null) return null;

  const orient = (row["Orientation"] || "").toUpperCase();
  let thickAxis: Vec3 = [0, 1, 0];
  let widthAxis: Vec3 = [1, 0, 0];
  if (orient.startsWith("X")) {
    thickAxis = [orient.includes("-") ? -1 : 1, 0, 0];
    widthAxis = [0, 1, 0];
  } else if (orient.startsWith("Y")) {
    thickAxis = [0, orient.includes("-") ? -1 : 1, 0];
    widthAxis = [1, 0, 0];
  }

  const fallbacks: string[] = [];
  const extra: Measurement[] = [];
  let depth = positive(row["Thickness"]);
  let depthSource = "Thickness";
  if (depth == null) {
    const host = wallWidthById.get(row["Host Id"] || "");
    if (host) {
      depth = host;
      depthSource = "host wall Width (Thickness empty)";
      fallbacks.push("Opening depth taken from the host wall Width because Thickness was empty");
    } else {
      depth = elementType === "Door" ? MM_50 : MM_100;
      depthSource =
        elementType === "Door"
          ? "assumed 50 mm — Thickness and host Width empty"
          : "assumed 100 mm — Thickness and host Width empty";
      fallbacks.push(
        elementType === "Door"
          ? "Door depth assumed 50 mm because Thickness and host Width were empty"
          : "Window depth assumed 100 mm because Thickness and host Width were empty",
      );
    }
    extra.push({ label: "Drawn depth", kind: "length", value: depth, source: depthSource });
  }

  const center: Vec3 = [lx, ly, lz + height / 2];
  const positions = boxPositions(center, widthAxis, thickAxis, [0, 0, 1], width / 2, depth / 2, height / 2);
  if (!positions) return null;

  const top = lz + height;
  const dimensions = [
    dim(
      add([lx, ly, top + 0.7], scale(widthAxis, -width / 2)),
      add([lx, ly, top + 0.7], scale(widthAxis, width / 2)),
      "Width",
      width,
    ),
    dim(
      add([lx, ly, lz], scale(widthAxis, width / 2 + 0.7)),
      add([lx, ly, top], scale(widthAxis, width / 2 + 0.7)),
      "Height",
      height,
    ),
    dim(
      add([lx, ly, lz], scale(thickAxis, -depth / 2)),
      add([lx, ly, lz], scale(thickAxis, depth / 2)),
      depthSource === "Thickness" ? "Thickness" : "Depth",
      depth,
    ),
  ];

  return { positions, dimensions, extraMeasurements: extra, fallbacks, boundaryFaces: 0 };
}

function openingSkipReason(row: Row): string {
  if (!hasPoint(row, "Location X", "Location Y", "Location Z")) {
    return "Opening has no Location point and no Boundary.";
  }
  if (!positive(row["Width"]) || !positive(row["Height"])) {
    return "Opening has a Location but Width or Height is empty.";
  }
  return "Opening could not be placed.";
}

function placeFooting(row: Row): Placed | null {
  const lx = finite(row["Location X"]);
  const ly = finite(row["Location Y"]);
  const width = positive(row["Width"]);
  const length = positive(row["Length"]);
  const top = finite(row["Z top"]);
  const bottom = finite(row["Z bottom"]);
  if (lx == null || ly == null || width == null || length == null || top == null || bottom == null) {
    return null;
  }
  const height = Math.abs(top - bottom);
  if (height < 0.02) return null;
  const z0 = Math.min(top, bottom);
  const center: Vec3 = [lx, ly, z0 + height / 2];
  const positions = boxPositions(center, [1, 0, 0], [0, 1, 0], [0, 0, 1], width / 2, length / 2, height / 2);
  if (!positions) return null;
  const dimensions = [
    dim([lx - width / 2, ly - length / 2 - 0.8, top + 0.6], [lx + width / 2, ly - length / 2 - 0.8, top + 0.6], "Width", width),
    dim([lx + width / 2 + 0.8, ly - length / 2, top + 0.6], [lx + width / 2 + 0.8, ly + length / 2, top + 0.6], "Length", length),
    dim([lx - width / 2 - 0.8, ly - length / 2, z0], [lx - width / 2 - 0.8, ly - length / 2, z0 + height], "Height", height),
  ];
  const extra: Measurement[] = [
    { label: "Drawn height", kind: "length", value: height, source: "Z top − Z bottom" },
  ];
  return { positions, dimensions, extraMeasurements: extra, fallbacks: [], boundaryFaces: 0 };
}

function placeMember(row: Row, elementType: string): Placed | null {
  const line = lineOf(row);
  if (!line) return null;
  const delta: Vec3 = [line.ex - line.sx, line.ey - line.sy, line.ez - line.sz];
  const length = Math.hypot(delta[0], delta[1], delta[2]);
  if (length < 0.02) return null;
  const axis = unit(delta);
  if (!axis) return null;

  const section = sectionSize(row);
  const side = horizontalPerp(axis);
  const depthAxis = unit(cross(side, axis)) ?? [0, 1, 0];
  const center: Vec3 = [(line.sx + line.ex) / 2, (line.sy + line.ey) / 2, (line.sz + line.ez) / 2];
  const positions = boxPositions(
    center,
    axis,
    side,
    depthAxis,
    length / 2,
    section.width / 2,
    section.depth / 2,
  );
  if (!positions) return null;

  const end: Vec3 = [line.ex, line.ey, line.ez];
  const dimensions = [
    dim(
      add(add([line.sx, line.sy, line.sz], scale(side, section.width / 2 + 0.7)), scale(depthAxis, section.depth / 2)),
      add(add(end, scale(side, section.width / 2 + 0.7)), scale(depthAxis, section.depth / 2)),
      "Length",
      length,
    ),
    dim(
      add(add(end, scale(axis, 0.55)), scale(side, -section.width / 2)),
      add(add(end, scale(axis, 0.55)), scale(side, section.width / 2)),
      section.widthLabel,
      section.width,
    ),
    dim(
      add(add(end, scale(axis, 0.55)), scale(depthAxis, -section.depth / 2)),
      add(add(end, scale(axis, 0.55)), scale(depthAxis, section.depth / 2)),
      section.depthLabel,
      section.depth,
    ),
  ];

  const extra: Measurement[] = [
    { label: "Drawn length", kind: "length", value: length, source: "Start–End distance" },
  ];
  if (section.fallback) {
    extra.push({
      label: "Drawn section",
      kind: "length",
      value: section.width,
      source: section.source,
    });
  }

  if (section.fallback && elementType !== "Structural Column" && elementType !== "Structural Framing") {
    return null;
  }

  return {
    positions,
    dimensions,
    extraMeasurements: extra,
    fallbacks: section.fallback ? [section.fallback] : [],
    boundaryFaces: 0,
  };
}

function sectionSize(row: Row): {
  width: number;
  depth: number;
  widthLabel: string;
  depthLabel: string;
  source: string;
  fallback: string | null;
} {
  const b = positive(row["b"]) ?? positive(row["width b"]);
  const d = positive(row["d"]) ?? positive(row["height h"]);
  const width = positive(row["Width"]);
  const height = positive(row["Height"]);

  if (b != null && d != null) {
    return { width: b, depth: d, widthLabel: "b", depthLabel: "d", source: "b × d", fallback: null };
  }
  if (b != null) {
    return { width: b, depth: b, widthLabel: "b", depthLabel: "b", source: "b (square)", fallback: null };
  }
  if (d != null && width == null && height == null) {
    return { width: d, depth: d, widthLabel: "d", depthLabel: "d", source: "d (square)", fallback: null };
  }
  if (width != null && height != null) {
    return {
      width,
      depth: height,
      widthLabel: "Width",
      depthLabel: "Height",
      source: "Width × Height",
      fallback: null,
    };
  }
  if (width != null) {
    return { width, depth: width, widthLabel: "Width", depthLabel: "Width", source: "Width (square)", fallback: null };
  }
  if (d != null) {
    return { width: d, depth: d, widthLabel: "d", depthLabel: "d", source: "d (square)", fallback: null };
  }
  return {
    width: MM_100,
    depth: MM_100,
    widthLabel: "Section",
    depthLabel: "Section",
    source: "assumed 100 mm square — no b, d, Width, or Height",
    fallback: "Section assumed 100 mm square because b, d, Width, and Height were empty",
  };
}

function meshDimensions(row: Row, faces: Vec3[][]): DimensionLine[] {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const face of faces) {
    for (const point of face) {
      minX = Math.min(minX, point[0]);
      minY = Math.min(minY, point[1]);
      minZ = Math.min(minZ, point[2]);
      maxX = Math.max(maxX, point[0]);
      maxY = Math.max(maxY, point[1]);
      maxZ = Math.max(maxZ, point[2]);
    }
  }
  const lines: DimensionLine[] = [];
  const line = lineOf(row);
  const width = positive(row["Width"]);
  const thickness = positive(row["Thickness"]);
  const zSpan = maxZ - minZ;

  if (line && Math.hypot(line.ex - line.sx, line.ey - line.sy) > 0.05) {
    const length = Math.hypot(line.ex - line.sx, line.ey - line.sy, line.ez - line.sz);
    lines.push(
      dim([line.sx, line.sy, maxZ + 1.15], [line.ex, line.ey, maxZ + 1.15], "Length", length),
    );
    const side = unit([-(line.ey - line.sy), line.ex - line.sx, 0]);
    if (side && width) {
      const mid: Vec3 = [(line.sx + line.ex) / 2, (line.sy + line.ey) / 2, minZ];
      const along = unit([line.ex - line.sx, line.ey - line.sy, 0]);
      const at = along ? add(mid, scale(along, 0.15)) : mid;
      lines.push(dim(add(at, scale(side, -width / 2)), add(at, scale(side, width / 2)), "Width", width));
    }
    const heightOffset = side ? scale(side, (width ?? 0.5) / 2 + 1) : ([1, 0, 0] as Vec3);
    lines.push(
      dim(
        add([line.sx, line.sy, minZ], heightOffset),
        add([line.sx, line.sy, maxZ], heightOffset),
        "Height",
        zSpan,
      ),
    );
    return lines;
  }

  const lift = 0.8;
  if (maxX - minX > 0.05) {
    lines.push(dim([minX, maxY + 1.2, maxZ + lift], [maxX, maxY + 1.2, maxZ + lift], "Extent X", maxX - minX));
  }
  if (maxY - minY > 0.05) {
    lines.push(dim([maxX + 1.2, minY, maxZ + lift], [maxX + 1.2, maxY, maxZ + lift], "Extent Y", maxY - minY));
  }
  if (zSpan > 0.02) {
    const label = thickness && Math.abs(zSpan - thickness) / thickness < 0.25 ? "Thickness" : "Height";
    lines.push(dim([minX - 1.1, minY, minZ], [minX - 1.1, minY, maxZ], label, zSpan));
  }
  return lines;
}

function fieldMeasurements(row: Row): Measurement[] {
  const measurements: Measurement[] = [];
  const seen = new Set<string>();
  for (const field of LENGTH_FIELDS) {
    if (field.key === "width b" && positive(row["b"]) != null) continue;
    if (field.key === "height h" && positive(row["d"]) != null) continue;
    const value = positive(row[field.key]);
    if (value == null) continue;
    const signature = `${field.label}:${value.toFixed(4)}`;
    if (seen.has(signature)) continue;
    seen.add(signature);
    measurements.push({ label: field.label, kind: "length", value, source: field.key });
  }
  const area = positive(row["Area"]);
  if (area != null) measurements.push({ label: "Area", kind: "area", value: area, source: "Area" });
  const volume = positive(row["Volume"]);
  if (volume != null) measurements.push({ label: "Volume", kind: "volume", value: volume, source: "Volume" });
  return measurements;
}

function propertiesOf(row: Row, boundaryFaces: number): Property[] {
  const props: Property[] = [];
  const used = new Set<string>();
  const push = (key: string) => {
    if (used.has(key)) return;
    const raw = row[key];
    if (!raw) return;
    used.add(key);
    if (key === "Boundary") return;
    let value = raw.length > 180 ? `${raw.slice(0, 160)}… (${raw.length} characters)` : raw;
    if (key === "Category" && CATEGORY_NAMES[raw]) value = `${CATEGORY_NAMES[raw]} (${raw})`;
    props.push({ key, value });
  };
  for (const key of PINNED_KEYS) push(key);
  if (boundaryFaces > 0) props.push({ key: "Boundary", value: `${boundaryFaces} triangular faces` });
  const rest = Object.keys(row).filter((key) => key && !used.has(key) && key !== "Boundary").sort();
  for (const key of rest) push(key);
  return props;
}

function styleFor(elementType: string, id: string): ElementStyle {
  const base = ELEMENT_STYLES[elementType] ?? {
    color: "#c4b5a0",
    opacity: 1,
    metalness: 0.04,
    roughness: 0.8,
  };
  return { ...base, color: shade(base.color, (hash(id) % 13) - 6) };
}

function shade(hex: string, steps: number): string {
  const amount = steps * 3;
  const n = Number.parseInt(hex.slice(1), 16);
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((channel) =>
    Math.max(0, Math.min(255, channel + amount)),
  );
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function parseBoundary(raw: string | undefined): Vec3[][] {
  const source = (raw ?? "").trim();
  if (!source) return [];
  const faces: Vec3[][] = [];
  for (const chunk of source.split("||")) {
    const face = chunk.trim();
    if (!face) continue;
    const points: Vec3[] = [];
    let ok = true;
    for (const part of face.split("|")) {
      const token = part.trim();
      if (!token) continue;
      const bits = token.split(",");
      if (bits.length < 3) {
        ok = false;
        break;
      }
      const x = Number(bits[0]);
      const y = Number(bits[1]);
      const z = Number(bits[2]);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        ok = false;
        break;
      }
      points.push([x, y, z]);
    }
    if (ok && points.length >= 3) faces.push(points);
  }
  return faces;
}

function meshFromRevitFaces(faces: Vec3[][]): Float32Array | null {
  const buffer: number[] = [];
  for (const face of faces) {
    const points = face.map((point) => toThree(point));
    for (let i = 1; i < points.length - 1; i += 1) {
      pushTriangle(buffer, points[0], points[i], points[i + 1]);
    }
  }
  if (buffer.length < 9) return null;
  return new Float32Array(buffer);
}

function boxPositions(
  center: Vec3,
  axisU: Vec3,
  axisV: Vec3,
  axisW: Vec3,
  hu: number,
  hv: number,
  hw: number,
): Float32Array | null {
  if (hu < 1e-4 || hv < 1e-4 || hw < 1e-4) return null;
  const corners: Vec3[] = [];
  for (const iz of [-1, 1]) {
    for (const iy of [-1, 1]) {
      for (const ix of [-1, 1]) {
        corners.push(
          toThree(
            add(
              center,
              add(add(scale(axisU, ix * hu), scale(axisV, iy * hv)), scale(axisW, iz * hw)),
            ),
          ),
        );
      }
    }
  }
  // Corner order: ix fastest, then iy, then iz. Index = (ix>0) + 2*(iy>0) + 4*(iz>0)
  // Built as nested -1 then +1, so index 0 is all -1.
  const quads: [number, number, number, number][] = [
    [0, 1, 3, 2],
    [4, 6, 7, 5],
    [0, 2, 6, 4],
    [1, 5, 7, 3],
    [0, 4, 5, 1],
    [2, 3, 7, 6],
  ];
  const buffer: number[] = [];
  for (const [a, b, c, d] of quads) {
    pushTriangle(buffer, corners[a], corners[b], corners[c]);
    pushTriangle(buffer, corners[a], corners[c], corners[d]);
  }
  if (buffer.length < 9) return null;
  return new Float32Array(buffer);
}

function pushTriangle(buffer: number[], a: Vec3, b: Vec3, c: Vec3) {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const abz = b[2] - a[2];
  const acx = c[0] - a[0];
  const acy = c[1] - a[1];
  const acz = c[2] - a[2];
  const cx = aby * acz - abz * acy;
  const cy = abz * acx - abx * acz;
  const cz = abx * acy - aby * acx;
  if (cx * cx + cy * cy + cz * cz < 1e-12) return;
  buffer.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
}

function boundsOf(positions: Float32Array): { min: Vec3; max: Vec3; center: Vec3 } {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
    center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2],
  };
}

function toThree(point: Vec3): Vec3 {
  return [point[0], point[2], -point[1]];
}

function dim(a: Vec3, b: Vec3, label: string, feet: number): DimensionLine {
  return { a: toThree(a), b: toThree(b), label, feet };
}

function finite(value: string | undefined): number | null {
  if (!value) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positive(value: string | undefined): number | null {
  const number = finite(value);
  if (number == null || number <= 0) return null;
  return number;
}

function lineOf(row: Row): { sx: number; sy: number; sz: number; ex: number; ey: number; ez: number } | null {
  const sx = finite(row["Start X"]);
  const sy = finite(row["Start Y"]);
  const sz = finite(row["Start Z"]);
  const ex = finite(row["End X"]);
  const ey = finite(row["End Y"]);
  const ez = finite(row["End Z"]);
  if (sx == null || sy == null || sz == null || ex == null || ey == null || ez == null) return null;
  return { sx, sy, sz, ex, ey, ez };
}

function hasLine(row: Row): boolean {
  return lineOf(row) != null;
}

function hasPoint(row: Row, x: string, y: string, z: string): boolean {
  return finite(row[x]) != null && finite(row[y]) != null && finite(row[z]) != null;
}

function unit(vector: Vec3): Vec3 | null {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  if (length < 1e-8) return null;
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale(vector: Vec3, factor: number): Vec3 {
  return [vector[0] * factor, vector[1] * factor, vector[2] * factor];
}

function horizontalPerp(axis: Vec3): Vec3 {
  const side = unit(cross(axis, [0, 0, 1]));
  if (side) return side;
  return [1, 0, 0];
}
