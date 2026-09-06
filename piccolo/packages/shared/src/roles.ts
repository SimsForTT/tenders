export const ROLES = ["owner", "admin"] as const;
export type Role = (typeof ROLES)[number];

/**
 * "owner" = the one person driving a given tender end to end (Phase 1's
 * "one tender, one owner" rule). "admin" can reassign owners, manage
 * platforms/users, and see everything, but gate decisions, extraction
 * verification and pricing sign-off still require the acting user to
 * authenticate as themselves - admin never signs on someone's behalf.
 */
