import { describe, it } from "node:test";
import assert from "node:assert/strict";
import TextDockerfile from "./TextDockerfile.ts";

const metadata = {
    mimetype: "text/x-dockerfile",
    glyph: "🐳",
    extensions: [".dockerfile", "Dockerfile", "Containerfile"] as const,
};

const h = () => new TextDockerfile(metadata);

describe("TextDockerfile — stages", () => {
    it("named multi-stage build surfaces each stage as a module", async () => {
        const src = "FROM node:22 AS builder\nRUN npm ci\nFROM node:22 AS runtime\nCOPY --from=builder /app .\n";
        const syms = await h().extractRaw(src);
        const stages = syms.filter((s) => s.kind === "module");
        assert.deepEqual(stages.map((s) => s.name), ["builder", "runtime"]);
    });

    it("anonymous FROM gets a stage_<index> name", async () => {
        const syms = await h().extractRaw("FROM node:22\nRUN npm ci\n");
        const stage = syms.find((s) => s.kind === "module");
        assert.equal(stage?.name, "stage_0");
    });
});

describe("TextDockerfile — declarations", () => {
    it("ARG → constant", async () => {
        const syms = await h().extractRaw("ARG NODE_VERSION=22\nARG IMAGE\n");
        assert.equal(syms.find((s) => s.name === "NODE_VERSION")?.kind, "constant");
        assert.equal(syms.find((s) => s.name === "IMAGE")?.kind, "constant");
    });

    it("ENV with single pair → constant per name", async () => {
        const syms = await h().extractRaw("ENV NODE_ENV=production\n");
        assert.equal(syms.find((s) => s.name === "NODE_ENV")?.kind, "constant");
    });

    it("ENV with multiple pairs → constant per pair", async () => {
        const syms = await h().extractRaw('ENV NODE_ENV="production" PORT=3000\n');
        assert.equal(syms.find((s) => s.name === "NODE_ENV")?.kind, "constant");
        assert.equal(syms.find((s) => s.name === "PORT")?.kind, "constant");
    });

    it("LABEL with multiple pairs → constant per key, quotes stripped", async () => {
        const syms = await h().extractRaw('LABEL k1="v1" k2="v2"\n');
        assert.equal(syms.find((s) => s.name === "k1")?.kind, "constant");
        assert.equal(syms.find((s) => s.name === "k2")?.kind, "constant");
    });

    it("OCI label keys with dotted notation", async () => {
        const src = 'LABEL org.opencontainers.image.source="https://github.com/example/app"\n';
        const syms = await h().extractRaw(src);
        assert.equal(syms.find((s) => s.name === "org.opencontainers.image.source")?.kind, "constant");
    });
});

describe("TextDockerfile — imperative instructions", () => {
    it("RUN/COPY/CMD/ENTRYPOINT/WORKDIR don't surface as symbols", async () => {
        const src = "FROM node:22\nWORKDIR /app\nCOPY . .\nRUN npm ci\nCMD [\"node\", \"server.js\"]\n";
        const syms = await h().extractRaw(src);
        // Only the FROM stage surfaces.
        const nonStage = syms.filter((s) => s.kind !== "module");
        assert.deepEqual(nonStage, []);
    });
});

describe("TextDockerfile — full real-world fixtures", () => {
    it("simple single-stage app Dockerfile", async () => {
        const src = "FROM node:22-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci --omit=dev\nCOPY . .\nEXPOSE 3000\nCMD [\"node\", \"server.js\"]\n";
        const syms = await h().extractRaw(src);
        // One stage (anonymous), no ARGs/ENVs/LABELs.
        assert.equal(syms.length, 1);
        assert.equal(syms[0].kind, "module");
    });

    it("multi-stage build with ARG + named stages", async () => {
        const src = [
            "ARG NODE_VERSION=22",
            "FROM node:${NODE_VERSION}-alpine AS builder",
            "WORKDIR /build",
            "COPY package*.json ./",
            "RUN npm ci",
            "FROM node:${NODE_VERSION}-alpine AS runtime",
            "WORKDIR /app",
            "COPY --from=builder /build/dist ./dist",
            "USER node",
            "ENTRYPOINT [\"node\", \"dist/server.js\"]",
        ].join("\n");
        const syms = await h().extractRaw(src);
        assert.equal(syms.find((s) => s.name === "NODE_VERSION")?.kind, "constant");
        assert.equal(syms.find((s) => s.name === "builder")?.kind, "module");
        assert.equal(syms.find((s) => s.name === "runtime")?.kind, "module");
    });
});

describe("TextDockerfile — error handling", () => {
    it("empty input → []", async () => {
        assert.deepEqual(await h().extractRaw(""), []);
    });

    it("doesn't throw on malformed source", async () => {
        await assert.doesNotReject(h().extractRaw("FROM ((( broken"));
    });

    it("binary content → []", async () => {
        assert.deepEqual(await h().extractRaw(new Uint8Array([1, 2, 3])), []);
    });
});

describe("TextDockerfile — deep-json channel", () => {
    it("returns parse tree with native node types", async () => {
        const tree = await h().deepJson("FROM node:22\n") as { type: string; children?: unknown[] };
        assert.equal(tree.type, "source_file");
        assert.ok(Array.isArray(tree.children));
    });
});
