const FT_TO_M = 0.3048;

export function feetToMetres(feet: number): number {
  return feet * FT_TO_M;
}

/** Length label for the properties panel: metric plus the file's feet. */
export function formatLength(feet: number): string {
  const metres = feet * FT_TO_M;
  const abs = Math.abs(metres);
  if (abs < 1) {
    return `${Math.round(metres * 1000)} mm (${feet.toFixed(3)} ft)`;
  }
  return `${metres.toFixed(3)} m (${feet.toFixed(2)} ft)`;
}

/** Short metric label for a 3D dimension line. */
export function formatLengthShort(feet: number): string {
  const metres = feet * FT_TO_M;
  if (Math.abs(metres) < 1) return `${Math.round(metres * 1000)} mm`;
  return `${metres.toFixed(2)} m`;
}

export function formatArea(squareFeet: number): string {
  const m2 = squareFeet * 0.09290304;
  return `${m2.toFixed(2)} m² (${squareFeet.toFixed(1)} ft²)`;
}

export function formatVolume(cubicFeet: number): string {
  const m3 = cubicFeet * 0.0283168466;
  return `${m3.toFixed(3)} m³ (${cubicFeet.toFixed(1)} ft³)`;
}
