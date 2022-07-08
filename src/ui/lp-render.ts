import { EditorView, ViewUpdate, Decoration, ViewPlugin, DecorationSet } from "@codemirror/view";
import { EditorSelection, Range } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import {DataviewSettings} from "../settings";
//import { FullIndex } from "../data-index";
//import { Fields } from "../expression/field";
//import { tryOrPropogate } from "../util/normalize";
//import { executeInline } from "../query/engine";
//import {renderErrorPre, renderValue} from "./render";
import {editorLivePreviewField} from "obsidian";
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

/*
class InlineWidget extends WidgetType {
    constructor(readonly markdown: string, readonly filePath: string, readonly index: FullIndex, readonly settings: DataviewSettings) {
        super();
    }
    //@ts-ignore
    eq(other: InlineWidget): boolean {
        return other.markdown === this.markdown;
    }

    //@ts-ignore
    async toDOM(view: EditorView): Promise<HTMLElement> {
        console.log('toDom')

        return await renderMd(this.markdown, this.filePath, this.index, this.settings)
    }
}
*/


/*
function parseCodeBlocks(text: string) {

}
*/

function inlineRender(view: EditorView, dvSettings: DataviewSettings) {

    const widgets: Range<Decoration>[] = []
    const selection = view.state.selection;

    //@ts-ignore
    for (const { from, to } of view.visibleRanges) {

        syntaxTree(view.state).iterate({ from, to, enter: ({node}) => {
            const type = node.type;
            const from = node.from;
            const to = node.to;
            if (type.name !== "formatting_formatting-code_inline-code") {return}
            console.log(node, from, to)
            const bounds = getInlineCodeBounds(view, to);
            if (!bounds) return;
            console.log("bound", bounds)


            const inlineDV = view.state.doc.sliceString(bounds.start, bounds.end);
            console.log("inlineDV", inlineDV)

            const activeFile = app.workspace.getActiveFile();
            if (!activeFile) return;
            // @ts-ignore
            const index = app.plugins.plugins['dataview'].api.index;
            // @ts-ignore
            const settings = app.plugins.plugins['dataview'].api.settings;
            const start = bounds.start;
            const end = bounds.end;
            if (selectionAndRangeOverlap(selection, start, end)) return;

                //const symbol = renderMd(inlineDv, activeFile.path, index, settings)

                if (start === end) {
                    return}

/*
                    widgets.push(
                        Decoration.replace({
                            // @ts-ignore
                            widget: new InlineWidget(inlineDV, activeFile.path, index, settings),
                            inclusive: false,
                            block: false,
                        }).range(start, end)
                    );
*/

            }

        });
    }
    console.log("widgets", widgets)

    return Decoration.set(widgets, true)
}



export function inlinePlugin(settings: DataviewSettings) {
    return ViewPlugin.fromClass(class {
        decorations: DecorationSet

        constructor(view: EditorView) {
            this.decorations = inlineRender(view, settings)
        }

        update(update: ViewUpdate) {
            //@ts-ignore
            if (!update.state.field(editorLivePreviewField)) {
                this.decorations = Decoration.none;
                return;
            }
            if (update.docChanged || update.viewportChanged || update.selectionSet)
                this.decorations = inlineRender(update.view, settings)
        }
    }, {decorations: v => v.decorations,});
}
