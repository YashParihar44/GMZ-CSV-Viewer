import Papa from "papaparse";

/** Colours match the plan drawing so the 3D overlay can be checked against it. */
export const GRAPH_RELATIONS = [
  { id: "spatial_proximity", label: "Proximity", color: "#9aa3ab", defaultOn: false },
  { id: "plan_alignment_z_unknown", label: "Plan alignment", color: "#F58518", defaultOn: true },
  { id: "host_candidate", label: "Host candidate", color: "#9e9e9e", defaultOn: true },
  { id: "vertical_interface", label: "Vertical", color: "#54A24B", defaultOn: true },
  { id: "centerline_connection", label: "Centerline", color: "#4C78A8", defaultOn: true },
  { id: "replacement_candidate", label: "Replacement", color: "#E45756", defaultOn: true },
  { id: "hosted_in", label: "Hosted in", color: "#222222", defaultOn: true },
] as const;

const TYPE_ORDER = ["Wall", "Framing", "Column", "Foundation", "Floor", "Roof", "Door", "Window"];

const INCLUDE_REASONS: Record<string, string> = {
  seed_demolished: "Included as a demolished seed",
  seed_proposed: "Included as a proposed seed",
  seed_approved_structure: "Included as approved structure",
  connected_interface: "Included because it meets a seed",
  hosted_opening: "Included as an opening in a selected wall",
  demolished_opening_near_wall: "Included as a demolished opening near a wall",
};

export type GraphNode = {
  projectId: string;
  elementId: string;
  elementType: string;
  phaseRole: string;
  includeReason: string;
  memberKind: string;
};

export type GraphEdge = {
  relation: string;
  rule: string;
  source: string;
  srcId: string;
  dstId: string;
  srcType: string;
  dstType: string;
  confidence: number;
  distanceM: number;
  verticalGapM: number | null;
};

export type ProjectGraph = {
  projectId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  nodeById: Map<string, GraphNode>;
  edgesByElement: Map<string, GraphEdge[]>;
};

export type GraphCatalog = {
  projects: Map<string, ProjectGraph>;
};

export type PlacedNode = {
  graphId: string;
  drawnId: string;
  position: [number, number, number];
  color: string;
  elementType: string;
  typeLabel: string;
  phaseRole: string;
  includeReason: string;
};

export type PlacedEdge = {
  relation: string;
  srcDrawnId: string;
  dstDrawnId: string;
  a: [number, number, number];
  b: [number, number, number];
};

export type GraphPlacement = {
  nodes: PlacedNode[];
  edges: PlacedEdge[];
  relationCounts: Map<string, number>;
  placedByGraphId: Map<string, { drawnId: string; onScreen: boolean }>;
  nodeCount: number;
  onScreenCount: number;
  hiddenCount: number;
  missingCount: number;
};

export type GraphLink = {
  relation: string;
  label: string;
  color: string;
  otherId: string;
  otherDrawnId: string | null;
  otherType: string;
  confidence: number;
  distanceM: number;
  verticalGapM: number | null;
  source: string;
  rule: string;
  onScreen: boolean;
};

export type GraphMembership = {
  inGraph: boolean;
  phaseRole: string;
  includeReason: string;
  links: GraphLink[];
};

type Placeable = { id: string; center: [number, number, number] };

export function parseGraphTables(nodesCsv: string, edgesCsv: string): GraphCatalog {
  const nodes = new Map<string, GraphNode[]>();
  for (const raw of parseRows(nodesCsv)) {
    const projectId = cell(raw, "project_id");
    const elementId = cell(raw, "element_id");
    if (!projectId || !elementId) continue;
    const list = nodes.get(projectId) ?? [];
    list.push({
      projectId,
      elementId,
      elementType: cell(raw, "element_type"),
      phaseRole: cell(raw, "phase_role"),
      includeReason: cell(raw, "include_reason"),
      memberKind: cell(raw, "member_kind"),
    });
    nodes.set(projectId, list);
  }

  const edges = new Map<string, GraphEdge[]>();
  for (const raw of parseRows(edgesCsv)) {
    const projectId = cell(raw, "project_id");
    const srcId = cell(raw, "src_element_id");
    const dstId = cell(raw, "dst_element_id");
    const relation = cell(raw, "relation");
    if (!projectId || !srcId || !dstId || !relation || srcId === dstId) continue;
    const list = edges.get(projectId) ?? [];
    list.push({
      relation,
      rule: cell(raw, "rule"),
      source: cell(raw, "source"),
      srcId,
      dstId,
      srcType: cell(raw, "src_element_type"),
      dstType: cell(raw, "dst_element_type"),
      confidence: finite(raw.confidence) ?? 0,
      distanceM: finite(raw.distance_m) ?? 0,
      verticalGapM: finite(raw.vertical_gap_m),
    });
    edges.set(projectId, list);
  }

  const projects = new Map<string, ProjectGraph>();
  for (const [projectId, projectNodes] of nodes) {
    const nodeById = new Map<string, GraphNode>();
    for (const node of projectNodes) nodeById.set(node.elementId, node);
    const projectEdges = edges.get(projectId) ?? [];
    const edgesByElement = new Map<string, GraphEdge[]>();
    for (const edge of projectEdges) {
      pushEdge(edgesByElement, edge.srcId, edge);
      pushEdge(edgesByElement, edge.dstId, edge);
    }
    projects.set(projectId, { projectId, nodes: projectNodes, edges: projectEdges, nodeById, edgesByElement });
  }
  return { projects };
}

