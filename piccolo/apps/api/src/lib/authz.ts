/**
 * "One tender, one owner": every mutation that touches a specific
 * tender's data must go through this same check - an admin, or the
 * tender's own owner, and nobody else. Used consistently across
 * tenders/gates/returnables/extractions/completeness so a route can't
 * quietly skip it the way routes/gates.ts and routes/returnables.ts
 * originally did (see SECURITY.md "broken access control fix").
 */
export function isOwnerOrAdmin(user: { id: string; role: string }, tenderOwnerId: string | null): boolean {
  return user.role === "admin" || (tenderOwnerId !== null && user.id === tenderOwnerId);
}
