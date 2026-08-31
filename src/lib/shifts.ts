export type ShiftDraft = {
  key: string;
  nameAr: string;
  nameEn: string;
  startMin: number;
  endMin: number;
  sortOrder: number;
  capacity?: number | null;
};

/** Split a working window into morning/evening only when that window actually spans midday. Times stay business-specific. */
export function deriveShiftsFromWindow(startMin: number, endMin: number): ShiftDraft[] {
  const split = 14 * 60;
  if (endMin <= startMin) {
    return [{ key: "day", nameAr: "اليوم", nameEn: "Day", startMin: 10 * 60, endMin: 20 * 60, sortOrder: 0 }];
  }
  if (startMin < split && endMin > split) {
    return [
      { key: "morning", nameAr: "صباح", nameEn: "Morning", startMin, endMin: split, sortOrder: 0 },
      { key: "evening", nameAr: "مساء", nameEn: "Evening", startMin: split, endMin, sortOrder: 1 },
    ];
  }
  if (endMin <= split) {
    return [{ key: "morning", nameAr: "صباح", nameEn: "Morning", startMin, endMin, sortOrder: 0 }];
  }
  return [{ key: "evening", nameAr: "مساء", nameEn: "Evening", startMin, endMin, sortOrder: 0 }];
}

export function typicalWindow(hours: Array<{ startMin: number; endMin: number }>) {
  if (!hours.length) return { startMin: 10 * 60, endMin: 20 * 60 };
  return {
    startMin: Math.min(...hours.map((h) => h.startMin)),
    endMin: Math.max(...hours.map((h) => h.endMin)),
  };
}
