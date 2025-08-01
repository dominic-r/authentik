import "../EmptyState.js";

import { akEmptyState } from "../EmptyState.js";

import { render } from "#elements/tests/utils";

import { $, expect } from "@wdio/globals";

import { msg } from "@lit/localize";
import { html } from "lit";

describe("ak-empty-state", () => {
    afterEach(async () => {
        await browser.execute(async () => {
            await document.body.querySelector("ak-empty-state")?.remove();
            if (document.body._$litPart$) {
                // @ts-expect-error expression of type '"_$litPart$"' is added by Lit
                await delete document.body._$litPart$;
            }
        });
    });

    it("should render the default loader", async () => {
        render(html`<ak-empty-state default-label></ak-empty-state>`);

        const empty = await $("ak-empty-state").$(">>>.pf-c-empty-state__icon");
        await expect(empty).toExist();

        const header = await $("ak-empty-state").$(">>>.pf-c-title");
        await expect(header).toHaveText("Loading");
    });

    it("should handle standard boolean", async () => {
        render(html`<ak-empty-state loading>Waiting</ak-empty-state>`);

        const empty = await $("ak-empty-state").$(">>>.pf-c-empty-state__icon");
        await expect(empty).toExist();

        const header = await $("ak-empty-state").$(">>>.pf-c-title");
        await expect(header).toHaveText("Waiting");
    });

    it("should render a static empty state", async () => {
        render(html`<ak-empty-state><span>${msg("No messages found")}</span> </ak-empty-state>`);

        const empty = await $("ak-empty-state").$(">>>.pf-c-empty-state__icon");
        await expect(empty).toExist();
        await expect(empty).toHaveClass("fa-question-circle");

        const header = await $("ak-empty-state").$(">>>.pf-c-title");
        await expect(header).toHaveText("No messages found");
    });

    it("should render a slotted message", async () => {
        render(
            html`<ak-empty-state
                ><span>${msg("No messages found")}</span>
                <p slot="body">Try again with a different filter</p>
            </ak-empty-state>`,
        );

        const message = await $("ak-empty-state").$(">>>.pf-c-empty-state__body").$(">>>p");
        await expect(message).toHaveText("Try again with a different filter");
    });

    it("should render as a function call", async () => {
        render(akEmptyState({ loading: true }, "Being Thoughtful"));

        const empty = await $("ak-empty-state").$(">>>.pf-c-empty-state__icon");
        await expect(empty).toExist();

        const header = await $("ak-empty-state").$(">>>.pf-c-empty-state__body");
        await expect(header).toHaveText("Being Thoughtful");
    });

    it("should render as a complex function call", async () => {
        render(
            akEmptyState(
                { loading: true },
                html` <span slot="body">Introspecting</span>
                    <span slot="primary">... carefully</span>`,
            ),
        );

        const empty = await $("ak-empty-state").$(">>>.pf-c-empty-state__icon");
        await expect(empty).toExist();

        const header = await $("ak-empty-state").$(">>>.pf-c-empty-state__body");
        await expect(header).toHaveText("Introspecting");

        const primary = await $("ak-empty-state").$(">>>.pf-c-empty-state__primary");
        await expect(primary).toHaveText("... carefully");
    });
});
