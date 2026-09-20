# Collector diagnostics (M1-04)

The collector keeps structured local diagnostics in `diagnostics.0.log` and `diagnostics.1.log` inside its private runtime directory. Each file is capped at 32 KiB. The active file rotates after seven days or before its next entry would exceed the size cap. The files are created with mode `0600`. Entries carry a coarse hour bucket. Expired entries are removed at startup, hourly while running, before writes, and before export; empty expired files are deleted.

Records contain an enumerated code and, when supplied by a future collector component, bounded integer `count`, `queue_age_s`, `queue_bytes`, and `duration_ms` fields. Arbitrary keys and strings are dropped before serialization. New safe reasons require adding a code to the allowlist in `packages/collector/diagnostics.ts`. No caught exception, path, request body, queue record, or credential is serialized.

Run `abisso diagnostics export` to print an inspectable JSON bundle. It contains only the content-free collector status and validated log records. Export reads only the two named log files; it never reads queue or Keychain data. The final bundle passes a structural allowlist and prohibited-content scan before output. A failed scan returns `diagnostics_unavailable`. Export is local and user-invoked; there is no automatic upload.

HTTP error responses carry a server-generated `x-correlation-id`. The matching server log line contains only that ID, an allowlisted error code, HTTP status, and elapsed time rounded down to 100 ms. Collector crashes write a fixed code to stderr and the local diagnostic log, without a stack trace or exception text.
