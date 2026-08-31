// Coverage capability stub (alpha): availability is probed inertly and is
// always absent. The seam stays so a real provider can replace this module
// without changing the negotiation contract in ../capabilities.ts.

export interface CapabilityProbe {
  readonly available: false;
  readonly reason: string;
}

/** Probe coverage availability without executing anything. */
export function probeCoverage(): CapabilityProbe {
  return {
    available: false,
    reason:
      "Coverage evidence integration is not implemented in the alpha; no coverage was collected.",
  };
}
