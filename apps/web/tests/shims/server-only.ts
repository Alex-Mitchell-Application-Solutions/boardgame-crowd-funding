// No-op replacement for the `server-only` package, used by Vitest so that
// importing server-only modules from a test runner doesn't blow up. The
// real package's job is preventing accidental client-side imports — in a
// Node test environment that protection isn't relevant.
export {};
