import "../AggregatePromiseCard.js";

import { AggregatePromiseCard, type IAggregatePromiseCard } from "../AggregatePromiseCard.js";

import type { Meta, StoryObj } from "@storybook/web-components";

import { html } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";

const metadata: Meta<AggregatePromiseCard> = {
    title: "Elements/<ak-aggregate-card-promise>",
    component: "ak-aggregate-card-promise",
    tags: ["autodocs"],
    parameters: {
        docs: {
            description: {
                component: /* md */ `
# Aggregate Promise Cards

Aggregate Promise Cards are Aggregate Cards that take a promise from client code and either display
the contents of that promise or a pre-configured failure notice. The contents must be compliant with
and produce a meaningful result via the \`.toString()\` API. HTML in the string will currently be
escaped.

## Usage

\`\`\`Typescript
import "#elements/cards/AggregatePromiseCard";
\`\`\`

\`\`\`html
<ak-aggregate-card-promise
    header="Some title"
    .promise="\${somePromise}"
></ak-aggregate-card-promise>
\`\`\`
`,
            },
        },
    },
    argTypes: {
        icon: { control: "text" },
        header: { control: "text" },
        headerLink: { control: "text" },
        subtext: { control: "text" },
        leftJustified: { control: "boolean" },
        failureMessage: { control: "text" },
    },
};

export default metadata;

const text =
    "Curl up and sleep on the freshly laundered towels mew, but make meme, make cute face growl at dogs in my sleep. Scratch me there, elevator butt humans, humans, humans oh how much they love us felines we are the center of attention they feed, they clean hopped up on catnip mice. Kitty time flop over, for see owner, run in terror";

const MILLIS_PER_SECOND = 1000;
const EXAMPLE_TIMEOUT = 8000; // 8 seconds

export const DefaultStory: StoryObj = {
    args: {
        icon: undefined,
        header: "Default",
        headerLink: undefined,
        subtext: `Demo has a ${EXAMPLE_TIMEOUT / MILLIS_PER_SECOND} second delay until resolution`,
        leftJustified: false,
    },
    render: ({ icon, header, headerLink, subtext, leftJustified }: IAggregatePromiseCard) => {
        const runThis = (timeout: number, value: string) =>
            new Promise((resolve) => setTimeout(resolve, timeout, value));

        return html`>
            <style>
                ak-aggregate-card-promise {
                    display: inline-block;
                    width: 32rem;
                    max-width: 32rem;
                }
            </style>
            <ak-aggregate-card-promise
                header=${ifDefined(header)}
                headerLink=${ifDefined(headerLink)}
                subtext=${ifDefined(subtext)}
                icon=${ifDefined(icon)}
                ?left-justified=${leftJustified}
                .promise=${runThis(EXAMPLE_TIMEOUT, text)}
            >
            </ak-aggregate-card-promise> `;
    },
};

export const PromiseRejected: StoryObj = {
    args: {
        icon: undefined,
        header: "Default",
        headerLink: undefined,
        subtext: `Demo has a ${EXAMPLE_TIMEOUT / MILLIS_PER_SECOND} second delay until resolution`,
        leftJustified: false,
        failureMessage: undefined,
    },
    render: ({
        icon,
        header,
        headerLink,
        subtext,
        leftJustified,
        failureMessage,
    }: IAggregatePromiseCard) => {
        const runThis = (timeout: number, value: string) =>
            new Promise((_resolve, reject) => setTimeout(reject, timeout, value));

        return html`
            <style>
                ak-aggregate-card-promise {
                    display: inline-block;
                    width: 32rem;
                    max-width: 32rem;
                }
            </style>
            <ak-aggregate-card-promise
                header=${ifDefined(header)}
                headerLink=${ifDefined(headerLink)}
                subtext=${ifDefined(subtext)}
                icon=${ifDefined(icon)}
                failureMessage=${ifDefined(failureMessage)}
                ?left-justified=${leftJustified}
                .promise=${runThis(EXAMPLE_TIMEOUT, text)}
            >
            </ak-aggregate-card-promise>
        `;
    },
};
