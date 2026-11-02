"use client";

import { Bounds, Edges, Grid, Html, Line, OrbitControls, Outlines } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { memo, useEffect, useMemo } from "react";
import * as THREE from "three";
import {
  DEMOLISHED_COLOR,
  PHASE_LOOKS,
  STRUCTURAL_COLOR,
  explodeOffset,
  isDemolishedValue,
  isStructuralElement,
  phaseKind,
  type DimensionLine,
  type DrawElement,
  type PhaseHighlight,
  type Vec3,
} from "@/lib/geometry";
import { type PlacedEdge, type PlacedNode } from "@/lib/graph";
import { RECOMMENDED_COLOR, RECOMMENDED_OUTLINE } from "@/lib/recommendations";
import { formatLengthShort } from "@/lib/units";
import { GraphLayer } from "@/components/viewer/graph-layer";

type SceneCanvasProps = {
  fitElements: DrawElement[];
  restElements: DrawElement[];
  markerElements: DrawElement[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  frameToken: string;
  gridCell: number;
  gridSection: number;
  phaseHighlight: PhaseHighlight;
  structuralHighlight: boolean;
  demolishedHighlight: boolean;
  graphNodes: PlacedNode[];
  graphEdges: PlacedEdge[];
  /** 0 keeps the model assembled. 1 is the full explode slider. */
  explode: number;
};

export function SceneCanvas({
  fitElements,
  restElements,
  markerElements,
  selectedId,
  onSelect,
  frameToken,
  gridCell,
  gridSection,
  phaseHighlight,
  structuralHighlight,
  demolishedHighlight,
  graphNodes,
  graphEdges,
  explode,
}: SceneCanvasProps) {
  const selected = useMemo(
    () =>
      [...fitElements, ...restElements, ...markerElements].find((element) => element.id === selectedId) ?? null,
    [fitElements, restElements, markerElements, selectedId],
  );
  const linkedIds = useMemo(() => linkedElementIds(graphEdges, selectedId), [graphEdges, selectedId]);
  const fade = useMemo(() => {
    const span = spanOf(fitElements.length ? fitElements : restElements);
    return Math.max(80, span * 1.8);
  }, [fitElements, restElements]);
  const origin = useMemo(
    () => assemblyCenter(fitElements.length > 0 ? fitElements : restElements.length > 0 ? restElements : markerElements),
    [fitElements, restElements, markerElements],
  );
  const selectedShift = selected ? explodeOffset(selected.center, origin, explode) : null;

  return (
    <Canvas
      camera={{ position: [24, 18, 24], fov: 42, near: 0.15, far: 8000 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: false }}
      onPointerMissed={() => onSelect(null)}
      style={{ width: "100%", height: "100%", touchAction: "none" }}
    >
      <color attach="background" args={["#d5dee6"]} />
      <hemisphereLight args={["#f7f5f0", "#b9c3ae", 0.9]} />
      <ambientLight intensity={0.28} />
      <directionalLight position={[48, 72, 26]} intensity={1.25} />
      <directionalLight position={[-36, 28, -22]} intensity={0.38} />
      <Grid
        args={[fade, fade]}
        position={[0, 0, 0]}
        cellSize={gridCell}
        cellThickness={0.6}
        cellColor="#c5d0da"
        sectionSize={gridSection}
        sectionThickness={1.15}
        sectionColor="#8ea0b3"
        fadeDistance={fade}
        fadeStrength={1.4}
        followCamera={false}
        infiniteGrid
      />
      {restElements.map((element) => (
        <ElementMesh
          key={element.id}
          element={element}
          selected={element.id === selectedId}
          linked={linkedIds.has(element.id)}
          phaseHighlight={phaseHighlight}
          structuralHighlight={structuralHighlight}
          demolishedHighlight={demolishedHighlight}
          explodeOrigin={origin}
          explodeAmount={explode}
          onSelect={onSelect}
        />
      ))}
      {(fitElements.length > 0 || markerElements.length > 0) && (
        <Bounds key={frameToken} fit clip margin={1.28} maxDuration={0} observe={false}>
          <group>
            {fitElements.map((element) => (
              <ElementMesh
                key={element.id}
                element={element}
                selected={element.id === selectedId}
                linked={linkedIds.has(element.id)}
                phaseHighlight={phaseHighlight}
                structuralHighlight={structuralHighlight}
                demolishedHighlight={demolishedHighlight}
                explodeOrigin={origin}
                explodeAmount={explode}
                onSelect={onSelect}
              />
            ))}
            {markerElements.map((element) => (
              <ElementMesh
                key={element.id}
                element={element}
                selected={element.id === selectedId}
                linked={linkedIds.has(element.id)}
                phaseHighlight={phaseHighlight}
                structuralHighlight={structuralHighlight}
                demolishedHighlight={demolishedHighlight}
                explodeOrigin={origin}
                explodeAmount={explode}
                onSelect={onSelect}
              />
            ))}
          </group>
        </Bounds>
      )}
      <GraphLayer
        nodes={graphNodes}
        edges={graphEdges}
        selectedId={selectedId}
        onSelect={onSelect}
        explodeOrigin={origin}
        explodeAmount={explode}
      />
      {selected && selectedShift && <Dimensions lines={selected.dimensions} shift={selectedShift} />}
      <OrbitControls makeDefault enableDamping dampingFactor={0.14} maxPolarAngle={Math.PI * 0.92} />
    </Canvas>
  );
}

/** Opacity for elements outside the Proposed or Demolished focus, so matches inside the building stay readable. */
const GHOST_OPACITY = 0.15;
/** Neighbours of the selected graph node. Softer than the gold selection so the two stay distinct. */
const LINKED_COLOR = "#5eb0c8";
const LINKED_EMISSIVE = "#1a6f8a";
const LINKED_OUTLINE = "#13485c";

function linkedElementIds(edges: { srcDrawnId: string; dstDrawnId: string }[], selectedId: string | null): Set<string> {
  const ids = new Set<string>();
  if (!selectedId) return ids;
  for (const edge of edges) {
    if (edge.srcDrawnId === selectedId) ids.add(edge.dstDrawnId);
    else if (edge.dstDrawnId === selectedId) ids.add(edge.srcDrawnId);
  }
  ids.delete(selectedId);
  return ids;
}

function phaseApplies(element: DrawElement, phaseHighlight: PhaseHighlight): boolean {
  if (phaseHighlight === "off" || phaseHighlight === "none") return false;
  const kind = phaseKind(element.phaseValue);
  const highlighted = phaseHighlight === "both" || phaseHighlight === kind;
  return highlighted || kind === "unmarked";
}

function ghostLook(element: DrawElement) {
  return {
    color: element.color,
    emissive: "#000000",
    emissiveIntensity: 0,
    roughness: element.roughness,
    metalness: element.metalness,
    opacity: Math.min(element.opacity, GHOST_OPACITY),
  };
}

function meshLook(
  element: DrawElement,
  selected: boolean,
  linked: boolean,
  phaseHighlight: PhaseHighlight,
  structuralHighlight: boolean,
  demolishedHighlight: boolean,
) {
  if (selected) {
    return {
      color: "#e39b12",
      emissive: "#c47d08",
      emissiveIntensity: 0.35,
      roughness: 0.45,
      metalness: element.metalness,
      opacity: 1,
    };
  }
  if (linked) {
    return {
      color: LINKED_COLOR,
      emissive: LINKED_EMISSIVE,
      emissiveIntensity: 0.18,
      roughness: 0.5,
      metalness: element.metalness,
      opacity: 1,
    };
  }
  if (phaseHighlight === "none") return ghostLook(element);
  if (element.recommendation) {
    return {
      color: RECOMMENDED_COLOR,
      emissive: "#9a5b08",
      emissiveIntensity: 0.28,
      roughness: 0.42,
      metalness: 0.08,
      opacity: 1,
    };
  }
  const kind = phaseKind(element.phaseValue);
  const proposedFocus = phaseHighlight === "proposed";
  const demolishedMatch = demolishedHighlight && isDemolishedValue(element.demolishedValue);
  // Existing and Both keep their own colors. Proposed and Demolished fade everything that is not a match.
  const fadeOthers = proposedFocus || (demolishedHighlight && phaseHighlight !== "existing" && phaseHighlight !== "both");
  if (fadeOthers) {
    if (proposedFocus && kind === "proposed") {
      const look = PHASE_LOOKS.proposed;
      return {
        color: look.color,
        emissive: "#000000",
        emissiveIntensity: 0,
        roughness: 0.72,
        metalness: 0.02,
        opacity: look.opacity,
      };
    }
    if (demolishedMatch) {
      return {
        color: DEMOLISHED_COLOR,
        emissive: "#000000",
        emissiveIntensity: 0,
        roughness: 0.5,
        metalness: 0.04,
        opacity: 1,
      };
    }
    return ghostLook(element);
  }
  const phaseOn = phaseApplies(element, phaseHighlight);
  if (phaseOn) {
    const highlighted = phaseHighlight === "both" || phaseHighlight === kind;
    const look = PHASE_LOOKS[highlighted ? kind : "unmarked"];
    return {
      color: look.color,
      emissive: "#000000",
      emissiveIntensity: 0,
      roughness: 0.72,
      metalness: 0.02,
      opacity: look.opacity,
    };
  }
  if (demolishedMatch) {
    return {
      color: DEMOLISHED_COLOR,
      emissive: "#000000",
      emissiveIntensity: 0,
      roughness: 0.5,
      metalness: 0.04,
      opacity: 1,
    };
  }
  if (structuralHighlight && isStructuralElement(element)) {
    return {
      color: STRUCTURAL_COLOR,
      emissive: "#000000",
      emissiveIntensity: 0,
      roughness: 0.48,
      metalness: 0.04,
      opacity: 1,
    };
  }
  return {
    color: element.color,
    emissive: "#000000",
    emissiveIntensity: 0,
    roughness: element.roughness,
    metalness: element.metalness,
    opacity: element.opacity,
  };
}

const ElementMesh = memo(function ElementMesh({
  element,
  selected,
  linked,
  phaseHighlight,
  structuralHighlight,
  demolishedHighlight,
  explodeOrigin,
  explodeAmount,
  onSelect,
}: {
  element: DrawElement;
  selected: boolean;
  linked: boolean;
  phaseHighlight: PhaseHighlight;
  structuralHighlight: boolean;
  demolishedHighlight: boolean;
  explodeOrigin: Vec3;
  explodeAmount: number;
  onSelect: (id: string) => void;
}) {
  const geometry = useMemo(() => {
    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute("position", new THREE.BufferAttribute(element.positions, 3));
    buffer.computeVertexNormals();
    buffer.computeBoundingSphere();
    return buffer;
  }, [element.positions]);

  useEffect(() => {
    return () => geometry.dispose();
  }, [geometry]);

  const opening = element.elementType === "Window" || element.elementType === "Door";
  const recommended = Boolean(element.recommendation);
  const look = meshLook(element, selected, linked, phaseHighlight, structuralHighlight, demolishedHighlight);
  const fadeAll = phaseHighlight === "none";
  const structural = !fadeAll && structuralHighlight && isStructuralElement(element);
  const demolished = !fadeAll && demolishedHighlight && isDemolishedValue(element.demolishedValue);

  const shift = explodeOffset(element.center, explodeOrigin, explodeAmount);

  return (
    <mesh
      geometry={geometry}
      position={shift}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(element.id);
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "";
      }}
    >
      <meshStandardMaterial
        color={look.color}
        emissive={look.emissive}
        emissiveIntensity={look.emissiveIntensity}
        roughness={look.roughness}
        metalness={look.metalness}
        transparent={look.opacity < 1}
        opacity={look.opacity}
        depthWrite={look.opacity > 0.9}
        side={THREE.DoubleSide}
        flatShading
        polygonOffset={opening || recommended}
        polygonOffsetFactor={recommended ? -4 : opening ? -2 : 0}
        polygonOffsetUnits={recommended ? -4 : opening ? -2 : 0}
      />
      {recommended && !selected && !fadeAll && <Edges threshold={20} color={RECOMMENDED_OUTLINE} />}
      {demolished && <Outlines color={DEMOLISHED_COLOR} thickness={8} screenspace={false} angle={Math.PI} />}
      {structural && <Outlines color={STRUCTURAL_COLOR} thickness={3} screenspace={false} angle={Math.PI} />}
      {linked && !selected && <Edges threshold={18} color={LINKED_OUTLINE} />}
      {selected && <Edges threshold={22} color="#3a2a12" />}
    </mesh>
  );
});

