"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  ELEMENT_STYLES,
  GEOMETRY_NOTE,
  PHASE_FIELD,
  PHASE_LOOKS,
  STRUCTURAL_COLOR,
  STRUCTURAL_FIELD,
  clusterSplit,
  elementTypeOrder,
  isStructuralValue,
  parseModel,
  phaseKind,
  type DrawElement,
  type ParsedModel,
  type PhaseHighlight,
} from "@/lib/geometry";
import { SAMPLES, sampleUrl, type SampleModel } from "@/lib/samples";
import { formatArea, formatLength, formatVolume } from "@/lib/units";
import { cn } from "@/lib/utils";

const SceneCanvas = dynamic(
  () => import("@/components/viewer/scene").then((mod) => mod.SceneCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center px-6 text-sm text-neutral-700">
        Preparing the 3D view…
      </div>
    ),
  },
);

type Source =
  | { kind: "sample"; sample: SampleModel }
  | { kind: "upload"; name: string; text: string };

type LoadState =
  | { status: "idle" }
  | { status: "loading"; label: string }
  | { status: "error"; label: string; message: string }
  | { status: "ready"; label: string; model: ParsedModel };

const ALL_TYPES = "__all__";

export function ViewerApp() {
  const [source, setSource] = useState<Source | null>(null);
  const [load, setLoad] = useState<LoadState>({ status: "idle" });
  const [dragOver, setDragOver] = useState(false);
  const dragDepth = useRef(0);
  const [enabled, setEnabled] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState(ALL_TYPES);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [frameMode, setFrameMode] = useState<"cluster" | "all">("cluster");
  const [fitNonce, setFitNonce] = useState(0);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [phaseHighlight, setPhaseHighlight] = useState<PhaseHighlight>("off");
  const [structuralOn, setStructuralOn] = useState(false);

  useEffect(() => {
    if (!source) return;
    let cancel = false;
    const label = source.kind === "sample" ? source.sample.file : source.name;

    const run = async () => {
      try {
        const text =
          source.kind === "upload"
            ? source.text
            : await fetch(sampleUrl(source.sample.file)).then((response) => {
                if (!response.ok) {
                  throw new Error(`Could not load ${source.sample.file} (${response.status}).`);
                }
                return response.text();
              });
        const filename = source.kind === "upload" ? source.name : source.sample.file;
        const model = parseModel(text, filename);
        if (cancel) return;
        setEnabled(new Set(model.elements.map((element) => element.elementType)));
        setLoad({ status: "ready", label, model });
      } catch (error) {
        if (cancel) return;
        setLoad({
          status: "error",
          label,
          message: error instanceof Error ? error.message : "The CSV could not be read.",
        });
      }
    };

    void run();
    return () => {
      cancel = true;
    };
  }, [source]);

  const model = load.status === "ready" ? load.model : null;

  const typeOptions = useMemo(() => {
    if (!model) return [];
    const names = new Set<string>();
    for (const element of model.elements) {
      if (enabled.has(element.elementType)) names.add(element.typeName);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [model, enabled]);

  const activeType = typeOptions.includes(typeFilter) ? typeFilter : ALL_TYPES;

  const visible = useMemo(() => {
    if (!model) return [];
    const needle = query.trim().toLowerCase();
    return model.elements.filter((element) => {
      if (!enabled.has(element.elementType)) return false;
      if (activeType !== ALL_TYPES && element.typeName !== activeType) return false;
      if (!needle) return true;
      const haystack = `${element.id} ${element.mark} ${element.elementType} ${element.family} ${element.typeName}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [model, enabled, activeType, query]);

  const split = useMemo(() => {
    if (frameMode === "all") return { core: visible, distant: [] as DrawElement[] };
    return clusterSplit(visible);
  }, [visible, frameMode]);

  const fitElements = split.core.length > 0 ? split.core : visible;
  const restElements = split.core.length > 0 ? split.distant : [];
  const selected = model?.elements.find((element) => element.id === selectedId) ?? null;
  const selectedHidden = Boolean(selected && !visible.some((element) => element.id === selected.id));

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const element of model?.elements ?? []) {
      map.set(element.elementType, (map.get(element.elementType) ?? 0) + 1);
    }
    return map;
  }, [model]);

  const skipGroups = useMemo(() => {
    const map = new Map<string, number>();
    for (const skip of model?.skipped ?? []) {
      map.set(skip.reason, (map.get(skip.reason) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [model]);

  const distantCount = useMemo(() => {
    if (!model) return 0;
    return clusterSplit(model.elements).distant.length;
  }, [model]);

  const phaseCounts = useMemo(() => {
    const counts = { existing: 0, proposed: 0, unmarked: 0 };
    for (const element of visible) counts[phaseKind(element.phaseValue)] += 1;
    return counts;
  }, [visible]);

  const structuralCount = useMemo(
    () => visible.filter((element) => isStructuralValue(element.structuralValue)).length,
    [visible],
  );

  const span = useMemo(() => planSpan(fitElements), [fitElements]);
  const grid = span > 180 ? { cell: 10, section: 50 } : span > 80 ? { cell: 5, section: 25 } : span > 30 ? { cell: 2, section: 10 } : { cell: 1, section: 5 };

  const frameToken = `${model?.filename ?? "none"}|${frameMode}|${fitNonce}`;

  const resetForLoad = (label: string) => {
    setLoad({ status: "loading", label });
    setSelectedId(null);
    setQuery("");
    setTypeFilter(ALL_TYPES);
    setFrameMode("cluster");
    setFitNonce(0);
    setPhaseHighlight("off");
    setStructuralOn(false);
  };

  const filename = source?.kind === "upload" ? source.name : source?.kind === "sample" ? source.sample.file : null;

  const openSample = (sample: SampleModel) => {
    if (source?.kind === "sample" && source.sample.id === sample.id && load.status === "ready") {
      setControlsOpen(false);
      return;
    }
    resetForLoad(sample.file);
    setSource({ kind: "sample", sample });
    setControlsOpen(false);
  };

  const onUpload = async (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setLoad({
        status: "error",
        label: file.name,
        message: `${file.name} is not a CSV. Choose a Revit schedule export ending in .csv.`,
      });
      return;
    }
    if (file.size > 25_000_000) {
      setLoad({
        status: "error",
        label: file.name,
        message: `${file.name} is over 25 MB. This viewer expects a schedule-sized CSV.`,
      });
      return;
    }
    resetForLoad(file.name);
    try {
      const text = await file.text();
      setSource({ kind: "upload", name: file.name, text });
      setControlsOpen(false);
    } catch {
      setLoad({ status: "error", label: file.name, message: `Could not read ${file.name}.` });
    }
  };

  const onDragEnter = (event: React.DragEvent) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    dragDepth.current += 1;
    setDragOver(true);
  };

  const onDragOver = (event: React.DragEvent) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const onDragLeave = (event: React.DragEvent) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setDragOver(false);
    }
  };

  const onDrop = (event: React.DragEvent) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    dragDepth.current = 0;
    setDragOver(false);
    void onUpload(event.dataTransfer.files?.[0]);
  };

  const hasModel = load.status === "ready" && load.model.elements.length > 0;

  const controls = (
    <Controls
      source={source}
      load={load}
      model={model}
      enabled={enabled}
      counts={counts}
      typeFilter={activeType}
      typeOptions={typeOptions}
      query={query}
      skipGroups={skipGroups}
      onSample={openSample}
      onUpload={onUpload}
      onToggleType={(elementType) => {
        setEnabled((current) => {
          const next = new Set(current);
          if (next.has(elementType)) next.delete(elementType);
          else next.add(elementType);
          return next;
        });
      }}
      onSolo={(elementType) => setEnabled(new Set([elementType]))}
      onAllTypes={() => {
        if (!model) return;
        setEnabled(new Set(model.elements.map((element) => element.elementType)));
      }}
      onTypeFilter={setTypeFilter}
      onQuery={setQuery}
    />
  );

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-[#d5dee6] text-foreground"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <header className="flex items-start justify-between gap-3 border-b border-black/10 bg-background px-4 py-3">
        <div className="min-w-0">
          <h1 className="text-base font-semibold tracking-tight">Revit CSV viewer</h1>
          <p className="mt-0.5 text-xs break-all text-muted-foreground">
            {filename ?? "No file yet. Drop a CSV on the page, or choose one."}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
          <FilePickerButton onUpload={onUpload}>Choose CSV</FilePickerButton>
          {hasModel && (
            <Button size="sm" variant="outline" className="md:hidden" onClick={() => setControlsOpen(true)}>
              Filters
            </Button>
          )}
          {hasModel && (
            <Button size="sm" variant="outline" className="lg:hidden" onClick={() => setDetailsOpen(true)}>
              Details
            </Button>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
      {hasModel && (
        <aside className="hidden h-full w-[340px] shrink-0 flex-col border-r border-black/10 bg-background md:flex">
          {controls}
        </aside>
      )}

      <main className="relative flex min-w-0 flex-1 flex-col">
        <div className="relative min-h-0 flex-1">
          {load.status === "idle" && (
            <Welcome dragging={dragOver} activeSampleId={null} onSample={openSample} onUpload={onUpload} />
          )}
          {load.status === "loading" && (
            <StatusPane title={`Reading ${load.label}`} body="Parsing the schedule and placing each row that has a mesh, a line, or a point." />
          )}
          {load.status === "error" && (
            <StatusPane title={`Could not open ${load.label}`} body={load.message}>
              <div className="mt-4">
                <FilePickerButton onUpload={onUpload}>Choose another CSV</FilePickerButton>
              </div>
            </StatusPane>
          )}
          {load.status === "ready" && load.model.elements.length === 0 && (
            <StatusPane
              title={`No placeable elements in ${load.label}`}
              body={`${load.model.rowCount} rows were read and none could be drawn. A row needs a Boundary mesh, a Start/End line, or a Location with sizes.`}
            >
              {skipGroups.length > 0 && (
                <ul className="mt-3 flex flex-col gap-1 text-xs text-neutral-600">
                  {skipGroups.slice(0, 4).map(([reason, count]) => (
                    <li key={reason}>
                      {count} × {reason}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4">
                <FilePickerButton onUpload={onUpload}>Choose another CSV</FilePickerButton>
              </div>
            </StatusPane>
          )}
          {hasModel && (
            <>
              <SceneCanvas
                fitElements={fitElements}
                restElements={restElements}
                selectedId={selectedHidden ? null : selectedId}
                onSelect={setSelectedId}
                frameToken={frameToken}
                gridCell={grid.cell}
                gridSection={grid.section}
                phaseHighlight={model?.phaseField ? phaseHighlight : "off"}
                structuralHighlight={Boolean(model?.structuralField) && structuralOn}
              />
              <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
                <div className="pointer-events-none max-w-[70%] rounded-lg bg-white/90 px-3 py-2 text-xs text-neutral-800 shadow-sm ring-1 ring-black/10">
                  <p className="font-medium break-all text-neutral-950">{filename}</p>
                  <p className="mt-0.5 text-neutral-600">
                    {visible.length} shown · grid {grid.cell} ft at Revit Z = 0 · drag to orbit, right-drag to pan, scroll to zoom
                  </p>
                  {frameMode === "cluster" && distantCount > 0 && (
                    <p className="mt-1 text-neutral-600">
                      {distantCount} element{distantCount === 1 ? "" : "s"} sit far from the main cluster and are outside this framing.
                    </p>
                  )}
                  {model?.phaseField && phaseHighlight !== "off" && (
                    <PhaseLegend elements={model.elements} mode={phaseHighlight} />
                  )}
                  {model?.structuralField && structuralOn && (
                    <StructuralLegend phaseOn={phaseHighlight !== "off"} count={structuralCount} />
                  )}
                </div>
                <div className="pointer-events-auto flex max-w-[17rem] flex-col items-end gap-1.5">
                  <Button size="sm" variant="secondary" onClick={() => setFitNonce((value) => value + 1)}>
                    Fit view
                  </Button>
                  {distantCount > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="bg-white"
                      onClick={() => setFrameMode((mode) => (mode === "cluster" ? "all" : "cluster"))}
                    >
                      {frameMode === "cluster" ? "Frame entire file" : "Frame main cluster"}
                    </Button>
                  )}
                  <PhaseHighlightControl
                    available={Boolean(model?.phaseField)}
                    mode={phaseHighlight}
                    counts={phaseCounts}
                    onChange={setPhaseHighlight}
                  />
                  <StructuralHighlightControl
                    available={Boolean(model?.structuralField)}
                    on={structuralOn}
                    count={structuralCount}
                    onChange={setStructuralOn}
                  />
                </div>
              </div>
              {visible.length === 0 && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
                  <div className="max-w-sm rounded-xl bg-white/95 px-4 py-3 text-sm shadow-sm ring-1 ring-black/10">
                    Nothing matches this filter. Turn a category back on, or set type to All types.
                  </div>
                </div>
              )}
              {selected && (
                <button
                  type="button"
                  onClick={() => setDetailsOpen(true)}
                  className="absolute inset-x-3 bottom-3 rounded-xl bg-white/95 p-3 text-left shadow-md ring-1 ring-black/10 lg:hidden"
                >
                  <SelectionSummary element={selected} hidden={selectedHidden} compact />
                </button>
              )}
            </>
          )}
        </div>
      </main>

      {hasModel && (
        <aside className="hidden h-full w-[360px] shrink-0 flex-col border-l border-black/10 bg-background lg:flex">
          <Inspector element={selected} hidden={selectedHidden} onClear={() => setSelectedId(null)} />
        </aside>
      )}
      </div>

      {dragOver && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-[#d5dee6]/80 p-6">
          <div className="rounded-3xl border-2 border-dashed border-neutral-900 bg-white px-10 py-8 text-center shadow-lg">
            <p className="text-lg font-semibold">Drop the CSV to build the model</p>
            <p className="mt-1 text-sm text-neutral-600">Revit schedule exports with Boundary, Start/End, or Location columns.</p>
          </div>
        </div>
      )}

      <Sheet open={controlsOpen} onOpenChange={setControlsOpen}>
        <SheetContent side="left" className="w-[min(100%,22rem)] p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Filters and examples</SheetTitle>
            <SheetDescription>Filter the model or open an example CSV.</SheetDescription>
          </SheetHeader>
          {controls}
        </SheetContent>
      </Sheet>

      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent side="right" className="w-[min(100%,24rem)] p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Element details</SheetTitle>
            <SheetDescription>Measurements and schedule fields for the selection.</SheetDescription>
          </SheetHeader>
          <Inspector element={selected} hidden={selectedHidden} onClear={() => setSelectedId(null)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Controls({
  source,
  load,
  model,
  enabled,
  counts,
  typeFilter,
  typeOptions,
  query,
  skipGroups,
  onSample,
  onUpload,
  onToggleType,
  onSolo,
  onAllTypes,
  onTypeFilter,
  onQuery,
}: {
  source: Source | null;
  load: LoadState;
  model: ParsedModel | null;
  enabled: Set<string>;
  counts: Map<string, number>;
  typeFilter: string;
  typeOptions: string[];
  query: string;
  skipGroups: [string, number][];
  onSample: (sample: SampleModel) => void;
  onUpload: (file: File | undefined) => void;
  onToggleType: (elementType: string) => void;
  onSolo: (elementType: string) => void;
  onAllTypes: () => void;
  onTypeFilter: (value: string) => void;
  onQuery: (value: string) => void;
}) {
  const types = elementTypeOrder([...counts.keys()]);

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-4 p-4">
        <div>
          <h2 className="text-sm font-medium">Open a CSV</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Choose a file here, or drop one anywhere on the page. The model is rebuilt from that export.
          </p>
          <FilePickerButton className="mt-2 w-full" onUpload={onUpload}>
            Choose CSV
          </FilePickerButton>
          {source?.kind === "upload" && (
            <p className="mt-2 text-[11px] break-all text-muted-foreground">{source.name}</p>
          )}
          {source?.kind === "sample" && (
            <p className="mt-2 text-[11px] break-all text-muted-foreground">{source.sample.file}</p>
          )}
        </div>

        <ExampleList source={source} onSample={onSample} />

        {model && (
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Rows" value={model.rowCount} />
            <Stat label="Drawn" value={model.elements.length} />
            <Stat label="Skipped" value={model.skipped.length} />
          </div>
        )}
        {load.status === "loading" && <p className="text-sm text-muted-foreground">Reading {load.label}…</p>}
        {model?.documentName && (
          <p className="text-xs text-muted-foreground">Document {model.documentName}</p>
        )}

        <Separator />

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium">Category</h2>
            <button type="button" className="text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={onAllTypes}>
              Show all
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {types.map((elementType) => {
              const on = enabled.has(elementType);
              const swatch = ELEMENT_STYLES[elementType]?.color ?? "#c4b5a0";
              return (
                <button
                  key={elementType}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onToggleType(elementType)}
                  onDoubleClick={() => onSolo(elementType)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs",
                    on ? "border-foreground bg-background" : "border-transparent bg-muted text-muted-foreground",
                  )}
                >
                  <span className="size-2.5 rounded-full" style={{ background: swatch }} />
                  {elementType}
                  <span className="text-muted-foreground">{counts.get(elementType) ?? 0}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">Double-click a category to show only that one. The Category column itself is a Revit id; these names are the Element Type.</p>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium" htmlFor="type-filter">
            Type
          </label>
          <Select
            value={typeFilter}
            items={{
              [ALL_TYPES]: "All types",
              ...Object.fromEntries(typeOptions.map((typeName) => [typeName, typeName])),
            }}
            onValueChange={(value) => onTypeFilter(value ?? ALL_TYPES)}
          >
            <SelectTrigger id="type-filter" className="w-full">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent align="start" className="max-h-72">
              <SelectItem value={ALL_TYPES}>All types</SelectItem>
              {typeOptions.map((typeName) => (
                <SelectItem key={typeName} value={typeName}>
                  {typeName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="text-sm font-medium" htmlFor="find-element">
            Find
          </label>
          <input
            id="find-element"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Id, mark, family, or type"
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>

        <Separator />

        <div>
          <h2 className="text-sm font-medium">How geometry is read</h2>
          <div className="mt-2 flex flex-col gap-2 text-xs leading-5 text-muted-foreground">
            {GEOMETRY_NOTE.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            {model && model.fallbacks.length > 0 && (
              <ul className="list-disc pl-4">
                {model.fallbacks.map((fallback) => (
                  <li key={fallback.note}>
                    {fallback.count} × {fallback.note}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {skipGroups.length > 0 && (
          <div>
            <h2 className="text-sm font-medium">Skipped rows</h2>
            <ul className="mt-2 flex flex-col gap-1.5 text-xs text-muted-foreground">
              {skipGroups.map(([reason, count]) => (
                <li key={reason}>
                  <Badge variant="secondary" className="mr-1.5">
                    {count}
                  </Badge>
                  {reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

function Inspector({
  element,
  hidden,
  onClear,
}: {
  element: DrawElement | null;
  hidden: boolean;
  onClear: () => void;
}) {
  if (!element) {
    return (
      <div className="flex h-full flex-col justify-center gap-2 p-5">
        <h2 className="text-base font-semibold">No element selected</h2>
        <p className="text-sm leading-6 text-muted-foreground">
          Click a wall, slab, beam, door, or window. Width, height, and length from the row show here, and the same sizes are drawn on the element when the file has them.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start justify-between gap-3 p-4 pb-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
            {element.elementType}
          </p>
          <h2 className="mt-1 text-base font-semibold leading-snug">{element.typeName}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Id {element.id}
            {element.mark ? ` · Mark ${element.mark}` : ""}
            {element.family ? ` · ${element.family}` : ""}
          </p>
          {element.levelName && <p className="mt-1 text-xs text-muted-foreground">{element.levelName}</p>}
          {element.phaseField && (
            <p className="mt-2 text-xs">
              <span className="text-muted-foreground">{element.phaseField}</span>
              <span className="ml-1.5 font-medium">{element.phaseValue || "(blank)"}</span>
            </p>
          )}
          {element.structuralField && (
            <p className="mt-1 text-xs">
              <span className="text-muted-foreground">{element.structuralField}</span>
              <span className="ml-1.5 font-medium">{element.structuralValue || "(blank)"}</span>
            </p>
          )}
          {hidden && (
            <p className="mt-2 text-xs text-amber-800">This element is hidden by the current filter.</p>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={onClear}>
          Clear
        </Button>
      </div>
      <div className="px-4 pb-3">
        <h3 className="text-sm font-medium">Measurements</h3>
        {element.measurements.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">This row has no width, height, length, or area cells. The solid is the Boundary mesh.</p>
        ) : (
          <dl className="mt-2 grid grid-cols-1 gap-1.5">
            {element.measurements.map((measurement) => (
              <div key={`${measurement.label}-${measurement.source}`} className="flex items-baseline justify-between gap-3 text-sm">
                <dt className="text-muted-foreground">{measurement.label}</dt>
                <dd className="text-right font-medium tabular-nums">
                  {measurement.kind === "area"
                    ? formatArea(measurement.value)
                    : measurement.kind === "volume"
                      ? formatVolume(measurement.value)
                      : formatLength(measurement.value)}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      <Separator />
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-4">
          <h3 className="text-sm font-medium">Schedule row</h3>
          <dl className="mt-2 flex flex-col gap-1.5">
            {element.properties.map((property) => (
              <div key={property.key} className="grid grid-cols-[9.5rem_1fr] gap-2 text-xs">
                <dt className="text-muted-foreground">{property.key}</dt>
                <dd className="break-words">{property.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </ScrollArea>
    </div>
  );
}

function SelectionSummary({
  element,
  hidden,
  compact,
}: {
  element: DrawElement;
  hidden: boolean;
  compact?: boolean;
}) {
  const lengths = element.measurements.filter((measurement) => measurement.kind === "length").slice(0, compact ? 4 : 8);
  return (
    <div>
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{element.elementType}</p>
      <p className="truncate text-sm font-semibold">{element.typeName}</p>
      <p className="truncate text-xs text-muted-foreground">
        Id {element.id}
        {element.mark ? ` · ${element.mark}` : ""}
        {hidden ? " · hidden by filter" : ""}
      </p>
      {element.phaseField && (
        <p className="mt-1 text-xs">
          <span className="text-muted-foreground">{element.phaseField}</span>
          <span className="ml-1 font-medium">{element.phaseValue || "(blank)"}</span>
        </p>
      )}
      {element.structuralField && (
        <p className="mt-1 text-xs">
          <span className="text-muted-foreground">{element.structuralField}</span>
          <span className="ml-1 font-medium">{element.structuralValue || "(blank)"}</span>
        </p>
      )}
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
        {lengths.map((measurement) => (
          <div key={`${measurement.label}-${measurement.source}`}>
            <dt className="text-[10px] text-muted-foreground">{measurement.label}</dt>
            <dd className="text-xs font-medium tabular-nums">{formatLength(measurement.value)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[11px] text-muted-foreground">Open details for the full row.</p>
    </div>
  );
}

function FilePickerButton({
  children,
  onUpload,
  className,
}: {
  children: React.ReactNode;
  onUpload: (file: File | undefined) => void;
  className?: string;
}) {
  return (
    <label className={cn(buttonVariants({ variant: "default", size: "sm" }), "cursor-pointer", className)}>
      {children}
      <input
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          onUpload(file);
        }}
      />
    </label>
  );
}

function ExampleList({ source, onSample }: { source: Source | null; onSample: (sample: SampleModel) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-medium">Examples</h2>
      {SAMPLES.map((sample) => {
        const active = source?.kind === "sample" && source.sample.id === sample.id;
        return (
          <button
            key={sample.id}
            type="button"
            onClick={() => onSample(sample)}
            className={cn(
              "rounded-lg border px-3 py-2 text-left transition-colors",
              active ? "border-foreground bg-muted" : "border-border hover:bg-muted/60",
            )}
          >
            <span className="block text-sm font-medium">{sample.title}</span>
            <span className="mt-0.5 block text-[11px] break-all text-muted-foreground">{sample.file}</span>
          </button>
        );
      })}
    </div>
  );
}

function Welcome({
  dragging,
  activeSampleId,
  onSample,
  onUpload,
}: {
  dragging: boolean;
  activeSampleId: string | null;
  onSample: (sample: SampleModel) => void;
  onUpload: (file: File | undefined) => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 overflow-auto px-4 py-8">
      <div
        data-dropzone
        className={cn(
          "flex w-full max-w-xl flex-col items-center rounded-3xl border-2 border-dashed bg-white px-6 py-12 text-center sm:px-10 sm:py-16",
          dragging ? "border-neutral-950 bg-neutral-50" : "border-neutral-300",
        )}
      >
        <p className="text-lg font-semibold tracking-tight">Drop a Revit CSV here</p>
        <p className="mt-2 max-w-md text-sm leading-6 text-neutral-600">
          The 3D model is built from the file you give it. Rows with a Boundary mesh, a Start/End line, or a Location and sizes are placed. Measurements show when you select an element.
        </p>
        <FilePickerButton className="mt-5 h-9 px-4" onUpload={onUpload}>
          Choose a CSV file
        </FilePickerButton>
      </div>
      <div className="w-full max-w-xl">
        <p className="text-[11px] font-medium tracking-[0.14em] text-neutral-600 uppercase">Or open an example</p>
        <div className="mt-2">
          <ExampleList
            source={activeSampleId ? { kind: "sample", sample: SAMPLES.find((sample) => sample.id === activeSampleId) ?? SAMPLES[0] } : null}
            onSample={onSample}
          />
        </div>
      </div>
    </div>
  );
}

function PhaseHighlightControl({
  available,
  mode,
  counts,
  onChange,
}: {
  available: boolean;
  mode: PhaseHighlight;
  counts: { existing: number; proposed: number; unmarked: number };
  onChange: (mode: PhaseHighlight) => void;
}) {
  const options: { id: PhaseHighlight; label: string }[] = [
    { id: "off", label: "Category" },
    { id: "existing", label: "Existing" },
    { id: "proposed", label: "Proposed" },
    { id: "both", label: "Both" },
  ];

  return (
    <div className="rounded-lg bg-white/95 p-2 text-left shadow-sm ring-1 ring-black/10">
      <p className="px-0.5 text-[11px] font-medium text-neutral-800">{PHASE_FIELD}</p>
      {available ? (
        <div className="mt-1.5 flex flex-wrap justify-end gap-1">
          {options.map((option) => {
            const active = mode === option.id;
            const count =
              option.id === "existing" ? counts.existing : option.id === "proposed" ? counts.proposed : null;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={active}
                onClick={() => onChange(option.id)}
                className={cn(
                  "rounded-md px-2 py-1 text-[11px] font-medium",
                  active ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-800 hover:bg-neutral-200",
                )}
              >
                {option.label}
                {count != null ? ` ${count}` : ""}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="mt-1 max-w-56 text-[11px] leading-4 text-neutral-600">
          This file has no {PHASE_FIELD} column, so existing and proposed cannot be highlighted.
        </p>
      )}
    </div>
  );
}

function StructuralHighlightControl({
  available,
  on,
  count,
  onChange,
}: {
  available: boolean;
  on: boolean;
  count: number;
  onChange: (on: boolean) => void;
}) {
  return (
    <div className="rounded-lg bg-white/95 p-2 text-left shadow-sm ring-1 ring-black/10">
      <p className="px-0.5 text-[11px] font-medium text-neutral-800">{STRUCTURAL_FIELD}</p>
      {available ? (
        <div className="mt-1.5 flex flex-wrap justify-end gap-1">
          <button
            type="button"
            aria-pressed={!on}
            onClick={() => onChange(false)}
            className={cn(
              "rounded-md px-2 py-1 text-[11px] font-medium",
              !on ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-800 hover:bg-neutral-200",
            )}
          >
            Off
          </button>
          <button
            type="button"
            aria-pressed={on}
            onClick={() => onChange(true)}
            className={cn(
              "rounded-md px-2 py-1 text-[11px] font-medium",
              on ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-800 hover:bg-neutral-200",
            )}
          >
            Structural {count}
          </button>
        </div>
      ) : (
        <p className="mt-1 max-w-56 text-[11px] leading-4 text-neutral-600">
          This file has no {STRUCTURAL_FIELD} column, so structural elements cannot be highlighted.
        </p>
      )}
    </div>
  );
}

function StructuralLegend({ phaseOn, count }: { phaseOn: boolean; count: number }) {
  return (
    <div className="mt-2 border-t border-neutral-200 pt-2">
      <p className="flex items-center gap-1.5">
        <span className="size-2.5 shrink-0 rounded-sm ring-1 ring-black/15" style={{ background: STRUCTURAL_COLOR }} />
        <span>
          Structural {count} · {STRUCTURAL_FIELD} = 1
        </span>
      </p>
      <p className="mt-1 text-[11px] leading-4 text-neutral-500">
        {phaseOn
          ? "Fill still follows Phase Created. A red outline marks Structural = 1. Element categories are not used."
          : "Uses the Structural column, not element category. 0 and blank keep their current color."}
      </p>
    </div>
  );
}

function PhaseLegend({ elements, mode }: { elements: DrawElement[]; mode: PhaseHighlight }) {
  const unmarkedValues = useMemo(() => {
    const values = new Set<string>();
    for (const element of elements) {
      if (phaseKind(element.phaseValue) === "unmarked") values.add(element.phaseValue || "blank");
    }
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [elements]);

  const rows: { kind: "existing" | "proposed" | "unmarked"; note?: string }[] =
    mode === "both"
      ? [{ kind: "existing" }, { kind: "proposed" }, { kind: "unmarked" }]
      : mode === "existing"
        ? [{ kind: "existing" }, { kind: "unmarked", note: "Proposed stays in its category color." }]
        : [{ kind: "proposed" }, { kind: "unmarked", note: "Existing stays in its category color." }];

  return (
    <div className="mt-2 border-t border-neutral-200 pt-2">
      <ul className="flex flex-col gap-1">
        {rows.map((row) => (
          <li key={row.kind} className="flex items-center gap-1.5">
            <span
              className="size-2.5 shrink-0 rounded-sm ring-1 ring-black/15"
              style={{
                background: PHASE_LOOKS[row.kind].color,
                opacity: row.kind === "unmarked" ? 1 : PHASE_LOOKS[row.kind].opacity,
              }}
            />
            <span>
              {PHASE_LOOKS[row.kind].label}
              {row.kind === "unmarked" && unmarkedValues.length > 0 ? ` (${unmarkedValues.join(", ")})` : ""}
            </span>
          </li>
        ))}
      </ul>
      {rows[1]?.note && <p className="mt-1 text-[11px] text-neutral-500">{rows.find((row) => row.note)?.note}</p>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted px-2 py-2">
      <div className="text-base font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function StatusPane({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-md rounded-2xl bg-white px-5 py-4 shadow-sm ring-1 ring-black/10">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-neutral-600">{body}</p>
        {children}
      </div>
    </div>
  );
}

function planSpan(elements: DrawElement[]): number {
  if (elements.length === 0) return 20;
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
  return Math.max(maxX - minX, maxZ - minZ, 8);
}
