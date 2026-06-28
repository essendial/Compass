/**
 * Small shared utilities. Currently just ID generation.
 */

/**
 * Generates a unique id string. Prefers the native crypto.randomUUID()
 * (available in modern browsers/node), and falls back to a random+timestamp
 * composite for older environments.
 */
export const uid = (): string => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return crypto.randomUUID();
    }
    return "id-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
};
