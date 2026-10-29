import Papa from "papaparse";
import { boundsOf, verticalColumnMesh, type DrawElement } from "@/lib/geometry";

export const RECOMMENDED_TYPE = "Recommended column";
export const RECOMMENDED_COLOR = "#e08a12";
export const RECOMMENDED_OUTLINE = "#7c4a0b";

/** Recommendation plan coordinates are metres. The viewer draws Revit feet. */
const METRES_TO_FEET = 1 / 0.3048;
/** Display size only. The recommendation does not design the column section. */
const MARKER_METRES = 0.3;

export type ColumnRecommendation = {
  projectId: string;
  wallId: string;
  wallLengthM: number;
  slot: string;
  xM: number;
  yM: number;
  alongParam: number;
  lateralM: number;
  probability: number;
  reason: string;
};

export type RecommendationMode = "off" | "show" | "only";

export function parseColumnRecommendations(csvText: string): ColumnRecommendation[] {
  const text = csvText.replace(/^\uFEFF/, "");
  const result = Papa.parse<Record<string, string | undefined>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.replace(/^\uFEFF/, "").trim(),
  });
  const rows: ColumnRecommendation[] = [];
  for (const raw of result.data) {
    const projectId = (raw.project_id ?? "").trim();
    const wallId = (raw.demolished_element_id ?? "").trim();
    const xM = finite(raw.x_m);
    const yM = finite(raw.y_m);
    if (!projectId || !wallId || xM == null || yM == null) continue;
    rows.push({
      projectId,
      wallId,
      wallLengthM: finite(raw.wall_length_m) ?? 0,
      slot: (raw.slot ?? "").trim() || "mid",
      xM,
      yM,
      alongParam: finite(raw.along_param) ?? 0,
      lateralM: finite(raw.lateral_m) ?? 0,
      probability: finite(raw.probability) ?? 0,
      reason: (raw.reason ?? "").trim(),
    });
  }
  return rows;
}

export function recommendationsFor(
  catalog: ColumnRecommendation[],
  documentName: string,
  filename: string,
): ColumnRecommendation[] {
  const ids = [...new Set(catalog.map((row) => row.projectId))];
  if (documentName && documentName !== "Several documents" && ids.includes(documentName)) {
    return catalog.filter((row) => row.projectId === documentName);
  }
  const haystack = `${filename} ${documentName}`;
  const hit = ids.sort((a, b) => b.length - a.length).find((id) => haystack.includes(id));
  if (!hit) return [];
  return catalog.filter((row) => row.projectId === hit);
}

export function buildRecommendedColumns(
  rows: ColumnRecommendation[],
  elements: DrawElement[],
): DrawElement[] {
  const seen = new Map<string, number>();
  const columns: DrawElement[] = [];
  const sizeFeet = MARKER_METRES * METRES_TO_FEET;

  for (const row of rows) {
    const xFeet = row.xM * METRES_TO_FEET;
    const yFeet = row.yM * METRES_TO_FEET;
    const host = findHost(elements, row.wallId);
    const span = columnSpan(host, elements, xFeet, yFeet);
    const positions = verticalColumnMesh(xFeet, yFeet, span.z0, span.z1, sizeFeet);
    if (!positions) continue;

    const key = `${row.wallId}:${row.slot}`;
    const count = seen.get(key) ?? 0;
    seen.set(key, count + 1);
    const id = count === 0 ? `rec-${row.wallId}-${row.slot}` : `rec-${row.wallId}-${row.slot}-${count + 1}`;
    const height = span.z1 - span.z0;
    const slotLabel = slotName(row.slot);
    const bounds = boundsOf(positions);

    columns.push({
      id,
      elementType: RECOMMENDED_TYPE,
      categoryId: "",
      family: "",
      typeName: `${slotLabel} · ${Math.round(row.probability * 100)}%`,
      mark: "",
      levelName: host?.levelName ?? "",
      phaseField: null,
      phaseValue: "",
      demolishedField: null,
      demolishedValue: "",
      structuralField: null,
      structuralValue: "",
      positions,
      color: RECOMMENDED_COLOR,
      opacity: 1,
      metalness: 0.08,
      roughness: 0.42,
      measurements: [
        {
          label: "Height",
          kind: "length",
          value: height,
          source: span.placedOnWall ? "Demolished wall" : "Nearby storey height",
        },
        {
          label: "Marker width",
          kind: "length",
          value: sizeFeet,
          source: "300 mm display size. The recommendation does not size the column.",
        },
      ],
      dimensions: [],
      properties: recommendationProperties(row, span.placedOnWall),
      ...bounds,
      recommendation: {
        projectId: row.projectId,
        wallId: row.wallId,
        slot: row.slot,
        probability: row.probability,
        alongParam: row.alongParam,
        lateralM: row.lateralM,
        wallLengthM: row.wallLengthM,
        reason: row.reason,
        placedOnWall: span.placedOnWall,
      },
    });
  }

  return columns;
}

export function reasonText(reason: string): string {
  if (reason === "no_proposed_wall_or_column_in_handling_range") {
    return "No proposed wall or column in handling range";
  }
  if (!reason) return "Recommended column";
  return reason.replaceAll("_", " ");
}

export function slotName(slot: string): string {
  if (slot === "start") return "Start";
  if (slot === "end") return "End";
  if (slot === "mid") return "Middle";
  return slot;
}

function recommendationProperties(row: ColumnRecommendation, placedOnWall: boolean): DrawElement["properties"] {
  return [
    { key: "Project", value: row.projectId },
    { key: "Demolished wall", value: row.wallId },
    { key: "Slot", value: slotName(row.slot) },
    { key: "Probability", value: `${Math.round(row.probability * 100)}%` },
    { key: "Along wall", value: alongText(row.alongParam) },
    { key: "Lateral offset", value: `${row.lateralM.toFixed(3)} m` },
    { key: "Plan position", value: `${row.xM.toFixed(3)} m, ${row.yM.toFixed(3)} m` },
    { key: "Wall length", value: `${row.wallLengthM.toFixed(3)} m` },
    { key: "Reason", value: reasonText(row.reason) },
    {
      key: "Height source",
      value: placedOnWall
        ? "The column stands on the demolished wall, from its base to its top."
        : "The demolished wall is not drawn in this file, so the height follows a nearby element.",
    },
  ];
}

function alongText(param: number): string {
  const value = param.toFixed(2);
  if (param < 0) return `${value} (before the wall start)`;
  if (param > 1) return `${value} (past the wall end)`;
  return `${value} from the wall start toward the end`;
}

function findHost(elements: DrawElement[], wallId: string): DrawElement | null {
  return elements.find((element) => element.id === wallId || element.id.startsWith(`${wallId}#`)) ?? null;
}

function columnSpan(
  host: DrawElement | null,
  elements: DrawElement[],
  xFeet: number,
  yFeet: number,
): { z0: number; z1: number; placedOnWall: boolean } {
  if (host) {
    const height = host.max[1] - host.min[1];
    if (height >= 0.5) return { z0: host.min[1], z1: host.max[1], placedOnWall: true };
  }

  let best: DrawElement | null = null;
  let bestDistance = Infinity;
  for (const element of elements) {
    const height = element.max[1] - element.min[1];
    if (height < 1) continue;
    const distance = Math.hypot(element.center[0] - xFeet, element.center[2] - -yFeet);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = element;
    }
  }
  if (best && bestDistance < 40) {
    return { z0: best.min[1], z1: best.max[1], placedOnWall: false };
  }
  return { z0: 0, z1: 10, placedOnWall: false };
}

function finite(value: string | undefined): number | null {
  if (value == null || value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
