"use client";

import { Bounds, Edges, Grid, Html, Line, OrbitControls, Outlines } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { memo, useEffect, useMemo } from "react";
import * as THREE from "three";
import {
  PHASE_LOOKS,
  STRUCTURAL_COLOR,
  isStructuralValue,
  phaseKind,
  type DimensionLine,
  type DrawElement,
  type PhaseHighlight,
} from "@/lib/geometry";
import { formatLengthShort } from "@/lib/units";

type SceneCanvasProps = {
  fitElements: DrawElement[];
  restElements: DrawElement[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  frameToken: string;
  gridCell: number;
  gridSection: number;
  phaseHighlight: PhaseHighlight;
  structuralHighlight: boolean;
};

export function SceneCanvas({
  fitElements,
  restElements,
  selectedId,
  onSelect,
  frameToken,
  gridCell,
  gridSection,
  phaseHighlight,
  structuralHighlight,
}: SceneCanvasProps) {
  const selected = useMemo(
    () => [...fitElements, ...restElements].find((element) => element.id === selectedId) ?? null,
    [fitElements, restElements, selectedId],
  );
  const fade = useMemo(() => {
    const span = spanOf(fitElements.length ? fitElements : restElements);
    return Math.max(80, span * 1.8);
  }, [fitElements, restElements]);

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
          phaseHighlight={phaseHighlight}
          structuralHighlight={structuralHighlight}
          onSelect={onSelect}
        />
      ))}
      {fitElements.length > 0 && (
        <Bounds key={frameToken} fit clip margin={1.28} maxDuration={0} observe={false}>
          <group>
            {fitElements.map((element) => (
              <ElementMesh
                key={element.id}
                element={element}
                selected={element.id === selectedId}
                phaseHighlight={phaseHighlight}
                structuralHighlight={structuralHighlight}
                onSelect={onSelect}
              />
            ))}
          </group>
        </Bounds>
      )}
      {selected && <Dimensions lines={selected.dimensions} />}
      <OrbitControls makeDefault enableDamping dampingFactor={0.14} maxPolarAngle={Math.PI * 0.92} />
    </Canvas>
  );
}

function meshLook(
  element: DrawElement,
  selected: boolean,
  phaseHighlight: PhaseHighlight,
  structuralHighlight: boolean,
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
  const kind = phaseKind(element.phaseValue);
  const highlighted =
    phaseHighlight === "both" || (phaseHighlight !== "off" && phaseHighlight === kind);
  const phaseOn = phaseHighlight !== "off" && (highlighted || kind === "unmarked");
  if (structuralHighlight && isStructuralValue(element.structuralValue) && !phaseOn) {
    return {
      color: STRUCTURAL_COLOR,
      emissive: "#000000",
      emissiveIntensity: 0,
      roughness: 0.48,
      metalness: 0.04,
      opacity: 1,
    };
  }
  if (phaseOn) {
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
  phaseHighlight,
  structuralHighlight,
  onSelect,
}: {
  element: DrawElement;
  selected: boolean;
  phaseHighlight: PhaseHighlight;
  structuralHighlight: boolean;
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
  const look = meshLook(element, selected, phaseHighlight, structuralHighlight);
  const structural = structuralHighlight && isStructuralValue(element.structuralValue);

  return (
    <mesh
      geometry={geometry}
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
        polygonOffset={opening}
        polygonOffsetFactor={opening ? -2 : 0}
        polygonOffsetUnits={opening ? -2 : 0}
      />
      {structural && <Outlines color={STRUCTURAL_COLOR} thickness={4} screenspace={false} angle={Math.PI} />}
      {selected && <Edges threshold={22} color="#3a2a12" />}
    </mesh>
  );
});

function Dimensions({ lines }: { lines: DimensionLine[] }) {
  return (
    <group>
      {lines.map((line, index) => {
        const mid: [number, number, number] = [
          (line.a[0] + line.b[0]) / 2,
          (line.a[1] + line.b[1]) / 2,
          (line.a[2] + line.b[2]) / 2,
        ];
        return (
          <group key={`${line.label}-${index}`}>
            <Line points={[line.a, line.b]} color="#1c1917" lineWidth={1.5} />
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