function Dimensions({ lines, shift }: { lines: DimensionLine[]; shift: Vec3 }) {
  return (
    <group>
      {lines.map((line, index) => {
        const a: Vec3 = [line.a[0] + shift[0], line.a[1] + shift[1], line.a[2] + shift[2]];
        const b: Vec3 = [line.b[0] + shift[0], line.b[1] + shift[1], line.b[2] + shift[2]];
        const mid: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
        return (
          <group key={`${line.label}-${index}`}>
            <Line points={[a, b]} color="#1c1917" lineWidth={1.5} />
            <Html position={mid} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
              <div className="whitespace-nowrap rounded-md bg-white/95 px-1.5 py-0.5 text-[11px] font-medium text-neutral-900 shadow-sm ring-1 ring-black/15">
                {line.label} {formatLengthShort(line.feet)}
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

function assemblyCenter(elements: DrawElement[]): Vec3 {
  if (elements.length === 0) return [0, 0, 0];
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const element of elements) {
    minX = Math.min(minX, element.min[0]);
    minY = Math.min(minY, element.min[1]);
    minZ = Math.min(minZ, element.min[2]);
    maxX = Math.max(maxX, element.max[0]);
    maxY = Math.max(maxY, element.max[1]);
    maxZ = Math.max(maxZ, element.max[2]);
  }
  return [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
}

function spanOf(elements: DrawElement[]): number {
  if (elements.length === 0) return 40;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const element of elements) {
    minX = Math.min(minX, element.min[0]);
    maxX = Math.max(maxX, element.max[0]);
    minZ = Math.min(minZ, element.min[2]);
    maxZ = Math.max(maxZ, element.max[2]);
  }
  return Math.max(maxX - minX, maxZ - minZ, 10);
}
