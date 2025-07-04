import { EVENT_REFRESH } from "@goauthentik/common/constants";
import { parseAPIResponseError, pluckErrorDetail } from "@goauthentik/common/errors/network";
import { MessageLevel } from "@goauthentik/common/messages";
import { dateToUTC } from "@goauthentik/common/temporal";
import { camelToSnake } from "@goauthentik/common/utils";
import { AKElement } from "@goauthentik/elements/Base";
import { HorizontalFormElement } from "@goauthentik/elements/forms/HorizontalFormElement";
import { PreventFormSubmit } from "@goauthentik/elements/forms/helpers";
import { showMessage } from "@goauthentik/elements/messages/MessageContainer";

import { msg } from "@lit/localize";
import { CSSResult, TemplateResult, css, html } from "lit";
import { property, state } from "lit/decorators.js";

import PFAlert from "@patternfly/patternfly/components/Alert/alert.css";
import PFButton from "@patternfly/patternfly/components/Button/button.css";
import PFCard from "@patternfly/patternfly/components/Card/card.css";
import PFForm from "@patternfly/patternfly/components/Form/form.css";
import PFFormControl from "@patternfly/patternfly/components/FormControl/form-control.css";
import PFInputGroup from "@patternfly/patternfly/components/InputGroup/input-group.css";
import PFSwitch from "@patternfly/patternfly/components/Switch/switch.css";
import PFBase from "@patternfly/patternfly/patternfly-base.css";

import { instanceOfValidationError } from "@goauthentik/api";

export interface KeyUnknown {
    [key: string]: unknown;
}

// Literally the only field `assignValue()` cares about.
type HTMLNamedElement = Pick<HTMLInputElement, "name">;

export type AkControlElement<T = string | string[]> = HTMLInputElement & { json: () => T };

const doNotProcess = <T extends HTMLElement>(element: T) => element.dataset.formIgnore === "true";

/**
 * Recursively assign `value` into `json` while interpreting the dot-path of `element.name`
 */
function assignValue(element: HTMLNamedElement, value: unknown, json: KeyUnknown): void {
    let parent = json;
    if (!element.name?.includes(".")) {
        parent[element.name] = value;
        return;
    }
    const nameElements = element.name.split(".");
    for (let index = 0; index < nameElements.length - 1; index++) {
        const nameEl = nameElements[index];
        // Ensure all nested structures exist
        if (!(nameEl in parent)) {
            parent[nameEl] = {};
        }
        parent = parent[nameEl] as { [key: string]: unknown };
    }
    parent[nameElements[nameElements.length - 1]] = value;
}

/**
 * Convert the elements of the form to JSON.[4]
 *
 */
export function serializeForm<T extends KeyUnknown>(
    elements: NodeListOf<HorizontalFormElement>,
): T | undefined {
    const json: { [key: string]: unknown } = {};
    elements.forEach((element) => {
        element.requestUpdate();
        if (element.hidden) {
            return;
        }

        if ("akControl" in element.dataset) {
            assignValue(element, (element as unknown as AkControlElement).json(), json);
            return;
        }

        const inputElement = element.querySelector<AkControlElement>("[name]");
        if (element.hidden || !inputElement || doNotProcess(inputElement)) {
            return;
        }

        if ("akControl" in inputElement.dataset) {
            assignValue(element, (inputElement as unknown as AkControlElement).json(), json);
            return;
        }

        if (
            inputElement.tagName.toLowerCase() === "select" &&
            "multiple" in inputElement.attributes
        ) {
            const selectElement = inputElement as unknown as HTMLSelectElement;
            assignValue(
                inputElement,
                Array.from(selectElement.selectedOptions).map((v) => v.value),
                json,
            );
        } else if (inputElement.tagName.toLowerCase() === "input" && inputElement.type === "date") {
            assignValue(inputElement, inputElement.valueAsDate, json);
        } else if (
            inputElement.tagName.toLowerCase() === "input" &&
            inputElement.type === "datetime-local"
        ) {
            assignValue(inputElement, dateToUTC(new Date(inputElement.valueAsNumber)), json);
        } else if (
            inputElement.tagName.toLowerCase() === "input" &&
            "type" in inputElement.dataset &&
            inputElement.dataset.type === "datetime-local"
        ) {
            // Workaround for Firefox <93, since 92 and older don't support
            // datetime-local fields
            assignValue(inputElement, dateToUTC(new Date(inputElement.value)), json);
        } else if (
            inputElement.tagName.toLowerCase() === "input" &&
            inputElement.type === "checkbox"
        ) {
            assignValue(inputElement, inputElement.checked, json);
        } else if ("selectedFlow" in inputElement) {
            assignValue(inputElement, inputElement.value, json);
        } else {
            assignValue(inputElement, inputElement.value, json);
        }
    });
    return json as unknown as T;
}

/**
 * Form
 *
 * The base form element for interacting with user inputs.
 *
 * All forms either[1] inherit from this class and implement the `renderForm()` method to
 * produce the actual form, or include the form in-line as a slotted element. Bizarrely, this form
 * will not render at all if it's not actually in the viewport?[2]
 *
 * @element ak-form
 *
 * @slot - Where the form goes if `renderForm()` returns undefined.
 * @fires eventname - description
 *
 * @csspart partname - description
 */

/* TODO:
 *
 * 1. Specialization: Separate this component into three different classes:
 *    - The base class
 *    - The "use `renderForm` class
 *    - The slotted class.
 * 2. There is already specialization-by-type throughout all of our code.
 *    Consider refactoring serializeForm() so that the conversions are on
 *    the input types, rather than here. (i.e. "Polymorphism is better than
 *    switch.")
 *
 *
 */

