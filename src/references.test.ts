import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertHandlerConformance } from "@plurnk/plurnk-mimetypes/conformance";
import TextDockerfile from "./TextDockerfile.ts";

const metadata = {
    mimetype: "text/x-dockerfile",
    glyph: "🐳",
    extensions: [".dockerfile", "Dockerfile", "Containerfile"] as const,
};
const h = () => new TextDockerfile(metadata);

// Multi-stage build: runtime depends on builder + deps.
const SRC = [
    "# deploy the widget",                          // comment decoy
    "FROM node:20 AS builder",
    "WORKDIR /app",
    "COPY . .",
    "RUN npm ci && npm run build",
    "",
    "FROM node:20 AS deps",
    "RUN npm ci --omit=dev",
    "",
    "FROM gcr.io/distroless/nodejs20 AS runtime",
    "COPY --from=builder /app/dist /app",
    "COPY --from=deps /app/node_modules /app/node_modules",
    'CMD ["server.js"]',
].join("\n") + "\n";

describe("TextDockerfile — references (build graph)", () => {
    it("COPY --from lifts the stage name and resolves to the enclosing stage", async () => {
        const refs = await h().references(SRC);
        const fromBuilder = refs.find((r) => r.name === "builder" && r.container === "runtime");
        const fromDeps = refs.find((r) => r.name === "deps" && r.container === "runtime");
        assert.ok(fromBuilder, "COPY --from=builder → use builder, container runtime");
        assert.ok(fromDeps, "COPY --from=deps → use deps, container runtime");
        assert.equal(fromBuilder!.kind, "use");
        // The lifted name's column points at `builder`, not the `--from=` flag.
        const line = SRC.split("\n")[fromBuilder!.line - 1];
        assert.equal(line.slice(fromBuilder!.column - 1, fromBuilder!.column - 1 + 7), "builder");
    });

    it("FROM <stage> joins to a stage; external base images are dead rows", async () => {
        const refs = await h().references(SRC);
        // Every stage's FROM base name surfaces as a use.
        assert.ok(refs.some((r) => r.name === "node" && r.container === "builder"));
        assert.ok(refs.some((r) => r.name === "gcr.io/distroless/nodejs20" && r.container === "runtime"));
    });

    it("passes the SPEC §16 conformance invariants", async () => {
        await assertHandlerConformance(h(), {
            source: SRC,
            decoyNames: ["widget", "server.js", "WORKDIR", "npm"],
            expectJoins: [
                { refName: "builder", container: "runtime" },
                { refName: "deps", container: "runtime" },
            ],
            expectRefs: [
                { name: "builder", kind: "use" },
                { name: "deps", kind: "use" },
                { name: "node", kind: "use" },
            ],
        });
    });

    it("a single-stage file with no cross-stage edges still parses cleanly", async () => {
        const refs = await h().references("FROM alpine:3.20\nRUN apk add curl\n");
        // Only the base-image use; no joins, no crash.
        assert.deepEqual(refs.map((r) => r.name), ["alpine"]);
    });
});
