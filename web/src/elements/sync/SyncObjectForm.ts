import "#admin/common/ak-flow-search/ak-flow-search-no-default";
import "#elements/forms/HorizontalFormElement";
import "#elements/forms/SearchSelect/index";

import { DEFAULT_CONFIG } from "#common/api/config";

import { Form } from "#elements/forms/Form";

import {
    CoreApi,
    CoreGroupsListRequest,
    CoreUsersListRequest,
    Group,
    InitOverrideFunction,
    SyncObjectModelEnum,
    SyncObjectRequest,
    SyncObjectResult,
    User,
} from "@goauthentik/api";

import { msg } from "@lit/localize";
import { html, nothing, TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";

@customElement("ak-sync-object-form")
export class SyncObjectForm extends Form<SyncObjectRequest> {
    @property({ type: Number })
    provider?: number;

    @property()
    model: SyncObjectModelEnum = SyncObjectModelEnum.UnknownDefaultOpenApi;

    @property({ attribute: false })
    result?: SyncObjectResult;

    @property({ attribute: false })
    sync: (
        requestParameters: {
            id: number;
            syncObjectRequest: SyncObjectRequest;
        },
        initOverrides?: RequestInit | InitOverrideFunction,
    ) => Promise<SyncObjectResult> = (_, __) => {
        return Promise.reject();
    };

    getSuccessMessage(): string {
        return msg("Successfully triggered sync.");
    }

    async send(data: SyncObjectRequest): Promise<void> {
        data.syncObjectModel = this.model;
        this.result = await this.sync({
            id: this.provider || 0,
            syncObjectRequest: data,
        });
    }

    renderSelectUser() {
        return html`<ak-form-element-horizontal label=${msg("User")} name="syncObjectId">
            <ak-search-select
                .fetchObjects=${async (query?: string): Promise<User[]> => {
                    const args: CoreUsersListRequest = {
                        ordering: "username",
                    };
                    if (query !== undefined) {
                        args.search = query;
                    }
                    const users = await new CoreApi(DEFAULT_CONFIG).coreUsersList(args);
                    return users.results;
                }}
                .renderElement=${(user: User): string => {
                    return user.username;
                }}
                .renderDescription=${(user: User): TemplateResult => {
                    return html`${user.name}`;
                }}
                .value=${(user: User | undefined): number | undefined => {
                    return user?.pk;
                }}
            >
            </ak-search-select>
        </ak-form-element-horizontal>`;
    }

    renderSelectGroup() {
        return html` <ak-form-element-horizontal label=${msg("Group")} name="syncObjectId">
            <ak-search-select
                .fetchObjects=${async (query?: string): Promise<Group[]> => {
                    const args: CoreGroupsListRequest = {
                        ordering: "name",
                    };
                    if (query !== undefined) {
                        args.search = query;
                    }
                    const groups = await new CoreApi(DEFAULT_CONFIG).coreGroupsList(args);
                    return groups.results;
                }}
                .renderElement=${(group: Group): string => {
                    return group.name;
                }}
                .value=${(group: Group | undefined): string | undefined => {
                    return group?.pk;
                }}
            >
            </ak-search-select>
        </ak-form-element-horizontal>`;
    }

    renderResult(): TemplateResult {
        return html`<ak-form-element-horizontal label=${msg("Log messages")}>
            <div class="pf-c-form__group-label">
                <div class="c-form__horizontal-group">
                    <dl class="pf-c-description-list pf-m-horizontal">
                        <ak-log-viewer .logs=${this.result?.messages}></ak-log-viewer>
                    </dl>
                </div>
            </div>
        </ak-form-element-horizontal> `;
    }

    renderForm() {
        return html` ${this.model === SyncObjectModelEnum.AuthentikCoreModelsUser
                ? this.renderSelectUser()
                : nothing}
            ${this.model === SyncObjectModelEnum.AuthentikCoreModelsGroup
                ? this.renderSelectGroup()
                : nothing}
            <ak-form-element-horizontal name="overrideDryRun">
                <label class="pf-c-switch">
                    <input class="pf-c-switch__input" type="checkbox" />
                    <span class="pf-c-switch__toggle">
                        <span class="pf-c-switch__toggle-icon">
                            <i class="fas fa-check" aria-hidden="true"></i>
                        </span>
                    </span>
                    <span class="pf-c-switch__label">${msg("Override dry-run mode")}</span>
                </label>
                <p class="pf-c-form__helper-text">
                    ${msg(
                        "When enabled, this sync will still execute mutating requests regardless of the dry-run mode in the provider.",
                    )}
                </p>
            </ak-form-element-horizontal>
            ${this.result ? this.renderResult() : html``}`;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "ak-sync-object-form": SyncObjectForm;
    }
}
