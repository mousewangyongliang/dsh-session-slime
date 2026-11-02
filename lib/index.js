/**
 * dsh-session-slime — host half.
 *
 * The feature is purely a client-side decoration, so this entry only exists to
 * name the package: the host's client-module scan resolves a loader row's
 * specifier to a package root and reads \`dsh.client\` from it. No services, no
 * configuration.
 */
export const name = "dsh-session-slime";

export function apply() {}
