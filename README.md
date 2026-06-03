# @plurnk/plurnk-mimetypes-text-dockerfile

`text/x-dockerfile` mimetype handler for the [plurnk](https://github.com/plurnk) ecosystem. Tier 2 — uses the [camdencheek/tree-sitter-dockerfile](https://github.com/camdencheek/tree-sitter-dockerfile) grammar built to WASM and shipped pre-built in this package (52 KB).

## install

```
npm i @plurnk/plurnk-mimetypes-text-dockerfile
```

No build tools required at install time. The `dockerfile.wasm` artifact is included.

## what it does

Three channels per the framework's #10 contract:

- **symbols** (`extractRaw` / `preview`) — multi-stage builds surface each `FROM ... AS <name>` stage as a `module`; ARG declarations and ENV/LABEL pair names surface as `constant` symbols. Imperative instructions (RUN, COPY, CMD, ENTRYPOINT, WORKDIR, EXPOSE, USER, etc.) don't produce symbols — they have no name to navigate to. The model can still find them via regex or deep-json queries.
- **deep-json** (`deepJson`) — inherited from `TreeSitterExtractor`: full named-children walk of the Dockerfile parse tree. jsonpath queries like `$..children[?(@.type=='run_instruction')]` find every RUN, `$..children[?(@.type=='copy_instruction')]` finds every COPY, etc.
- **deep-xml** — framework-projected from deep-json.

Registers as `text/x-dockerfile` with extensions `.dockerfile` and exact filenames `Dockerfile` and `Containerfile`.

## coverage

Validated against real-world Dockerfiles including BuildKit syntax. The grammar handles standard and multi-stage builds cleanly; advanced BuildKit features (`--mount=type=secret`, `COPY --parents` from the dockerfile/1.7-labs syntax) may produce localized parse warnings but symbol extraction continues to work.

## the grammar pin

`.dockerfile-grammar-pin` records the upstream commit SHA `dockerfile.wasm` is built from. `scripts/build-wasm.mjs` builds it; `scripts/verify-wasm.mjs` rebuilds and byte-compares.

## license

MIT.
