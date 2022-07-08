import {EditorView, ViewUpdate, Decoration, ViewPlugin, DecorationSet, WidgetType} from "@codemirror/view";
import { EditorSelection, Range } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import {DataviewSettings} from "../settings";
import { FullIndex } from "../data-index";
//import { Fields } from "../expression/field";
//import { executeInline } from "../query/engine";
//import {renderErrorPre, renderValue} from "./render";
import {Component, editorLivePreviewField} from "obsidian";
import {asyncEvalInContext, DataviewInlineApi} from "../api/inline-api";
import {DataviewApi} from "../api/plugin-api";
import {tryOrPropogate} from "../util/normalize";
import {parseField} from "../expression/parse";
import {executeInline} from "../query/engine";
// import {FullIndex} from "../data-index";
//import variable = Fields.variable;
//import {parseQuery} from "../query/parse";
//import literal = Fields.literal;

/*
async function renderMd(
    fieldText: string,
    origin: string,
    index: FullIndex,
    settings: QuerySettings
):Promise<HTMLElement> {
    const field = literal(fieldText.slice(2));
    let result = tryOrPropogate(() => executeInline(field, origin, index, settings));
    console.log("result", result)
    //@ts-ignore
    //console.log(await app.plugins.plugins.dataview.api.query(fieldText, origin))
    if (!result.successful) {
        const errorbox = createDiv();
        return renderErrorPre(errorbox, "Dataview (for inline query '" + fieldText + "'): " + result.error);
    } else {
        let el = createDiv()
        let comp = new Component()
        //@ts-ignore
        await renderValue(field, el, origin, comp, settings, false)
        return el
    }
}

*/

function selectionAndRangeOverlap(selection: EditorSelection, rangeFrom:
    number, rangeTo: number) {

    for (const range of selection.ranges) {
        if ((range.from <= rangeTo) && (range.to) >= rangeFrom) {
            return true;
        }
    }

    return false;
}


// also returns text between inline code, so there alwasy needs to be a check whether the correct prefix is used.
function getInlineCodeBounds(view: EditorView, pos?: number): {start: number, end: number} | null {
    const text = view.state.doc.toString()
    if (typeof pos === "undefined") {
        pos = view.state.selection.main.from;
    }
    let left = text.lastIndexOf('`', pos)
    const right = text.indexOf('`', pos)
    // no backtick before or after the current backtick
    if (left === -1 || right === -1) return null;
    const leftNewline = text.lastIndexOf('\n', pos)
    const rightNewline = text.indexOf('\n', pos)

    // start or end of document w/o new lines
    if (leftNewline === -1 || rightNewline === -1) {
        return {start: left , end: right+1}
    }

    if (leftNewline > left || rightNewline < right) return null;

    return {start: left , end: right+1}
}


//interface replacement {
//    start: number;
//    end: number;
//}
//
//function getExpressions(text: string, view: EditorView, bounds: {start: number, end: number}): {start: number, end: number}[] {
//    //@ts-ignore
//    const inlineQueryPrefix = app.plugins.plugins.dataview.api.settings.inlineQueryPrefix
//
//    const regexStr = `\`${inlineQueryPrefix}.+?\``
//    const regex = new RegExp(regexStr, "g")
//
//    const matches = [...text.matchAll(regex)]
//    const expressions: replacement[] = [];
//    for (const match of matches) {
//        const
//    }
//
//}


class InlineWidget extends WidgetType {
    constructor(readonly markdown: string) {
        super();
    }
    eq(other: InlineWidget): boolean {
        return other.markdown === this.markdown;
    }

    toDOM(view: EditorView): HTMLElement {
        console.log('toDom')
        const el = createSpan({
            text: this.markdown
        })

        return el;
    }
}



/*
function parseCodeBlocks(text: string) {

}
*/

