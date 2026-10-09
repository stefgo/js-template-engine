/**
 * Whether a dotted kind, such as `job.failed`, matches a pattern: `job.*` matches every kind
 * below `job.`, and anything without `*` has to match exactly.
 */
export function matchesKindPattern(kind: string, pattern: string): boolean {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp(`^${escaped}$`).test(kind);
}
