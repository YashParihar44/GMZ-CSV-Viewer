export type SampleModel = {
  id: string;
  title: string;
  file: string;
};

export const SAMPLES: SampleModel[] = [
  {
    id: "0412",
    title: "GMZ-2026-0412",
    file: "1790789654315-GMZ-2026-0412-RS-BIM-001-01-1790788248538_1__36da.csv",
  },
  {
    id: "0343",
    title: "GMZ-2026-0343",
    file: "1790703008892-GMZ-2026-0343-RS-BIM-001-01-1790700225758_1__2df6.csv",
  },
  {
    id: "model-time",
    title: "ModelTime 1.5",
    file: "1790861177659-ModelTime1.5-1790860945337_413a.csv",
  },
];

export function sampleUrl(file: string): string {
  return `/samples/${file}`;
}
