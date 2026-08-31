// Expiry detector: ONLY explicit `.detestify/expiry.json` markers, never
// inference. An expired declared record is a HISTORICAL signal (the
// independent evidence class of ADR-006); the removal condition still has to
// be verified by the planner and a human.

import { readContainedRegularFile } from "../../repository/paths.js";
import {
  detectionId,
  type CleanupDetection,
  type DetectorResult,
} from "./types.js";

export const EXPIRY_MARKER_PATH = ".detestify/expiry.json";
const EXPIRY_MARKER_SIZE_LIMIT = 1024 * 1024;

const BASE_LIMITATIONS = [
  "Only explicit expiry markers are read; expiry is never inferred.",
  "The record's removal condition is not verified by this detector.",
];

interface ExpiryRecord {
  readonly test_path: string;
  readonly expires_after: string;
  readonly removal_condition: string | null;
  readonly owner: string | null;
}

function parseRecords(raw: string): ExpiryRecord[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  const records = (parsed as { records?: unknown }).records;
  if (!Array.isArray(records)) {
    return null;
  }
  const result: ExpiryRecord[] = [];
  for (const entry of records) {
    if (typeof entry !== "object" || entry === null) {
      return null;
    }
    const record = entry as Record<string, unknown>;
    if (
      typeof record["test_path"] !== "string" ||
      typeof record["expires_after"] !== "string"
    ) {
      return null;
    }
    result.push({
      test_path: record["test_path"],
      expires_after: record["expires_after"],
      removal_condition:
        typeof record["removal_condition"] === "string"
          ? record["removal_condition"]
          : null,
      owner: typeof record["owner"] === "string" ? record["owner"] : null,
    });
  }
  return result;
}

/**
 * @param todayIso Current date as `YYYY-MM-DD`; passed in so the detector is
 * deterministic. ISO dates compare lexically.
 */
export async function detectExpiry(
  repoRoot: string,
  todayIso: string,
): Promise<DetectorResult> {
  let raw: string;
  try {
    raw = (
      await readContainedRegularFile(
        repoRoot,
        EXPIRY_MARKER_PATH,
        EXPIRY_MARKER_SIZE_LIMIT,
      )
    ).toString("utf8");
  } catch {
    return {
      detector: "expiry",
      detections: [],
      limitations: [
        ...BASE_LIMITATIONS,
        `No readable regular ${EXPIRY_MARKER_PATH} marker file present.`,
      ],
    };
  }

  const records = parseRecords(raw);
  if (records === null) {
    return {
      detector: "expiry",
      detections: [],
      limitations: [
        ...BASE_LIMITATIONS,
        `${EXPIRY_MARKER_PATH} is malformed; no expiry records were used.`,
      ],
    };
  }

  const detections: CleanupDetection[] = [];
  for (const record of records) {
    if (record.expires_after >= todayIso) {
      continue;
    }
    const condition =
      record.removal_condition === null
        ? "No removal condition declared."
        : `Declared removal condition: ${record.removal_condition}`;
    detections.push({
      id: detectionId("expiry", [record.test_path]),
      detector: "expiry",
      test_paths: [record.test_path],
      signals: [
        {
          id: `ev-expiry-record:${record.test_path}`,
          kind: "historical",
          detail: `Explicit expiry record (owner: ${record.owner ?? "undeclared"}) expired ${record.expires_after}. ${condition}`,
        },
      ],
      rationale:
        "A declared expiry record for this test has passed its expires_after date.",
      limitations: [
        ...BASE_LIMITATIONS,
        "The declared removal condition must be confirmed before any action.",
      ],
    });
  }

  detections.sort((a, b) => a.id.localeCompare(b.id));
  return { detector: "expiry", detections, limitations: BASE_LIMITATIONS };
}