export function projectFor(catalog: GraphCatalog, documentName: string, filename: string): ProjectGraph | null {
  const ids = [...catalog.projects.keys()];
  const byLength = [...ids].sort((a, b) => b.length - a.length);
  const inFile = byLength.find((id) => filename.includes(id));
  if (inFile) return catalog.projects.get(inFile) ?? null;
  if (documentName && documentName !== "Several documents") {
    if (catalog.projects.has(documentName)) return catalog.projects.get(documentName) ?? null;
    const inDocument = byLength.find((id) => documentName.includes(id));
    if (inDocument) return catalog.projects.get(inDocument) ?? null;
    const prefixed = ids.filter(
      (id) => id.startsWith(documentName) && (id.length === documentName.length || id[documentName.length] === "-"),
    );
    if (prefixed.length === 1) return catalog.projects.get(prefixed[0]) ?? null;
  }
  return null;
}

export function placeGraph(graph: ProjectGraph, modelElements: Placeable[], visibleIds: Set<string>): GraphPlacement {
  const drawnById = new Map<string, Placeable>();
  for (const element of modelElements) {
    if (!drawnById.has(element.id)) drawnById.set(element.id, element);
    const base = element.id.split("#")[0];
    if (!drawnById.has(base)) drawnById.set(base, element);
  }

  const placedByGraphId = new Map<string, { drawnId: string; onScreen: boolean; position: [number, number, number] }>();
  const nodes: PlacedNode[] = [];
  let hiddenCount = 0;
  let missingCount = 0;

  for (const node of graph.nodes) {
    const drawn = drawnById.get(node.elementId);
    if (!drawn) {
      missingCount += 1;
      continue;
    }
    const onScreen = visibleIds.has(drawn.id);
    placedByGraphId.set(node.elementId, { drawnId: drawn.id, onScreen, position: drawn.center });
    if (!onScreen) {
      hiddenCount += 1;
      continue;
    }
    const type = nodeTypeKey(node.elementType);
    nodes.push({
      graphId: node.elementId,
      drawnId: drawn.id,
      position: drawn.center,
      color: type.color,
      elementType: node.elementType,
      typeLabel: type.label,
      phaseRole: node.phaseRole,
      includeReason: node.includeReason,
    });
  }

  const seen = new Set<string>();
  const edges: PlacedEdge[] = [];
  const relationCounts = new Map<string, number>();
  for (const edge of graph.edges) {
    const src = placedByGraphId.get(edge.srcId);
    const dst = placedByGraphId.get(edge.dstId);
    if (!src?.onScreen || !dst?.onScreen) continue;
    const left = edge.srcId < edge.dstId ? edge.srcId : edge.dstId;
    const right = edge.srcId < edge.dstId ? edge.dstId : edge.srcId;
    const key = `${edge.relation}|${left}|${right}`;
    if (seen.has(key)) continue;
    seen.add(key);
    relationCounts.set(edge.relation, (relationCounts.get(edge.relation) ?? 0) + 1);
    edges.push({
      relation: edge.relation,
      srcDrawnId: src.drawnId,
      dstDrawnId: dst.drawnId,
      a: src.position,
      b: dst.position,
    });
  }

  return {
    nodes,
    edges,
    relationCounts,
    placedByGraphId,
    nodeCount: graph.nodes.length,
    onScreenCount: nodes.length,
    hiddenCount,
    missingCount,
  };
}

