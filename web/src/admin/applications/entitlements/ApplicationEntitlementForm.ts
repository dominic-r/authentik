import "#elements/CodeMirror";
import "#elements/forms/HorizontalFormElement";
import "#elements/forms/Radio";
import "#elements/forms/SearchSelect/index";

import { DEFAULT_CONFIG } from "#common/api/config";

import { CodeMirrorMode } from "#elements/CodeMirror";
import { ModelForm } from "#elements/forms/ModelForm";

import { ApplicationEntitlement, CoreApi } from "@goauthentik/api";

import YAML from "yaml";

import { msg } from "@lit/localize";
import { CSSResult, html, TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";

import PFContent from "@patternfly/patternfly/components/Content/content.css";

@customElement("ak-application-entitlement-form")
export class ApplicationEntitlementForm extends ModelForm<ApplicationEntitlement, string> {
    async loadInstance(pk: string): Promise<ApplicationEntitlement> {
        return new CoreApi(DEFAULT_CONFIG).coreApplicationEntitlementsRetrieve({
            pbmUuid: pk,
        });
    }

    @property()
    targetPk?: string;

    getSuccessMessage(): string {
        if (this.instance?.pbmUuid) {
            return msg("Successfully updated entitlement.");
        }
        return msg("Successfully created entitlement.");
    }

    static styles: CSSResult[] = [...super.styles, PFContent];

    send(data: ApplicationEntitlement): Promise<unknown> {
        if (this.targetPk) {
            data.app = this.targetPk;
        }
        if (this.instance?.pbmUuid) {
            return new CoreApi(DEFAULT_CONFIG).coreApplicationEntitlementsUpdate({
                pbmUuid: this.instance.pbmUuid || "",
                applicationEntitlementRequest: data,
            });
        }
        return new CoreApi(DEFAULT_CONFIG).coreApplicationEntitlementsCreate({
            applicationEntitlementRequest: data,
        });
    }

    renderForm(): TemplateResult {
        return html` <ak-form-element-horizontal label=${msg("Name")} required name="name">
                <input
                    type="text"
                    value="${this.instance?.name ?? ""}"
                    class="pf-c-form-control"
                    required
                />
            </ak-form-element-horizontal>
            <ak-form-element-horizontal label=${msg("Attributes")} name="attributes">
                <ak-codemirror
                    mode=${CodeMirrorMode.YAML}
                    value="${YAML.stringify(this.instance?.attributes ?? {})}"
                >
                </ak-codemirror>
                <p class="pf-c-form__helper-text">
                    ${msg("Set custom attributes using YAML or JSON.")}
                </p>
            </ak-form-element-horizontal>`;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "ak-application-entitlement-form": ApplicationEntitlementForm;
    }
}
