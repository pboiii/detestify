// Mutation capability stub (alpha): availability is probed inertly and is
// always absent. Real mutation tooling is deliberately not integrated; the
// seam stays for a future provider behind the same negotiation contract.

import type { CapabilityProbe } from "../coverage/index.js";

/** Probe mutation-evidence availability without executing anything. */
export function probeMutation(): CapabilityProbe {
  return {
    available: false,
    reason:
      "Mutation evidence integration is not implemented in the alpha; no mutation run was performed.",
  };
}
