/**
 * Per the cross-cutting "private-first" guardrail: every song defaults to
 * `private`. The public bucket is feature-flagged until the licensing
 * question is resolved (Phase 6).
 */
export const VISIBILITY = ['private', 'shared', 'public'] as const;
export type Visibility = (typeof VISIBILITY)[number];

export const ROLES = ['user', 'contributor', 'admin'] as const;
export type Role = (typeof ROLES)[number];
