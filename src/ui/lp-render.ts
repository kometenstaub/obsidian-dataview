/*
* inspired and adapted from https://github.com/artisticat1/obsidian-latex-suite/blob/main/src/conceal.ts
*
* The original work is MIT-licensed.
*
* MIT License
*
* Copyright (c) 2022 artisticat1
*
* Permission is hereby granted, free of charge, to any person obtaining a copy
* of this software and associated documentation files (the "Software"), to deal
* in the Software without restriction, including without limitation the rights
* to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
* copies of the Software, and to permit persons to whom the Software is
* furnished to do so, subject to the following conditions:
*
* The above copyright notice and this permission notice shall be included in all
* copies or substantial portions of the Software.
*
* THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
* IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
* FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
* AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
* LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
* OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
* SOFTWARE.
*
* */


import {EditorView, ViewUpdate, Decoration, ViewPlugin, DecorationSet, WidgetType} from "@codemirror/view";
import { EditorSelection, Range } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import {DataviewSettings} from "../settings";
import { FullIndex } from "../data-index";
import {Component, editorLivePreviewField} from "obsidian";
import {asyncEvalInContext, DataviewInlineApi} from "../api/inline-api";
import {DataviewApi} from "../api/plugin-api";
import {tryOrPropogate} from "../util/normalize";
import {parseField} from "../expression/parse";
import {executeInline} from "../query/engine";

function selectionAndRangeOverlap(selection: EditorSelection, rangeFrom:
    number, rangeTo: number) {

    for (const range of selection.ranges) {
        if ((range.from <= rangeTo) && (range.to) >= rangeFrom) {
            return true;
        }
    }

    return false;
}


// also returns text between inline code, so there always needs to be a check whether the correct prefix is used.
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

    ignoreEvent(event: Event): boolean {
        return false;
    }
}


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
