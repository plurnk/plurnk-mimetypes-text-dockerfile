import type { RefsCaptureNode, RefsQuery, RefsQueryCapture, TreeSitterNode } from "@plurnk/plurnk-mimetypes";

// References query for tree-sitter-dockerfile (dev-DSL grind). A Dockerfile is
// a build dependency graph: a multi-stage file's stages depend on each other.
//
//   - FROM <image>            the base image name of every stage. Captured
//                             verbatim; joins to a prior stage's AS alias when
//                             it names a stage (`FROM builder AS test`), else
//                             it is an external base image (`FROM node:20`) — a
//                             dead row that never name-joins, not noise (the
//                             make/terraform prerequisite pattern).
//   - COPY --from=<stage>     the `--from=` flag is a single `param` leaf with
//                             text `--from=builder`, so the stage name must be
//                             lifted out into an honest RefsCaptureNode (issue
//                             #26) — no tree-sitter capture can name the
//                             substring on its own.
//
// Both classify as `use` (declared dependencies, the legitimate use kind per
// SPEC §16). Containers resolve to the enclosing stage (its module spans the
// stage body), so an edge reads stage →use→ stage. RUN --mount=…,from=… is a
// rarer stage edge, deferred to keep v1 to the two common shapes.
export const refsQuery = `
(from_instruction (image_spec (image_name) @ref.use))

(copy_instruction (param) @copy.from)
`;

const FROM_FLAG = "--from=";

// Raw web-tree-sitter query surface we consume (captures()). Duck-typed
// locally (framework pattern) so this package's types don't depend on
// web-tree-sitter's.
export interface DockerRawQuery {
    captures(node: TreeSitterNode): ReadonlyArray<{ name: string; node: TreeSitterNode }>;
}

export default class DockerfileRefsQuery implements RefsQuery {
    readonly #query: DockerRawQuery;

    constructor(query: DockerRawQuery) {
        this.#query = query;
    }

    captures(node: TreeSitterNode): RefsQueryCapture[] {
        const out: RefsQueryCapture[] = [];
        for (const c of this.#query.captures(node)) {
            if (c.name === "ref.use") {
                out.push({ name: "ref.use", node: c.node });
                continue;
            }
            // @copy.from — a COPY flag param; keep only `--from=<stage>` and
            // lift the stage name (with its true position) into a span node.
            if (c.name === "copy.from" && c.node.text.startsWith(FROM_FLAG)) {
                const value = c.node.text.slice(FROM_FLAG.length);
                if (value.length === 0) continue;
                const node: RefsCaptureNode = {
                    text: value,
                    startPosition: {
                        row: c.node.startPosition.row,
                        column: c.node.startPosition.column + FROM_FLAG.length,
                    },
                    endPosition: c.node.endPosition,
                };
                out.push({ name: "ref.use", node });
            }
        }
        return out;
    }
}
