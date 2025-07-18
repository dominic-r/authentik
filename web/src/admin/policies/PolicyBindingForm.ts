import "#components/ak-toggle-group";
import "#elements/forms/HorizontalFormElement";
import "#elements/forms/Radio";
import "#elements/forms/SearchSelect/index";

import { DEFAULT_CONFIG } from "#common/api/config";
import { groupBy } from "#common/utils";

import { ModelForm } from "#elements/forms/ModelForm";

import { PolicyBindingCheckTarget, PolicyBindingCheckTargetToLabel } from "#admin/policies/utils";

import {
    CoreApi,
    CoreGroupsListRequest,
    CoreUsersListRequest,
    Group,
    PoliciesAllListRequest,
    PoliciesApi,
    Policy,
    PolicyBinding,
    User,
} from "@goauthentik/api";

import { msg } from "@lit/localize";
import { CSSResult, html, nothing, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import PFContent from "@patternfly/patternfly/components/Content/content.css";

export type PolicyBindingNotice = { type: PolicyBindingCheckTarget; notice: string };

@customElement("ak-policy-binding-form")
export class PolicyBindingForm extends ModelForm<PolicyBinding, string> {
    async loadInstance(pk: string): Promise<PolicyBinding> {
        const binding = await new PoliciesApi(DEFAULT_CONFIG).policiesBindingsRetrieve({
            policyBindingUuid: pk,
        });
        if (binding?.policyObj) {
            this.policyGroupUser = PolicyBindingCheckTarget.policy;
        }
        if (binding?.groupObj) {
            this.policyGroupUser = PolicyBindingCheckTarget.group;
        }
        if (binding?.userObj) {
            this.policyGroupUser = PolicyBindingCheckTarget.user;
        }
        this.defaultOrder = await this.getOrder();
        return binding;
    }

    @property()
    targetPk?: string;

    @state()
    policyGroupUser: PolicyBindingCheckTarget = PolicyBindingCheckTarget.policy;

    @property({ type: Array })
    allowedTypes: PolicyBindingCheckTarget[] = [
        PolicyBindingCheckTarget.policy,
        PolicyBindingCheckTarget.group,
        PolicyBindingCheckTarget.user,
    ];

    @property({ type: Array })
    typeNotices: PolicyBindingNotice[] = [];

    @state()
    defaultOrder = 0;

    getSuccessMessage(): string {
        if (this.instance?.pk) {
            return msg("Successfully updated binding.");
        }
        return msg("Successfully created binding.");
    }

    static styles: CSSResult[] = [...super.styles, PFContent];

    async load(): Promise<void> {
        // Overwrite the default for policyGroupUser with the first allowed type,
        // as this function is called when the correct parameters are set
        this.policyGroupUser = this.allowedTypes[0];
    }

    send(data: PolicyBinding): Promise<unknown> {
        if (this.targetPk) {
            data.target = this.targetPk;
        }
        switch (this.policyGroupUser) {
            case PolicyBindingCheckTarget.policy:
                data.user = null;
                data.group = null;
                break;
            case PolicyBindingCheckTarget.group:
                data.policy = null;
                data.user = null;
                break;
            case PolicyBindingCheckTarget.user:
                data.policy = null;
                data.group = null;
                break;
        }

        if (this.instance?.pk) {
            return new PoliciesApi(DEFAULT_CONFIG).policiesBindingsUpdate({
                policyBindingUuid: this.instance.pk,
                policyBindingRequest: data,
            });
        }
        return new PoliciesApi(DEFAULT_CONFIG).policiesBindingsCreate({
            policyBindingRequest: data,
        });
    }

    async getOrder(): Promise<number> {
        if (this.instance?.pk) {
            return this.instance.order;
        }
        const bindings = await new PoliciesApi(DEFAULT_CONFIG).policiesBindingsList({
            target: this.targetPk || "",
        });
        const orders = bindings.results.map((binding) => binding.order);
        if (orders.length < 1) {
            return 0;
        }
        return Math.max(...orders) + 1;
    }

    renderModeSelector(): TemplateResult {
        return html` <ak-toggle-group
            value=${this.policyGroupUser}
            @ak-toggle=${(ev: CustomEvent<{ value: PolicyBindingCheckTarget }>) => {
                this.policyGroupUser = ev.detail.value;
            }}
        >
            ${Object.keys(PolicyBindingCheckTarget).map((ct) => {
                if (this.allowedTypes.includes(ct as PolicyBindingCheckTarget)) {
                    return html`<option value=${ct}>
                        ${PolicyBindingCheckTargetToLabel(ct as PolicyBindingCheckTarget)}
                    </option>`;
                }
                return nothing;
            })}
        </ak-toggle-group>`;
    }

    renderForm(): TemplateResult {
        return html` <div class="pf-c-card pf-m-selectable pf-m-selected">
                <div class="pf-c-card__body">${this.renderModeSelector()}</div>
                <div class="pf-c-card__footer">
                    <ak-form-element-horizontal
                        label=${msg("Policy")}
                        name="policy"
                        ?hidden=${this.policyGroupUser !== PolicyBindingCheckTarget.policy}
                    >
                        <ak-search-select
                            .groupBy=${(items: Policy[]) => {
                                return groupBy(items, (policy) => policy.verboseNamePlural);
                            }}
                            .fetchObjects=${async (query?: string): Promise<Policy[]> => {
                                const args: PoliciesAllListRequest = {
                                    ordering: "name",
                                };
                                if (query !== undefined) {
                                    args.search = query;
                                }
                                const policies = await new PoliciesApi(
                                    DEFAULT_CONFIG,
                                ).policiesAllList(args);
                                return policies.results;
                            }}
                            .renderElement=${(policy: Policy): string => {
                                return policy.name;
                            }}
                            .value=${(policy: Policy | undefined): string | undefined => {
                                return policy?.pk;
                            }}
                            .selected=${(policy: Policy): boolean => {
                                return policy.pk === this.instance?.policy;
                            }}
                            blankable
                        >
                        </ak-search-select>
                        ${this.typeNotices
                            .filter(({ type }) => type === PolicyBindingCheckTarget.policy)
                            .map((msg) => {
                                return html`<p class="pf-c-form__helper-text">${msg.notice}</p>`;
                            })}
                    </ak-form-element-horizontal>
                    <ak-form-element-horizontal
                        label=${msg("Group")}
                        name="group"
                        ?hidden=${this.policyGroupUser !== PolicyBindingCheckTarget.group}
                    >
                        <ak-search-select
                            .fetchObjects=${async (query?: string): Promise<Group[]> => {
                                const args: CoreGroupsListRequest = {
                                    ordering: "name",
                                    includeUsers: false,
                                };
                                if (query !== undefined) {
                                    args.search = query;
                                }
                                const groups = await new CoreApi(DEFAULT_CONFIG).coreGroupsList(
                                    args,
                                );
                                return groups.results;
                            }}
                            .renderElement=${(group: Group): string => {
                                return group.name;
                            }}
                            .value=${(group: Group | undefined): string | undefined => {
                                return group?.pk;
                            }}
                            .selected=${(group: Group): boolean => {
                                return group.pk === this.instance?.group;
                            }}
                            blankable
                        >
                        </ak-search-select>
                        ${this.typeNotices
                            .filter(({ type }) => type === PolicyBindingCheckTarget.group)
                            .map((msg) => {
                                return html`<p class="pf-c-form__helper-text">${msg.notice}</p>`;
                            })}
                    </ak-form-element-horizontal>
                    <ak-form-element-horizontal
                        label=${msg("User")}
                        name="user"
                        ?hidden=${this.policyGroupUser !== PolicyBindingCheckTarget.user}
                    >
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
                            .selected=${(user: User): boolean => {
                                return user.pk === this.instance?.user;
                            }}
                            blankable
                        >
                        </ak-search-select>
                        ${this.typeNotices
                            .filter(({ type }) => type === PolicyBindingCheckTarget.user)
                            .map((msg) => {
                                return html`<p class="pf-c-form__helper-text">${msg.notice}</p>`;
                            })}
                    </ak-form-element-horizontal>
                </div>
            </div>
            <ak-form-element-horizontal name="enabled">
                <label class="pf-c-switch">
                    <input
                        class="pf-c-switch__input"
                        type="checkbox"
                        ?checked=${this.instance?.enabled ?? true}
                    />
                    <span class="pf-c-switch__toggle">
                        <span class="pf-c-switch__toggle-icon">
                            <i class="fas fa-check" aria-hidden="true"></i>
                        </span>
                    </span>
                    <span class="pf-c-switch__label">${msg("Enabled")}</span>
                </label>
            </ak-form-element-horizontal>
            <ak-form-element-horizontal name="negate">
                <label class="pf-c-switch">
                    <input
                        class="pf-c-switch__input"
                        type="checkbox"
                        ?checked=${this.instance?.negate ?? false}
                    />
                    <span class="pf-c-switch__toggle">
                        <span class="pf-c-switch__toggle-icon">
                            <i class="fas fa-check" aria-hidden="true"></i>
                        </span>
                    </span>
                    <span class="pf-c-switch__label">${msg("Negate result")}</span>
                </label>
                <p class="pf-c-form__helper-text">
                    ${msg("Negates the outcome of the binding. Messages are unaffected.")}
                </p>
            </ak-form-element-horizontal>
            <ak-form-element-horizontal label=${msg("Order")} required name="order">
                <input
                    type="number"
                    value="${this.instance?.order ?? this.defaultOrder}"
                    class="pf-c-form-control"
                    required
                />
            </ak-form-element-horizontal>
            <ak-form-element-horizontal label=${msg("Timeout")} required name="timeout">
                <input
                    type="number"
                    value="${this.instance?.timeout ?? 30}"
                    class="pf-c-form-control"
                    required
                />
            </ak-form-element-horizontal>
            <ak-form-element-horizontal name="failureResult" label=${msg("Failure result")}>
                <ak-radio
                    .options=${[
                        {
                            label: msg("Pass"),
                            value: true,
                        },
                        {
                            label: msg("Don't pass"),
                            value: false,
                            default: true,
                        },
                    ]}
                    .value=${this.instance?.failureResult}
                >
                </ak-radio>
                <p class="pf-c-form__helper-text">
                    ${msg("Result used when policy execution fails.")}
                </p>
            </ak-form-element-horizontal>`;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "ak-policy-binding-form": PolicyBindingForm;
    }
}
