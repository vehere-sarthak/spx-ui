# Typefaces

Self-hosted so the console builds and runs with no outbound network (deb / air-gapped installs).

| File | Family | Used for |
| --- | --- | --- |
| `DMSans-Variable.woff2`, `DMSans-VariableItalic.woff2` | DM Sans (100–1000) | all interface text (`font-sans`) |
| `DMMono-Regular.woff2`, `DMMono-Medium.woff2` | DM Mono (400/500) | IDs, IPs, index names, hex, counts (`font-mono`) |

Latin subset only (U+0000–00FF), pulled from Google Fonts. Both are licensed under the
SIL Open Font License 1.1. DM Mono has no bold — do not pair `font-mono` with `font-bold`;
use `font-medium`.

The product is sans-only, matching vehere-ui's theme (`fontFamily: 'DM Sans, sans-serif'`).
`DMSerifDisplay-Regular.woff2` is still on disk but is no longer loaded or referenced —
Tailwind's `font-serif` key now resolves to the DM Sans stack, so a stray `font-serif`
cannot reintroduce a serif face. Delete the file if you want it gone for good.
