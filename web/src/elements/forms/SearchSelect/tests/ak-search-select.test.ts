import "../ak-search-select.js";

import { SearchSelect } from "../ak-search-select.js";
import { sampleData, type ViewSample } from "../stories/sampleData.js";
import { AkSearchSelectViewDriver } from "./ak-search-select-view.comp.js";

/* eslint-env jest */
import { AKElement } from "#elements/Base";
import { bound } from "#elements/decorators/bound";
import { render } from "#elements/tests/utils";
import { CustomListenerElement } from "#elements/utils/eventEmitter";

import { $, browser, expect } from "@wdio/globals";
import { slug } from "github-slugger";

import { html } from "lit";
import { customElement, property, query } from "lit/decorators.js";

const renderElement = (fruit: ViewSample) => fruit.produce;

const renderDescription = (fruit: ViewSample) => html`${fruit.desc}`;

const renderValue = (fruit: ViewSample | undefined) => slug(fruit?.produce ?? "");

@customElement("ak-mock-search-group")
export class MockSearch extends CustomListenerElement(AKElement) {
    /**
     * The current fruit
     *
     * @attr
     */
    @property({ type: String, reflect: true })
    fruit?: string;

    @query("ak-search-select")
    search!: SearchSelect<ViewSample>;

    selectedFruit?: ViewSample;

    get value() {
        return this.selectedFruit ? renderValue(this.selectedFruit) : undefined;
    }

    @bound
    handleSearchUpdate(ev: CustomEvent) {
        ev.stopPropagation();
        this.selectedFruit = ev.detail.value;
        this.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }));
    }

    @bound
    selected(fruit: ViewSample) {
        return this.fruit === slug(fruit.produce);
    }

    @bound
    fetchObjects() {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const resolver = (resolve: any) => {
            this.addEventListener("resolve", () => {
                resolve(sampleData);
            });
        };
        return new Promise(resolver);
    }

    render() {
        return html`
            <ak-search-select
                .fetchObjects=${this.fetchObjects}
                .renderElement=${renderElement}
                .renderDescription=${renderDescription}
                .value=${renderValue}
                .selected=${this.selected}
                managed
                @ak-change=${this.handleSearchUpdate}
                blankable
            >
            </ak-search-select>
        `;
    }
}

describe("Search select: event driven startup", () => {
    let select: AkSearchSelectViewDriver;
    let wrapper: SearchSelect<ViewSample>;

    beforeEach(async () => {
        await render(html`<ak-mock-search-group></ak-mock-search-group>`, document.body);
        // @ts-ignore
        wrapper = await $(">>>ak-search-select");
    });

    it("should shift from the loading indicator to search select view on fetch event completed", async () => {
        expect(await wrapper).toBeExisting();
        expect(await $(">>>ak-search-select-loading-indicator")).toBeDisplayed();
        await browser.execute(() => {
            const mock = document.querySelector("ak-mock-search-group");
            mock?.dispatchEvent(new Event("resolve"));
        });
        expect(await $(">>>ak-search-select-loading-indicator")).not.toBeDisplayed();
        // @ts-expect-error "Another ChainablePromise mistake"
        select = await AkSearchSelectViewDriver.build(await $(">>>ak-search-select-view"));
        expect(await select).toBeExisting();
    });

    afterEach(async () => {
        await browser.execute(() => {
            document.body.querySelector("ak-mock-search-group")?.remove();
            // @ts-expect-error expression of type '"_$litPart$"' is added by Lit
            if (document.body._$litPart$) {
                // @ts-expect-error expression of type '"_$litPart$"' is added by Lit
                delete document.body._$litPart$;
            }
        });
    });
});
