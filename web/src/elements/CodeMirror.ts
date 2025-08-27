import { EVENT_THEME_CHANGE } from "#common/constants";

import { AKElement } from "#elements/Base";

import { UiThemeEnum } from "@goauthentik/api";

import YAML from "yaml";

import { css, CSSResult, html } from "lit";
import { customElement, property } from "lit/decorators.js";

export enum CodeMirrorMode {
    XML = "xml",
    JavaScript = "javascript",
    HTML = "html",
    CSS = "css",
    Python = "python",
    YAML = "yaml",
}

@customElement("ak-codemirror")
export class CodeMirrorTextarea<T> extends AKElement {
    @property({ type: Boolean })
    readOnly = false;

    @property()
    mode: CodeMirrorMode = CodeMirrorMode.YAML;

    @property()
    name?: string;

    @property({ type: Boolean })
    parseValue = true;

    private editorEl?: HTMLElement & {
        value?: string;
        language?: string;
        theme?: string;
        readonly?: boolean;
    };

    _value?: string;

    private container?: HTMLDivElement;

    static styles: CSSResult[] = [
        // Better alignment with patternfly components
        css`
            .editor-container {
                position: relative;
                min-height: 8rem;
                width: 100%;
                display: block;
                overflow: hidden;
                border: var(--pf-c-form-control--BorderWidth, 1px) solid
                    var(--pf-c-form-control--BorderColor, var(--pf-global--BorderColor--300));
                border-radius: var(--pf-c-form-control--BorderRadius, var(--pf-global--BorderRadius--sm));
                background-color: var(
                    --pf-c-form-control--BackgroundColor,
                    var(--pf-global--BackgroundColor--100)
                );
                transition: border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
            }
            .editor-container:hover {
                border-color: var(
                    --pf-c-form-control--hover--BorderColor,
                    var(--pf-global--BorderColor--200)
                );
            }
            .editor-container:focus-within {
                border-color: var(
                    --pf-c-form-control--focus--BorderColor,
                    var(--pf-global--primary-color--100)
                );
                box-shadow: var(
                    --pf-c-form-control--focus--BoxShadow,
                    0 0 0 1px var(--pf-global--primary-color--100)
                );
            }
            hey-monaco-editor,
            monaco-editor,
            .editor-fallback {
                display: block;
                width: 100%;
                height: 14rem;
                font-family: var(--pf-global--FontFamily--monospace);
                border-radius: inherit;
            }
        `,
    ];

    @property()
    set value(v: T | string) {
        if (v === null || v === undefined) {
            return;
        }
        // Value might be an object if within an iron-form, as that calls the getter of value
        // in the beginning and the calls this setter on reset
        let textValue = v;
        if (!(typeof v === "string" || v instanceof String)) {
            switch (this.mode.toLowerCase()) {
                case "yaml":
                    textValue = YAML.stringify(v);
                    break;
                case "javascript":
                    textValue = JSON.stringify(v);
                    break;
                default:
                    textValue = v.toString();
                    break;
            }
        }
        if (this.editorEl) {
            this.editorEl.value = textValue as string;
        }
        this._value = textValue as string;
    }

    get value(): T | string {
        if (!this.parseValue) {
            return this.getInnerValue();
        }
        try {
            switch (this.mode) {
                case CodeMirrorMode.YAML:
                    return YAML.parse(this.getInnerValue());
                case CodeMirrorMode.JavaScript:
                    return JSON.parse(this.getInnerValue());
                default:
                    return this.getInnerValue();
            }
        } catch (_e: unknown) {
            return this.getInnerValue();
        }
    }

    private getInnerValue(): string {
        if (!this.editorEl || this.editorEl.value === undefined) {
            return this._value ?? "";
        }
        return this.editorEl.value ?? this._value ?? "";
    }
    async firstUpdated(): Promise<void> {
        this.container = document.createElement("div");
        this.container.classList.add("editor-container");
        this.container.style.width = "100%";
        this.container.style.minHeight = "8rem";
        this.shadowRoot?.appendChild(this.container);

        // Try to dynamically import the Hey Monaco editor. If it fails,
        // fall back to a simple <textarea> with similar behavior.
        let tag: string | null = null;
        try {
            const spec = "@hey-web-components/monaco-editor";
            await import(spec);
        } catch (_e) {
            // ignore — we try to detect a globally-registered element as well
        }
        if (customElements.get("hey-monaco-editor")) tag = "hey-monaco-editor";
        else if (customElements.get("monaco-editor")) tag = "monaco-editor";

        if (tag) {
            const editor = document.createElement(tag);
            editor.style.width = "100%";
            editor.style.height = "14rem";

            // @ts-expect-error web component property
            editor.language = this.getMonacoLanguageId();
            // @ts-expect-error web component property
            editor.value = this._value ?? "";
            // @ts-expect-error web component property
            editor.readonly = this.readOnly;
            // @ts-expect-error web component property
            editor.theme = this.activeTheme === UiThemeEnum.Dark ? "vs-dark" : "vs";

            const onChange = (e: Event) => {
                const next = (e.target as any)?.value ?? (e as any)?.detail?.value;
                if (typeof next === "string") this._value = next;
                this.dispatchEvent(new CustomEvent("change", { detail: e }));
            };
            editor.addEventListener("input", onChange);
            editor.addEventListener("change", onChange);
            editor.addEventListener("value-changed", onChange as EventListener);

            this.container.appendChild(editor);
            this.editorEl = editor as unknown as CodeMirrorTextarea<T>["editorEl"];

            this.addEventListener(EVENT_THEME_CHANGE, ((ev: CustomEvent<UiThemeEnum>) => {
                const theme = ev.detail === UiThemeEnum.Dark ? "vs-dark" : "vs";
                if (this.editorEl) {
                    this.editorEl.theme = theme;
                }
            }) as EventListener);
            return;
        }

        // Fallback: plain textarea
        const ta = document.createElement("textarea");
        ta.className = "editor-fallback pf-c-form-control";
        ta.value = this._value ?? "";
        ta.readOnly = this.readOnly;
        ta.addEventListener("input", (e) => {
            this._value = ta.value;
            this.dispatchEvent(new CustomEvent("change", { detail: e }));
        });
        this.container.appendChild(ta);
        this.editorEl = ta as unknown as CodeMirrorTextarea<T>["editorEl"];
    }

    private getMonacoLanguageId(): string {
        switch (this.mode.toLowerCase()) {
            case CodeMirrorMode.JavaScript:
                return "javascript";
            case CodeMirrorMode.HTML:
                return "html";
            case CodeMirrorMode.CSS:
                return "css";
            case CodeMirrorMode.YAML:
                return "yaml";
            case CodeMirrorMode.XML:
                return "xml";
            case CodeMirrorMode.Python:
                return "python";
            default:
                return "plaintext";
        }
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        if (this.container) {
            this.container.remove();
            this.container = undefined;
        }
        this.editorEl = undefined;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "ak-codemirror": CodeMirrorTextarea<unknown>;
    }
}
