import { describe, it } from "node:test";
import { assertQueryLineConformance } from "@plurnk/plurnk-mimetypes/conformance";
import Handler from "./TextDockerfile.ts";

// #41: structural matches carry source-line spans (coverage gate).
const h = new Handler({ mimetype: "text/x-dockerfile", glyph: "🐳", extensions: [".dockerfile", "Dockerfile", "Containerfile"] });

describe("#41 query-line conformance", () => {
    it("every structural match carries a source-line span", async () => {
        await assertQueryLineConformance(h, [
            { source: "FROM alpine:3\nWORKDIR /app\nRUN echo hi\nCMD [\"sh\"]\n", dialect: "jsonpath", pattern: "$..*" },
        ]);
    });
});
