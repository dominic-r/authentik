import { DEFAULT_CONFIG } from "#common/api/config";

import { AdminStatus, AdminStatusCard } from "#admin/admin-overview/cards/AdminStatusCard";

import { AdminApi, SystemInfo } from "@goauthentik/api";

import { msg } from "@lit/localize";
import { html, TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";

type StatusContent = { icon: string; message: TemplateResult };

@customElement("ak-admin-fips-status-system")
export class FipsStatusCard extends AdminStatusCard<SystemInfo> {
    icon = "pf-icon pf-icon-server";

    @state()
    statusSummary?: string;

    async getPrimaryValue(): Promise<SystemInfo> {
        return await new AdminApi(DEFAULT_CONFIG).adminSystemRetrieve();
    }

    setStatus(summary: string, content: StatusContent): Promise<AdminStatus> {
        this.statusSummary = summary;
        return Promise.resolve<AdminStatus>(content);
    }

    getStatus(value: SystemInfo): Promise<AdminStatus> {
        const runtime: any = value.runtime ?? {};
        const status: string | undefined = runtime.opensslFipsStatus;

        if (status === "enabled") {
            return this.setStatus(msg("OK"), {
                icon: "fa fa-check-circle pf-m-success",
                message: html`${msg("FIPS compliance: passing")}`,
            });
        }
        if (status === "disabled") {
            return this.setStatus(msg("Not enabled"), {
                icon: "fa fa-times-circle pf-m-danger",
                message: html`${msg("FIPS compliance: not enabled")}`,
            });
        }
        return this.setStatus(msg("Unverified"), {
            icon: "fa fa-info-circle pf-m-warning",
            message: html`${msg("FIPS compliance: unverified")}`,
        });
    }

    renderHeader(): TemplateResult {
        return html`${msg("FIPS Status")}`;
    }

    renderValue(): TemplateResult {
        return html`${this.statusSummary}`;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "ak-admin-fips-status-system": FipsStatusCard;
    }
}