export function describeElement(graph: ProjectGraph, placement: GraphPlacement, elementId: string): GraphMembership {
  const base = elementId.split("#")[0];
  const node = graph.nodeById.get(elementId) ?? graph.nodeById.get(base);
  if (!node) return { inGraph: false, phaseRole: "", includeReason: "", links: [] };

  const raw = graph.edgesByElement.get(node.elementId) ?? [];
  const best = new Map<string, GraphEdge>();
  for (const edge of raw) {
    const otherId = edge.srcId === node.elementId ? edge.dstId : edge.srcId;
    const left = node.elementId < otherId ? node.elementId : otherId;
    const right = node.elementId < otherId ? otherId : node.elementId;
    const key = `${edge.relation}|${left}|${right}`;
    const current = best.get(key);
    if (!current || edge.confidence > current.confidence) best.set(key, edge);
  }

  const links = [...best.values()].map((edge) => {
    const outgoing = edge.srcId === node.elementId;
    const otherId = outgoing ? edge.dstId : edge.srcId;
    const placed = placement.placedByGraphId.get(otherId);
    const style = relationStyle(edge.relation);
    return {
      relation: edge.relation,
      label: style.label,
      color: style.color,
      otherId,
      otherDrawnId: placed?.drawnId ?? null,
      otherType: outgoing ? edge.dstType : edge.srcType,
      confidence: edge.confidence,
      distanceM: edge.distanceM,
      verticalGapM: edge.verticalGapM,
      source: edge.source,
      rule: edge.rule,
      onScreen: placed?.onScreen ?? false,
    };
  });

  const order = new Map<string, number>(GRAPH_RELATIONS.map((relation, index) => [relation.id, index]));
  links.sort((a, b) => {
    const rank = (order.get(a.relation) ?? 99) - (order.get(b.relation) ?? 99);
    if (rank !== 0) return rank;
    return a.otherId.localeCompare(b.otherId);
  });

  return {
    inGraph: true,
    phaseRole: node.phaseRole,
    includeReason: node.includeReason,
    links,
  };
}

export function relationStyle(id: string): { label: string; color: string; defaultOn: boolean } {
  const known = GRAPH_RELATIONS.find((relation) => relation.id === id);
  if (known) return known;
  return { label: id.replaceAll("_", " "), color: "#64748b", defaultOn: true };
}

export function nodeTypeKey(elementType: string): { label: string; color: string } {
  const value = elementType.toLowerCase();
  if (value.includes("foundation")) return { label: "Foundation", color: "#B279A2" };
  if (value.includes("column")) return { label: "Column", color: "#E45756" };
  if (value.includes("framing") || value.includes("beam")) return { label: "Framing", color: "#F58518" };
  if (value.includes("wall")) return { label: "Wall", color: "#4C78A8" };
  if (value.includes("floor")) return { label: "Floor", color: "#54A24B" };
  if (value.includes("roof")) return { label: "Roof", color: "#72B7B2" };
  if (value.includes("door")) return { label: "Door", color: "#EECA3B" };
  if (value.includes("window")) return { label: "Window", color: "#9D755D" };
  return { label: elementType || "Element", color: "#64748b" };
}

export function nodeLegendOrder(item: { label: string }): number {
  const index = TYPE_ORDER.indexOf(item.label);
  return index === -1 ? TYPE_ORDER.length : index;
}

export function includeReasonText(reason: string): string {
  if (!reason) return "Included in the graph";
  return INCLUDE_REASONS[reason] ?? reason.replaceAll("_", " ");
}

export function phaseRoleText(role: string): string {
  if (role === "proposed") return "Proposed";
  if (role === "demolished") return "Demolished";
  if (role === "retained") return "Retained";
  if (role === "approved") return "Approved";
  if (!role || role === "unknown") return "Unknown phase";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function defaultRelationIds(): Set<string> {
  return new Set(GRAPH_RELATIONS.filter((relation) => relation.defaultOn).map((relation) => relation.id));
}

function pushEdge(map: Map<string, GraphEdge[]>, elementId: string, edge: GraphEdge) {
  const list = map.get(elementId);
  if (list) list.push(edge);
  else map.set(elementId, [edge]);
}

function parseRows(csvText: string): Record<string, string | undefined>[] {
  const text = csvText.replace(/^\uFEFF/, "");
  const result = Papa.parse<Record<string, string | undefined>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.replace(/^\uFEFF/, "").trim(),
  });
  return result.data;
}

function cell(raw: Record<string, string | undefined>, key: string): string {
  return (raw[key] ?? "").trim();
}

function finite(value: string | undefined): number | null {
  if (value == null || value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
