import "#elements/forms/DeleteBulkForm";

import { DEFAULT_CONFIG } from "#common/api/config";
import { formatElapsedTime } from "#common/temporal";

import { PaginatedResponse, Table, TableColumn } from "#elements/table/Table";

import { AuthenticatedSession, CoreApi } from "@goauthentik/api";

import getUnicodeFlagIcon from "country-flag-icons/unicode";

import { msg } from "@lit/localize";
import { html, TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";

@customElement("ak-user-session-list")
export class AuthenticatedSessionList extends Table<AuthenticatedSession> {
    @property()
    targetUser!: string;

    async apiEndpoint(): Promise<PaginatedResponse<AuthenticatedSession>> {
        return new CoreApi(DEFAULT_CONFIG).coreAuthenticatedSessionsList({
            ...(await this.defaultEndpointConfig()),
            userUsername: this.targetUser,
        });
    }

    checkbox = true;
    clearOnRefresh = true;
    order = "-expires";

    columns(): TableColumn[] {
        return [
            new TableColumn(msg("Last IP"), "last_ip"),
            new TableColumn(msg("Last used"), "last_used"),
            new TableColumn(msg("Expires"), "expires"),
        ];
    }

    renderToolbarSelected(): TemplateResult {
        const disabled = this.selectedElements.length < 1;
        return html`<ak-forms-delete-bulk
            objectLabel=${msg("Session(s)")}
            .objects=${this.selectedElements}
            .metadata=${(item: AuthenticatedSession) => {
                return [
                    { key: msg("Last IP"), value: item.lastIp },
                    { key: msg("Expiry"), value: item.expires?.toLocaleString() || msg("-") },
                ];
            }}
            .usedBy=${(item: AuthenticatedSession) => {
                return new CoreApi(DEFAULT_CONFIG).coreAuthenticatedSessionsUsedByList({
                    uuid: item.uuid || "",
                });
            }}
            .delete=${(item: AuthenticatedSession) => {
                return new CoreApi(DEFAULT_CONFIG).coreAuthenticatedSessionsDestroy({
                    uuid: item.uuid || "",
                });
            }}
        >
            <button ?disabled=${disabled} slot="trigger" class="pf-c-button pf-m-danger">
                ${msg("Delete")}
            </button>
        </ak-forms-delete-bulk>`;
    }

    row(item: AuthenticatedSession): TemplateResult[] {
        return [
            html`<div>
                    ${item.geoIp?.country
                        ? html`${getUnicodeFlagIcon(item.geoIp.country)}&nbsp;`
                        : html``}
                    ${item.current ? html`${msg("(Current session)")}&nbsp;` : html``}
                    ${item.lastIp}
                </div>
                <small>${item.userAgent.userAgent?.family}, ${item.userAgent.os?.family}</small>`,
            html`<div>${formatElapsedTime(item.lastUsed)}</div>
                <small>${item.lastUsed?.toLocaleString()}</small>`,
            html`<div>${formatElapsedTime(item.expires || new Date())}</div>
                <small>${item.expires?.toLocaleString()}</small>`,
        ];
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "ak-user-session-list": AuthenticatedSessionList;
    }
}
