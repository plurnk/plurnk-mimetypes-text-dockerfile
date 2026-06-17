import type { MimeSymbol, TreeSitterNode } from "@plurnk/plurnk-mimetypes";

// Dockerfile SPEC §3 mapping for tree-sitter-dockerfile.
//
//   from_instruction with `as: image_alias` → module, named by the alias
//   from_instruction without alias          → module, "stage" + index
//   arg_instruction → constant (named by arg name)
//   env_instruction → constant per env_pair (named by env var)
//   label_instruction → constant per label_pair (named by label key)
//
// Everything else (RUN, COPY, CMD, ENTRYPOINT, WORKDIR, EXPOSE, USER,
// VOLUME, HEALTHCHECK, SHELL, STOPSIGNAL) is not surfaced as a symbol —
// they're imperative steps with no name to navigate to. The model can
// still find them via regex or the deep-json channel.
export function extract(root: TreeSitterNode): MimeSymbol[] {
    const out: MimeSymbol[] = [];
    let stageIndex = 0;
    // A stage `module` spans its whole BODY (its FROM line to the line before
    // the next FROM, or EOF) — not just the FROM line — so the references
    // engine resolves a `COPY --from=…` / `FROM <stage>` ref's container to the
    // stage it sits in (the source node of the build-graph edge). We patch the
    // previous stage's endLine when the next FROM opens.
    let lastStage: MimeSymbol | null = null;
    for (let i = 0; i < root.namedChildCount; i += 1) {
        const child = root.namedChild(i);
        if (!child) continue;
        switch (child.type) {
            case "from_instruction": {
                const alias = child.childForFieldName("as");
                const name = alias ? alias.text : `stage_${stageIndex}`;
                stageIndex += 1;
                if (lastStage) lastStage.endLine = child.startPosition.row; // line before this FROM
                lastStage = {
                    name,
                    kind: "module",
                    line: child.startPosition.row + 1,
                    endLine: root.endPosition.row + 1, // final stage runs to EOF until patched
                };
                out.push(lastStage);
                break;
            }
            case "arg_instruction": {
                const nameNode = child.childForFieldName("name");
                if (nameNode) {
                    out.push({
                        name: nameNode.text,
                        kind: "constant",
                        line: child.startPosition.row + 1,
                        endLine: child.endPosition.row + 1,
                    });
                }
                break;
            }
            case "env_instruction": {
                for (let j = 0; j < child.namedChildCount; j += 1) {
                    const pair = child.namedChild(j);
                    if (!pair || pair.type !== "env_pair") continue;
                    const nameNode = pair.childForFieldName("name");
                    if (nameNode) {
                        out.push({
                            name: nameNode.text,
                            kind: "constant",
                            line: pair.startPosition.row + 1,
                            endLine: pair.endPosition.row + 1,
                        });
                    }
                }
                break;
            }
            case "label_instruction": {
                for (let j = 0; j < child.namedChildCount; j += 1) {
                    const pair = child.namedChild(j);
                    if (!pair || pair.type !== "label_pair") continue;
                    const keyNode = pair.childForFieldName("key");
                    if (keyNode) {
                        out.push({
                            name: stripQuotes(keyNode.text),
                            kind: "constant",
                            line: pair.startPosition.row + 1,
                            endLine: pair.endPosition.row + 1,
                        });
                    }
                }
                break;
            }
            default:
                // imperative instructions (RUN/COPY/CMD/etc.) — no symbol
                break;
        }
    }
    return out;
}

function stripQuotes(text: string): string {
    if (text.length >= 2) {
        const first = text.charCodeAt(0);
        const last = text.charCodeAt(text.length - 1);
        if ((first === 0x22 && last === 0x22) || (first === 0x27 && last === 0x27)) {
            return text.slice(1, -1);
        }
    }
    return text;
}