function inlineRender(view: EditorView, index: FullIndex, dvSettings: DataviewSettings, api: DataviewApi) {

    const widgets: Range<Decoration>[] = []
    const selection = view.state.selection;

    //@ts-ignore
    for (const { from, to } of view.visibleRanges) {

        syntaxTree(view.state).iterate({ from, to, enter: ({node}) => {
            // settings and index aren't initialised yet
            if (!dvSettings || !index) return;
            const type = node.type;
            const from = node.from;
            const to = node.to;
            if (type.name !== "formatting_formatting-code_inline-code") {return}
            console.log(node, from, to)
            const bounds = getInlineCodeBounds(view, to);
            if (!bounds) return;
            console.log("bound", bounds);
            const text = view.state.doc.sliceString(bounds.start + 1, bounds.end -1);
            console.log(text);
            let code: string;
            const PREAMBLE: string = "const dataview = this;const dv=this;";
            let result: string = "";
            const currentFile = app.workspace.getActiveFile();
            if (!currentFile) return;
            if (dvSettings.inlineQueryPrefix.length > 0 && text.startsWith(dvSettings.inlineQueryPrefix)) {
                code = text.substring(dvSettings.inlineQueryPrefix.length).trim()
                const field = tryOrPropogate(() => parseField(code))
                if (!field.successful) {
                    result = `Dataview (inline field '${code}'): ${field.error}`;
                } else {
                    const fieldValue = field.value;
                    const intermediateResult = tryOrPropogate(() => executeInline(fieldValue, currentFile.path, index, dvSettings));
                    if (!intermediateResult.successful) {
                        result = `Dataview (for inline query '${fieldValue}'): ${intermediateResult.error}`;
                    } else {
                        if (intermediateResult.value) {
                            result = intermediateResult.value.toString();
                        }
                    }
                }
            } else if (dvSettings.inlineJsQueryPrefix.length > 0 && text.startsWith(dvSettings.inlineJsQueryPrefix)) {
                if (dvSettings.enableInlineDataviewJs) {
                    code = text.substring(dvSettings.inlineJsQueryPrefix.length).trim()
                    try {
                        const el = createDiv();
                        if (currentFile) {
                            asyncEvalInContext(PREAMBLE + code, new DataviewInlineApi(api, null as unknown as  Component, el, currentFile.path)).then( (value) => {
                                    result = value;
                                }
                            )
                        }
                    } catch (e) {
                        result = `Dataview (for inline JS query '${code}'): ${e}`;
                    }
                } else {
                    result = "(disabled; enable in settings)";
                }

            } else {
                return;
            }

            // at this point bounds contains the position we want to replace and
            // result contains the text with which we want to replace it
            console.log(result);


/*            const inlineDV = view.state.doc.sliceString(bounds.start, bounds.end);
            console.log("inlineDV", inlineDV)

            const activeFile = app.workspace.getActiveFile();
            if (!activeFile) return;
            // @ts-ignore
            //const index = app.plugins.plugins['dataview'].api.index;
            // @ts-ignore
            const settings = app.plugins.plugins['dataview'].api.settings;
            */
            const start = bounds.start;
            const end = bounds.end;
            if (selectionAndRangeOverlap(selection, start, end)) return;

                //const symbol = renderMd(inlineDv, activeFile.path, index, settings)

            widgets.push(
                Decoration.replace({
                    // @ts-ignore
                    widget: new InlineWidget(result, currentFile.path, index, dvSettings),
                    inclusive: false,
                    block: false,
                }).range(start, end)
            );

            }

        });
    }
    console.log("widgets", widgets)

    return Decoration.set(widgets, true)
}



export function inlinePlugin(index: FullIndex, settings: DataviewSettings, api: DataviewApi) {
    return ViewPlugin.fromClass(class {
        decorations: DecorationSet

        constructor(view: EditorView) {
            this.decorations = inlineRender(view, index, settings, api)
        }

        update(update: ViewUpdate) {
            //@ts-ignore
            if (!update.state.field(editorLivePreviewField)) {
                this.decorations = Decoration.none;
                return;
            }
            if (update.docChanged || update.viewportChanged || update.selectionSet)
                this.decorations = inlineRender(update.view, index, settings, api)
        }
    }, {decorations: v => v.decorations,});
}
