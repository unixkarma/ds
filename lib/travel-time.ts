// ZIP-prefix heuristic for estimating travel time between two addresses.
// No external API — picks a minutes value based on how close the ZIPs are,
// then the caller takes max(estimate, instructor.buffer_minutes).
//
// Heuristic table:
//   same 5-digit ZIP    →  5 min
//   same 3-digit prefix → 15 min
//   same 2-digit prefix → 30 min
//   different / unknown → 45 min
//
// If either ZIP can't be extracted, returns null and the caller should fall
// back to the instructor's buffer_minutes alone (no hard block).

export const TRAVEL_SAME_ZIP_MIN = 5
export const TRAVEL_SAME_3DIGIT_MIN = 15
export const TRAVEL_SAME_2DIGIT_MIN = 30
export const TRAVEL_DIFFERENT_MIN = 45

export function extractZip(address: string | null | undefined): string | null {
  if (!address) return null
  const matches = address.match(/\b(\d{5})(?:-\d{4})?\b/g)
  if (!matches || matches.length === 0) return null
  // Take the LAST 5-digit group — street numbers come first, ZIP comes last
  return matches[matches.length - 1].slice(0, 5)
}

export function estimateTravelMinutesFromZips(
  zipA: string | null,
  zipB: string | null
): number | null {
  if (!zipA || !zipB) return null
  if (zipA === zipB) return TRAVEL_SAME_ZIP_MIN
  if (zipA.slice(0, 3) === zipB.slice(0, 3)) return TRAVEL_SAME_3DIGIT_MIN
  if (zipA.slice(0, 2) === zipB.slice(0, 2)) return TRAVEL_SAME_2DIGIT_MIN
  return TRAVEL_DIFFERENT_MIN
}

export function estimateTravelMinutes(
  fromAddress: string | null | undefined,
  toAddress: string | null | undefined
): number | null {
  return estimateTravelMinutesFromZips(extractZip(fromAddress), extractZip(toAddress))
}
