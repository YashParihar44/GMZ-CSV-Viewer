# Revit CSV viewer

A 3D viewer for Revit schedule exports. Drop a CSV on the page or choose a file, and the app draws each element that has a position in that file. Three bundled GMZ and ModelTime exports are available as examples.

Walls, floors, and roofs use the `Boundary` triangle mesh. Beams and columns run from `Start` to `End` with section `b` × `d` (or `Width` × `Height`). Doors and windows sit on `Location`, sized by `Width` and `Height`. Footings use `Width`, `Length`, and `Z top` / `Z bottom`. Values are Revit internal feet. The app labels sizes in metres and feet. Rows that cannot be placed are counted as skipped.

## Run locally

```bash
npm install
npm run dev -- --hostname 0.0.0.0 --port 4317
```

Open [http://127.0.0.1:4317](http://127.0.0.1:4317).

Orbit with the left mouse button, pan with the right button, and zoom with the scroll wheel. On a trackpad or phone, one finger orbits and two fingers pan and zoom. Once a model is drawn, the Phase Created control on the view can color Existing and Proposed separately, and can also mark Phase Demolished when that cell names a phase (None and blank are not demolished). The Structural control highlights a row when Structural is 1 or the element type is structural, and it can be used with the phase colors.

The sample files keep their original names under `public/samples/`:

- `1790789654315-GMZ-2026-0412-RS-BIM-001-01-1790788248538_1__36da.csv`
- `1790703008892-GMZ-2026-0343-RS-BIM-001-01-1790700225758_1__2df6.csv`
- `1790861177659-ModelTime1.5-1790860945337_413a.csv`
- `1788445045269-GMZ-2025-0582-RS-BIM-001-03_778f.csv`
