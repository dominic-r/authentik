import "#components/ak-status-label";
import "#elements/events/LogViewer";
import "#elements/forms/HorizontalFormElement";

import { DEFAULT_CONFIG } from "#common/api/config";
import { SentryIgnoredError } from "#common/sentry/index";

import { Form } from "#elements/forms/Form";

import { Flow, FlowImportResult, FlowsApi } from "@goauthentik/api";

import { msg } from "@lit/localize";
import { CSSResult, html, TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";

import PFDescriptionList from "@patternfly/patternfly/components/DescriptionList/description-list.css";

@customElement("ak-flow-import-form")
export class FlowImportForm extends Form<Flow> {
    @state()
    result?: FlowImportResult;

    getSuccessMessage(): string {
        return msg("Successfully imported flow.");
    }

    static styles: CSSResult[] = [...super.styles, PFDescriptionList];

    async send(): Promise<FlowImportResult> {
        const file = this.files().get("flow");
        if (!file) {
            throw new SentryIgnoredError("No form data");
        }
        const result = await new FlowsApi(DEFAULT_CONFIG).flowsInstancesImportCreate({
            file: file,
        });
        if (!result.success) {
            this.result = result;
            throw new SentryIgnoredError("Failed to import flow");
        }
        return result;
    }

    renderResult(): TemplateResult {
        return html`
            <ak-form-element-horizontal label=${msg("Successful")}>
                <div class="pf-c-form__group-label">
                    <div class="c-form__horizontal-group">
                        <span class="pf-c-form__label-text">
                            <ak-status-label ?good=${this.result?.success}></ak-status-label>
                        </span>
                    </div>
                </div>
            </ak-form-element-horizontal>
            <ak-form-element-horizontal label=${msg("Log messages")}>
                <div class="pf-c-form__group-label">
                    <div class="c-form__horizontal-group">
                        <dl class="pf-c-description-list pf-m-horizontal">
                            <ak-log-viewer .logs=${this.result?.logs}></ak-log-viewer>
                        </dl>
                    </div>
                </div>
            </ak-form-element-horizontal>
        `;
    }

    renderForm(): TemplateResult {
        return html`<ak-form-element-horizontal label=${msg("Flow")} name="flow">
                <input type="file" value="" class="pf-c-form-control" />
                <p class="pf-c-form__helper-text">
                    ${msg(
                        ".yaml files, which can be found on goauthentik.io and can be exported by authentik.",
                    )}
                </p>
            </ak-form-element-horizontal>
            ${this.result ? this.renderResult() : html``}`;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "ak-flow-import-form": FlowImportForm;
    }
}
