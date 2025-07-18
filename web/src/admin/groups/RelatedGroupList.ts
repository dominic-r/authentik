import "#admin/groups/GroupForm";
import "#admin/users/GroupSelectModal";
import "#components/ak-status-label";
import "#elements/buttons/SpinnerButton/index";
import "#elements/forms/DeleteBulkForm";
import "#elements/forms/HorizontalFormElement";
import "#elements/forms/ModalForm";
import "@patternfly/elements/pf-tooltip/pf-tooltip.js";

import { DEFAULT_CONFIG } from "#common/api/config";

import { Form } from "#elements/forms/Form";
import { PaginatedResponse, Table, TableColumn } from "#elements/table/Table";

import { CoreApi, Group, User } from "@goauthentik/api";

import { msg, str } from "@lit/localize";
import { html, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ifDefined } from "lit/directives/if-defined.js";

@customElement("ak-group-related-add")
export class RelatedGroupAdd extends Form<{ groups: string[] }> {
    @property({ attribute: false })
    user?: User;

    @state()
    groupsToAdd: Group[] = [];

    getSuccessMessage(): string {
        return msg("Successfully added user to group(s).");
    }

    async send(data: { groups: string[] }): Promise<unknown> {
        await Promise.all(
            data.groups.map((group) => {
                return new CoreApi(DEFAULT_CONFIG).coreGroupsAddUserCreate({
                    groupUuid: group,
                    userAccountRequest: {
                        pk: this.user?.pk || 0,
                    },
                });
            }),
        );
        return data;
    }

    renderForm(): TemplateResult {
        return html`<ak-form-element-horizontal label=${msg("Groups to add")} name="groups">
            <div class="pf-c-input-group">
                <ak-user-group-select-table
                    .confirm=${(items: Group[]) => {
                        this.groupsToAdd = items;
                        this.requestUpdate();
                        return Promise.resolve();
                    }}
                >
                    <button slot="trigger" class="pf-c-button pf-m-control" type="button">
                        <pf-tooltip position="top" content=${msg("Add group")}>
                            <i class="fas fa-plus" aria-hidden="true"></i>
                        </pf-tooltip>
                    </button>
                </ak-user-group-select-table>
                <div class="pf-c-form-control">
                    <ak-chip-group>
                        ${this.groupsToAdd.map((group) => {
                            return html`<ak-chip
                                removable
                                value=${ifDefined(group.pk)}
                                @remove=${() => {
                                    const idx = this.groupsToAdd.indexOf(group);
                                    this.groupsToAdd.splice(idx, 1);
                                    this.requestUpdate();
                                }}
                            >
                                ${group.name}
                            </ak-chip>`;
                        })}
                    </ak-chip-group>
                </div>
            </div>
        </ak-form-element-horizontal>`;
    }
}

@customElement("ak-group-related-list")
export class RelatedGroupList extends Table<Group> {
    checkbox = true;
    clearOnRefresh = true;
    searchEnabled(): boolean {
        return true;
    }

    @property()
    order = "name";

    @property({ attribute: false })
    targetUser?: User;

    async apiEndpoint(): Promise<PaginatedResponse<Group>> {
        return new CoreApi(DEFAULT_CONFIG).coreGroupsList({
            ...(await this.defaultEndpointConfig()),
            membersByPk: this.targetUser ? [this.targetUser.pk] : [],
            includeUsers: false,
        });
    }

    columns(): TableColumn[] {
        return [
            new TableColumn(msg("Name"), "name"),
            new TableColumn(msg("Parent"), "parent"),
            new TableColumn(msg("Superuser privileges?")),
            new TableColumn(msg("Actions")),
        ];
    }

    renderToolbarSelected(): TemplateResult {
        const disabled = this.selectedElements.length < 1;
        return html`<ak-forms-delete-bulk
            objectLabel=${msg("Group(s)")}
            actionLabel=${msg("Remove from Group(s)")}
            actionSubtext=${msg(
                str`Are you sure you want to remove user ${this.targetUser?.username} from the following groups?`,
            )}
            buttonLabel=${msg("Remove")}
            .objects=${this.selectedElements}
            .delete=${(item: Group) => {
                if (!this.targetUser) return;
                return new CoreApi(DEFAULT_CONFIG).coreGroupsRemoveUserCreate({
                    groupUuid: item.pk,
                    userAccountRequest: {
                        pk: this.targetUser?.pk || 0,
                    },
                });
            }}
        >
            <button ?disabled=${disabled} slot="trigger" class="pf-c-button pf-m-danger">
                ${msg("Remove")}
            </button>
        </ak-forms-delete-bulk>`;
    }

    row(item: Group): TemplateResult[] {
        return [
            html`<a href="#/identity/groups/${item.pk}">${item.name}</a>`,
            html`${item.parentName || msg("-")}`,
            html`<ak-label type="info" ?good=${item.isSuperuser}></ak-label>`,
            html` <ak-forms-modal>
                <span slot="submit"> ${msg("Update")} </span>
                <span slot="header"> ${msg("Update Group")} </span>
                <ak-group-form slot="form" .instancePk=${item.pk}> </ak-group-form>
                <button slot="trigger" class="pf-c-button pf-m-plain">
                    <pf-tooltip position="top" content=${msg("Edit")}>
                        <i class="fas fa-edit"></i>
                    </pf-tooltip>
                </button>
            </ak-forms-modal>`,
        ];
    }

    renderToolbar(): TemplateResult {
        return html`
            ${this.targetUser
                ? html`<ak-forms-modal>
                      <span slot="submit"> ${msg("Add")} </span>
                      <span slot="header"> ${msg("Add Group")} </span>
                      <ak-group-related-add .user=${this.targetUser} slot="form">
                      </ak-group-related-add>
                      <button slot="trigger" class="pf-c-button pf-m-primary">
                          ${msg("Add to existing group")}
                      </button>
                  </ak-forms-modal>`
                : html``}
            <ak-forms-modal>
                <span slot="submit"> ${msg("Create")} </span>
                <span slot="header"> ${msg("Create Group")} </span>
                <ak-group-form slot="form"> </ak-group-form>
                <button slot="trigger" class="pf-c-button pf-m-secondary">
                    ${msg("Add new group")}
                </button>
            </ak-forms-modal>
            ${super.renderToolbar()}
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "ak-group-related-list": RelatedGroupList;
        "ak-group-related-add": RelatedGroupAdd;
    }
}
