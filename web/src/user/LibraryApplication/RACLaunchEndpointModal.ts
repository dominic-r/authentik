import { DEFAULT_CONFIG } from "#common/api/config";

import { PaginatedResponse, TableColumn } from "#elements/table/Table";
import { TableModal } from "#elements/table/TableModal";

import { Application, Endpoint, RacApi } from "@goauthentik/api";

import { msg } from "@lit/localize";
import { html, TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";

@customElement("ak-library-rac-endpoint-launch")
export class RACLaunchEndpointModal extends TableModal<Endpoint> {
    clickable = true;
    searchEnabled(): boolean {
        return true;
    }

    clickHandler = (item: Endpoint) => {
        if (!item.launchUrl) {
            return;
        }
        if (this.app?.openInNewTab) {
            window.open(item.launchUrl);
        } else {
            window.location.assign(item.launchUrl);
        }
    };

    @property({ attribute: false })
    app?: Application;

    async apiEndpoint(): Promise<PaginatedResponse<Endpoint>> {
        const endpoints = await new RacApi(DEFAULT_CONFIG).racEndpointsList({
            ...(await this.defaultEndpointConfig()),
            provider: this.app?.provider || 0,
        });
        if (this.open && endpoints.pagination.count === 1) {
            this.clickHandler(endpoints.results[0]);
            this.open = false;
        }
        return endpoints;
    }

    columns(): TableColumn[] {
        return [new TableColumn(msg("Name"))];
    }

    row(item: Endpoint): TemplateResult[] {
        return [html`${item.name}`];
    }

    renderModalInner(): TemplateResult {
        return html`<section class="pf-c-modal-box__header pf-c-page__main-section pf-m-light">
                <div class="pf-c-content">
                    <h1 class="pf-c-title pf-m-2xl">${msg("Select endpoint to connect to")}</h1>
                </div>
            </section>
            <section class="pf-c-modal-box__body pf-m-light">${this.renderTable()}</section>
            <footer class="pf-c-modal-box__footer">
                <ak-spinner-button
                    .callAction=${async () => {
                        this.open = false;
                    }}
                    class="pf-m-secondary"
                >
                    ${msg("Cancel")}
                </ak-spinner-button>
            </footer>`;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "ak-library-rac-endpoint-launch": RACLaunchEndpointModal;
    }
}