export abstract class Form<T> extends AKElement {
    abstract send(data: T): Promise<unknown>;

    viewportCheck = true;

    @property()
    successMessage = "";

    @state()
    nonFieldErrors?: string[];

    static get styles(): CSSResult[] {
        return [
            PFBase,
            PFCard,
            PFButton,
            PFForm,
            PFAlert,
            PFInputGroup,
            PFFormControl,
            PFSwitch,
            css`
                select[multiple] {
                    height: 15em;
                }
            `,
        ];
    }

    /**
     * Called by the render function. Blocks rendering the form if the form is not within the
     * viewport.
     */
    get isInViewport(): boolean {
        const rect = this.getBoundingClientRect();
        return rect.x + rect.y + rect.width + rect.height !== 0;
    }

    getSuccessMessage(): string {
        return this.successMessage;
    }

    resetForm(): void {
        const form = this.shadowRoot?.querySelector<HTMLFormElement>("form");
        form?.reset();
    }

    /**
     * Return the form elements that may contain filenames. Not sure why this is quite so
     * convoluted. There is exactly one case where this is used:
     * `./flow/stages/prompt/PromptStage: 147: case PromptTypeEnum.File.`
     * Consider moving this functionality to there.
     */
    getFormFiles(): { [key: string]: File } {
        const files: { [key: string]: File } = {};
        const elements =
            this.shadowRoot?.querySelectorAll<HorizontalFormElement>(
                "ak-form-element-horizontal",
            ) || [];
        for (let i = 0; i < elements.length; i++) {
            const element = elements[i];
            element.requestUpdate();
            const inputElement = element.querySelector<HTMLInputElement>("[name]");
            if (!inputElement) {
                continue;
            }
            if (inputElement.tagName.toLowerCase() === "input" && inputElement.type === "file") {
                if ((inputElement.files || []).length < 1) {
                    continue;
                }
                files[element.name] = (inputElement.files || [])[0];
            }
        }
        return files;
    }

    /**
     * Convert the elements of the form to JSON.[4]
     *
     */
    serializeForm(): T | undefined {
        const elements = this.shadowRoot?.querySelectorAll<HorizontalFormElement>(
            "ak-form-element-horizontal",
        );
        if (!elements) {
            return {} as T;
        }
        return serializeForm(elements) as T;
    }
    /**
     * Serialize and send the form to the destination. The `send()` method must be overridden for
     * this to work. If processing the data results in an error, we catch the error, distribute
     * field-levels errors to the fields, and send the rest of them to the Notifications.
     *
     */
    async submit(event: Event): Promise<unknown | undefined> {
        event.preventDefault();

        const data = this.serializeForm();
        if (!data) return;

        return this.send(data)
            .then((response) => {
                showMessage({
                    level: MessageLevel.success,
                    message: this.getSuccessMessage(),
                });

                this.dispatchEvent(
                    new CustomEvent(EVENT_REFRESH, {
                        bubbles: true,
                        composed: true,
                    }),
                );

                return response;
            })
            .catch(async (error: unknown) => {
                if (error instanceof PreventFormSubmit && error.element) {
                    error.element.errorMessages = [error.message];
                    error.element.invalid = true;
                }

                const parsedError = await parseAPIResponseError(error);
                let errorMessage = pluckErrorDetail(error);

                if (instanceOfValidationError(parsedError)) {
                    // assign all input-related errors to their elements
                    const elements =
                        this.shadowRoot?.querySelectorAll<HorizontalFormElement>(
                            "ak-form-element-horizontal",
                        ) || [];

                    elements.forEach((element) => {
                        element.requestUpdate();

                        const elementName = element.name;
                        if (!elementName) return;

                        const snakeProperty = camelToSnake(elementName);

                        if (snakeProperty in parsedError) {
                            element.errorMessages = parsedError[snakeProperty];
                            element.invalid = true;
                        } else {
                            element.errorMessages = [];
                            element.invalid = false;
                        }
                    });

                    if (parsedError.nonFieldErrors) {
                        this.nonFieldErrors = parsedError.nonFieldErrors;
                    }

                    errorMessage = msg("Invalid update request.");

                    // Only change the message when we have `detail`.
                    // Everything else is handled in the form.
                    if ("detail" in parsedError) {
                        errorMessage = parsedError.detail;
                    }
                }

                showMessage({
                    message: errorMessage,
                    level: MessageLevel.error,
                });

                // Rethrow the error so the form doesn't close.
                throw error;
            });
    }

    renderFormWrapper(): TemplateResult {
        const inline = this.renderForm();
        if (inline) {
            return html`<form
                class="pf-c-form pf-m-horizontal"
                @submit=${(ev: Event) => {
                    ev.preventDefault();
                }}
            >
                ${inline}
            </form>`;
        }
        return html`<slot></slot>`;
    }

    renderForm(): TemplateResult | undefined {
        return undefined;
    }

    renderNonFieldErrors(): TemplateResult {
        if (!this.nonFieldErrors) {
            return html``;
        }
        return html`<div class="pf-c-form__alert">
            ${this.nonFieldErrors.map((err) => {
                return html`<div class="pf-c-alert pf-m-inline pf-m-danger">
                    <div class="pf-c-alert__icon">
                        <i class="fas fa-exclamation-circle"></i>
                    </div>
                    <h4 class="pf-c-alert__title">${err}</h4>
                </div>`;
            })}
        </div>`;
    }

    renderVisible(): TemplateResult {
        return html` ${this.renderNonFieldErrors()} ${this.renderFormWrapper()}`;
    }

    render(): TemplateResult {
        if (this.viewportCheck && !this.isInViewport) {
            return html``;
        }
        return this.renderVisible();
    }
}
