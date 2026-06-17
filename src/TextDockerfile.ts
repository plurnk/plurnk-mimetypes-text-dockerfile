import { TreeSitterExtractor } from "@plurnk/plurnk-mimetypes";
import type {
    HandlerContent,
    MimeRef,
    MimeSymbol,
    QueryConstructor,
    TreeSitterParser,
    TreeSitterTree,
} from "@plurnk/plurnk-mimetypes";
import { extract } from "./dockerfile.ts";
import DockerfileRefsQuery, { refsQuery } from "./DockerfileRefsQuery.ts";
import type { DockerRawQuery } from "./DockerfileRefsQuery.ts";

// text/x-dockerfile handler. Tier 2 — tree-sitter-dockerfile grammar built to
// WASM at package publish time and shipped alongside this code. The .wasm file
// lives at the package root; we resolve it via import.meta.url so the path is
// stable across consumers.
//
// Why Tier 2: camdencheek/tree-sitter-dockerfile's npm package doesn't ship
// WASM. We build it ourselves (see scripts/build-wasm.mjs +
// scripts/verify-wasm.mjs) so consumers get pure WASM at install time.
//
// Also registers as `Dockerfile` and `Containerfile` filename matches (no
// extension; the framework's discover() routes by exact filename for these).
export default class TextDockerfile extends TreeSitterExtractor {
    protected async loadParser(): Promise<TreeSitterParser> {
        const ts = await import("web-tree-sitter" as string) as {
            Parser: {
                init(): Promise<void>;
                new (): { setLanguage(lang: unknown): void; parse(content: string): unknown };
            };
            Language: {
                load(wasmPath: string): Promise<unknown>;
            };
            Query: QueryConstructor;
        };
        await ts.Parser.init();
        const wasmUrl = new URL("../dockerfile.wasm", import.meta.url);
        const lang = await ts.Language.load(wasmUrl.pathname);
        // Hand the base the Language + Query ctor for collectRefs() (#26).
        this.setQueryContext(lang, ts.Query);
        const parser = new ts.Parser();
        parser.setLanguage(lang);
        return parser as unknown as TreeSitterParser;
    }

    protected extractFromTree(tree: TreeSitterTree, _content: HandlerContent): MimeSymbol[] {
        return extract(tree.rootNode);
    }

    // References channel (SPEC §16). The build-graph edges of a multi-stage
    // file: `FROM <stage>` and `COPY --from=<stage>`, resolved to the stage
    // they sit in. The base collectRefs() owns parse/compile/run/cleanup;
    // DockerfileRefsQuery lifts the stage name out of the `--from=` flag.
    override references(content: HandlerContent): Promise<MimeRef[]> {
        return this.collectRefs(
            content,
            refsQuery,
            (root) => extract(root),
            (raw) => new DockerfileRefsQuery(raw as DockerRawQuery),
        );
    }
}
