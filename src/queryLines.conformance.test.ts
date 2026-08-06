import { describe, it } from "node:test";
import { assertQueryEvidenceConformance } from "@plurnk/plurnk-mimetypes/conformance";
import Handler from "./TextDockerfile.ts";

const h = new Handler({"mimetype":"text/x-dockerfile","glyph":"🐳","extensions":[".dockerfile","Dockerfile","Containerfile"]});
const src = "FROM alpine:3\nRUN echo hi\n";

describe("query-evidence conformance", () => {
    it("both structural dialects retain the exact readable root", async () => {
        const region = { startLine: 1, startColumn: 1, endLine: 3, endColumn: 1 };
        await assertQueryEvidenceConformance(h, [
            { source: src, dialect: "jsonpath", pattern: "$", verdict: "exact", expectRegions: [[region]] },
            { source: src, dialect: "xpath", pattern: "/*", verdict: "exact", expectRegions: [[region]] },
        ]);
    });
});
