"use client";

import { Line } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { GRAPH_RELATIONS, relationStyle, type PlacedEdge, type PlacedNode } from "@/lib/graph";

type GraphLayerProps = {
  nodes: PlacedNode[];
  edges: PlacedEdge[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

type EdgeBatch = {
  relation: string;
  color: string;
  positions: Float32Array;
};

export function GraphLayer({ nodes, edges, selectedId, onSelect }: GraphLayerProps) {
  const texture = useMemo(() => circleTexture(), []);
  useEffect(() => () => texture.dispose(), [texture]);

  const dots = useMemo(() => packDots(nodes), [nodes]);
  const batches = useMemo(() => packEdges(edges), [edges]);
  const focus = useMemo(() => {
    if (!selectedId) return [] as EdgeBatch[];
    const mine = edges.filter((edge) => edge.srcDrawnId === selectedId || edge.dstDrawnId === selectedId);
    return packEdges(mine);
  }, [edges, selectedId]);
  const selectedDot = useMemo(() => {
    const node = nodes.find((item) => item.drawnId === selectedId);
    if (!node) return null;
    const [red, green, blue] = hexToRgb(node.color);
    return {
      position: new Float32Array(node.position),
      color: new Float32Array([red, green, blue]),
      white: new Float32Array([1, 1, 1]),
    };
  }, [nodes, selectedId]);
  const neighborDots = useMemo(() => packNeighbors(nodes, edges, selectedId), [nodes, edges, selectedId]);

  const dimmed = focus.length > 0;

  if (nodes.length === 0 && edges.length === 0) return null;

  return (
    <group>
      {batches.map((batch) => (
        <EdgeLines
          key={batch.relation}
          positions={batch.positions}
          color={batch.color}
          opacity={edgeOpacity(batch.relation, dimmed)}
        />
      ))}
      {focus.map((batch) => (
        <FocusLines key={`focus-${batch.relation}`} positions={batch.positions} color={batch.color} />
      ))}
      {dots.positions.length > 0 && (
        <>
          <DotCloud
            positions={dots.positions}
            colors={dots.white}
            size={15}
            renderOrder={24}
            map={texture}
            opacity={dimmed ? 0.28 : 1}
          />
          <DotCloud
            positions={dots.positions}
            colors={dots.colors}
            size={10}
            renderOrder={25}
            map={texture}
            opacity={dimmed ? 0.28 : 1}
          />
        </>
      )}
      {neighborDots && (
        <>
          <DotCloud positions={neighborDots.positions} colors={neighborDots.ring} size={18} renderOrder={26} map={texture} opacity={0.8} />
          <DotCloud positions={neighborDots.positions} colors={neighborDots.colors} size={11} renderOrder={27} map={texture} opacity={0.8} />
        </>
      )}
      {selectedDot && (
        <>
          <DotCloud positions={selectedDot.position} colors={selectedDot.white} size={22} renderOrder={28} map={texture} />
          <DotCloud positions={selectedDot.position} colors={selectedDot.color} size={14} renderOrder={29} map={texture} />
        </>
      )}
      <GraphPicker nodes={nodes} onSelect={onSelect} />
    </group>
  );
}

function EdgeLines({ positions, color, opacity }: { positions: Float32Array; color: string; opacity: number }) {
  const geometry = useMemo(() => {
    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    buffer.computeBoundingSphere();
    return buffer;
  }, [positions]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  if (positions.length < 6) return null;

  return (
    <lineSegments geometry={geometry} renderOrder={20} raycast={() => null}>
      <lineBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
      />
    </lineSegments>
  );
}

function FocusLines({ positions, color }: { positions: Float32Array; color: string }) {
  const points = useMemo(() => {
    const tuples: [number, number, number][] = [];
    for (let index = 0; index < positions.length; index += 3) {
      tuples.push([positions[index], positions[index + 1], positions[index + 2]]);
    }
    return tuples;
  }, [positions]);
  if (points.length < 2) return null;
  return (
    <Line
      points={points}
      segments
      color={color}
      lineWidth={3.5}
      transparent
      opacity={1}
      depthTest={false}
      depthWrite={false}
      toneMapped={false}
      renderOrder={23}
      raycast={() => null}
    />
  );
}

function DotCloud({
  positions,
  colors,
  size,
  renderOrder,
  map,
  opacity = 1,
}: {
  positions: Float32Array;
  colors: Float32Array;
  size: number;
  renderOrder: number;
  map: THREE.Texture;
  opacity?: number;
}) {
  const geometry = useMemo(() => {
    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    buffer.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    buffer.computeBoundingSphere();
    return buffer;
  }, [positions, colors]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  if (positions.length === 0) return null;

  return (
    <points geometry={geometry} renderOrder={renderOrder} frustumCulled={false} raycast={() => null}>
      <pointsMaterial
        size={size}
        vertexColors
        sizeAttenuation={false}
        depthTest={false}
        depthWrite={false}
        transparent
        opacity={opacity}
        map={map}
        alphaTest={0.45}
        toneMapped={false}
      />
    </points>
  );
}

function GraphPicker({ nodes, onSelect }: { nodes: PlacedNode[]; onSelect: (id: string) => void }) {
  const { camera, gl } = useThree();
  const nodesRef = useRef(nodes);
  const onSelectRef = useRef(onSelect);
  nodesRef.current = nodes;
  onSelectRef.current = onSelect;

  useEffect(() => {
    const canvas = gl.domElement;
    const pointer = { x: 0, y: 0, moved: false, hovering: false };

    const onDown = (event: PointerEvent) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.moved = false;
    };
    const onMove = (event: PointerEvent) => {
      if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 5) pointer.moved = true;
      const hit = pickNode(event, nodesRef.current, camera, canvas);
      if (hit) {
        document.body.style.cursor = "pointer";
        pointer.hovering = true;
      } else if (pointer.hovering) {
        document.body.style.cursor = "";
        pointer.hovering = false;
      }
    };
    const onClick = (event: MouseEvent) => {
      if (pointer.moved) return;
      const hit = pickNode(event, nodesRef.current, camera, canvas);
      if (!hit) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onSelectRef.current(hit);
    };

    canvas.addEventListener("pointerdown", onDown, true);
    canvas.addEventListener("pointermove", onMove, true);
    canvas.addEventListener("click", onClick, true);
    return () => {
      canvas.removeEventListener("pointerdown", onDown, true);
      canvas.removeEventListener("pointermove", onMove, true);
      canvas.removeEventListener("click", onClick, true);
      if (pointer.hovering) document.body.style.cursor = "";
    };
  }, [camera, gl]);

  return null;
}

function pickNode(event: MouseEvent, nodes: PlacedNode[], camera: THREE.Camera, canvas: HTMLCanvasElement): string | null {
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  const localX = event.clientX - rect.left;
  const localY = event.clientY - rect.top;
  const point = new THREE.Vector3();
  let bestId: string | null = null;
  let bestDistance = 12;
  for (const node of nodes) {
    point.set(node.position[0], node.position[1], node.position[2]).project(camera);
    if (point.z < -1 || point.z > 1) continue;
    const screenX = (point.x * 0.5 + 0.5) * rect.width;
    const screenY = (-point.y * 0.5 + 0.5) * rect.height;
    const distance = Math.hypot(screenX - localX, screenY - localY);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestId = node.drawnId;
    }
  }
  return bestId;
}

function packNeighbors(nodes: PlacedNode[], edges: PlacedEdge[], selectedId: string | null) {
  if (!selectedId) return null;
  const ids = new Set<string>();
  for (const edge of edges) {
    if (edge.srcDrawnId === selectedId) ids.add(edge.dstDrawnId);
    else if (edge.dstDrawnId === selectedId) ids.add(edge.srcDrawnId);
  }
  ids.delete(selectedId);
  const neighbors = nodes.filter((node) => ids.has(node.drawnId));
  if (neighbors.length === 0) return null;
  const packed = packDots(neighbors);
  const ring = new Float32Array(packed.positions.length);
  const [red, green, blue] = hexToRgb("#8fd0de");
  for (let index = 0; index < ring.length; index += 3) {
    ring[index] = red;
    ring[index + 1] = green;
    ring[index + 2] = blue;
  }
  return { positions: packed.positions, colors: packed.colors, ring };
}

function packDots(nodes: PlacedNode[]) {
  const positions = new Float32Array(nodes.length * 3);
  const colors = new Float32Array(nodes.length * 3);
  nodes.forEach((node, index) => {
    positions.set(node.position, index * 3);
    colors.set(hexToRgb(node.color), index * 3);
  });
  const white = new Float32Array(positions.length).fill(1);
  return { positions, colors, white };
}

function packEdges(edges: PlacedEdge[]): EdgeBatch[] {
  const groups = new Map<string, number[]>();
  for (const edge of edges) {
    const list = groups.get(edge.relation) ?? [];
    list.push(edge.a[0], edge.a[1], edge.a[2], edge.b[0], edge.b[1], edge.b[2]);
    groups.set(edge.relation, list);
  }
  const order = new Map<string, number>(GRAPH_RELATIONS.map((relation, index) => [relation.id, index]));
  return [...groups.entries()]
    .sort((a, b) => (order.get(a[0]) ?? 99) - (order.get(b[0]) ?? 99))
    .map(([relation, values]) => ({
      relation,
      color: relationStyle(relation).color,
      positions: Float32Array.from(values),
    }));
}

function edgeOpacity(relation: string, dimmed: boolean): number {
  const proximity = relation === "spatial_proximity";
  if (dimmed) return proximity ? 0.06 : 0.16;
  return proximity ? 0.45 : 0.9;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

function circleTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (context) {
    context.clearRect(0, 0, 64, 64);
    context.beginPath();
    context.arc(32, 32, 28, 0, Math.PI * 2);
    context.fillStyle = "#ffffff";
    context.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}
