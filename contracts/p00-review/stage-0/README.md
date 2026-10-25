# Stage 0 historical archive

Source revision: `3e2c51dacf3f5f74c78958b3048a857364521eea`.
Captured for [P02 spec #5](https://github.com/Kamunggay/YSP/issues/5) on 25 October 2026.

The `contracts/` tree contains every artifact pinned by the original P00 manifest,
plus its original reconciliation, validation, manifest and walkthrough records.
Paths inside those records resolve relative to this archived tree. Contents and
recorded review states are preserved; this is not a rerun or a new acceptance claim.
The project owner's statement that Stage 0 is complete remains the starting point.

The historical manifest uses SHA-256 over UTF-8 with CRLF normalized to LF.
Its own digest is
`3ad7b9e5321b12b6b90a17d57a3dcb60e64dddfbb02f5902adf43ce04448ffc5`.
The normal transport test entry verifies those identities against this archive.
Live lookup operations, session scheme, server scope and all original transport
definitions are compared explicitly with the archive. New operations may be added
without changing this historical inventory or recorded checks.

Current validation and its limitations are described in the
[operation validator guide](../../transport/validation/README.md).
