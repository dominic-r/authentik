#!/usr/bin/env node
// @ts-check
/**
 * Generate Glossary terms from markdown files.
 *
 * Input dir: website/docs/core/_glossary
 * ---
 * tags:
 *  - Tag A
 *  - Tag B
 * termName: Human Name
 * ---
 * <!-- shortDescription:begin -->
 * markdown...
 * <!-- shortDescription:end -->
 * <!-- longDescription:begin -->
 * markdown...
 * <!-- longDescription:end -->
 *
 * Output file: website/docusaurus-theme/components/Glossary/terms.generated.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(path.join(__dirname, "..", ".."));
const INPUT_DIR = path.join(ROOT, "docs", "core", "_glossary");
const OUTPUT_FILE = path.join(
    ROOT,
    "docusaurus-theme",
    "components",
    "Glossary",
    "terms.generated.ts",
);

/**
 * @typedef {Object} GeneratedTerm
 * @property {string} id
 * @property {string} term
 * @property {string} shortDefinition
 * @property {string=} fullDefinition
 * @property {string=} shortHtml
 * @property {string=} fullHtml
 * @property {string[]} tags
 */

/**
 * @typedef {Object} ParsedFrontmatter
 * @property {Record<string, unknown>} data
 * @property {string} body
 */

// (No separate TermFrontmatter typedef; we validate shape at runtime.)

/**
 * Extract content between strict markers.
 * @param {string} content
 * @param {"shortDescription"|"longDescription"} key
 * @returns {string}
 */
function extract(content, key) {
    const re = new RegExp(`<!--\\s*${key}:begin\\s*-->([\\s\\S]*?)<!--\\s*${key}:end\\s*-->`, "i");
    /** @type {RegExpMatchArray | null} */
    const m = content.match(re);
    if (!m) return "";
    const [, captured = ""] = m;
    return captured.trim();
}

/**
 * Minimal markdown-to-HTML converter matching client logic.
 * Escapes HTML, supports inline code, emphasis, links, bullet lists, and line breaks.
 * @param {string} md
 * @returns {string}
 */
function mdToHtml(md) {
    if (!md) return "";
    let html = String(md).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    if (/^\s*-\s+/m.test(html)) {
        html = html
            .split(/\n{2,}/)
            .map((block) => {
                const lines = block.split(/\n/);
                if (lines.every((l) => /^\s*-\s+/.test(l))) {
                    const items = lines
                        .map((l) => l.replace(/^\s*-\s+/, "").trim())
                        .map((c) => `<li>${c}</li>`)
                        .join("");
                    return `<ul>${items}</ul>`;
                }
                return block.replace(/\n/g, "<br/>");
            })
            .join("\n");
    } else {
        html = html.replace(/\n/g, "<br/>");
    }
    return html;
}

/**
 * Normalize a tag into a human-friendly display.
 * @param {string} tag
 * @returns {string}
 */
function humanizeTag(tag) {
    return String(tag).replace(/\s+/g, " ").trim();
}

/** List markdown files in a flat directory (no recursion).
 * @param {string} dir
 * @returns {string[]}
 */
function listMarkdownFiles(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isFile() && e.name.endsWith(".md"))
        .map((e) => path.join(dir, e.name));
}

/**
 * Parse simple YAML-like frontmatter (no external deps).
 * Supports:
 *  - key: value (single line)
 *  - key: (newline) - item (array)
 *  - key: a, b, c (comma separated list)
 * Returns { data, body } or null if no frontmatter.
 */
/**
 * @param {string} raw
 * @returns {ParsedFrontmatter | null}
 */
function parseFrontmatter(raw) {
    if (!raw.startsWith("---")) return null;
    const endIdx = raw.indexOf("\n---", 3);
    if (endIdx === -1) return null;
    const header = raw.slice(3, endIdx).trim();
    const body = raw.slice(endIdx + 4).replace(/^\s*\n/, "");
    /** @type {Record<string, unknown>} */
    const data = {};
    const lines = header.split(/\r?\n/);
    let i = 0;
    while (i < lines.length) {
        const line = String(lines[i] ?? "");
        const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
        if (!m) {
            i++;
            continue;
        }
        const key = String(m[1] ?? "");
        const rest = String(m[2] ?? "");
        if (rest === "") {
            // Possible list block (only recognized for known list keys like 'tags')
            /** @type {string[]} */
            const arr = [];
            let j = i + 1;
            while (j < lines.length) {
                const lm = String(lines[j] ?? "").match(/^\s*-\s*(.*)$/);
                if (!lm) break;
                const val = String(lm[1] ?? "").trim();
                if (val) arr.push(val);
                j++;
            }
            if (arr.length && key === "tags") data[key] = arr;
            i = j;
        } else {
            const value = rest.trim();
            if (key === "tags" && value.includes(",") && !/^\s*\[/.test(value)) {
                data[key] = value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean);
            } else if (key === "tags" && /^\s*\[(.*)\]\s*$/.test(value)) {
                const inner = value.replace(/^\s*\[|\]\s*$/g, "");
                data[key] = inner
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean);
            } else {
                data[key] = value.replace(/^['"]|['"]$/g, "");
            }
            i++;
        }
    }
    return { data, body };
}

/**
 * Read all terms from the flat input directory (one file per term).
 * @returns {GeneratedTerm[]}
 */
function readAllTerms() {
    const files = listMarkdownFiles(INPUT_DIR).sort((a, b) => a.localeCompare(b));
    /** @type {GeneratedTerm[]} */
    const terms = [];
    /** @type {Set<string>} */
    const seenIds = new Set();

    for (const p of files) {
        const raw = fs.readFileSync(p, "utf8");
        const fm = parseFrontmatter(raw);
        const id = path.basename(p, ".md");
        if (!fm) throw new Error(`Missing frontmatter in ${p}`);
        const d = fm.data;

        /** @type {unknown} */
        const rawTags = d["tags"];
        if (!Array.isArray(rawTags) || rawTags.some((t) => typeof t !== "string")) {
            throw new Error(`'tags' must be an array of strings in ${p}`);
        }
        /** @type {string[]} */
        const tags = rawTags.map((t) => humanizeTag(t)).filter(Boolean);

        /** @type {unknown} */
        const rawTermName = d["termName"];
        if (typeof rawTermName !== "string") {
            throw new Error(`'termName' is required and must be a string in ${p}`);
        }
        const termDisplayName = rawTermName.trim();
        if (!termDisplayName) throw new Error(`'termName' is required in ${p}`);
        if (tags.length === 0) throw new Error(`At least one tag is required in ${p}`);

        const shortDefinition = extract(fm.body, "shortDescription");
        const longDefinition = extract(fm.body, "longDescription");
        if (!shortDefinition) {
            throw new Error(`Missing shortDescription block in ${p}`);
        }

        const shortHtml = mdToHtml(shortDefinition);
        const fullHtml = longDefinition ? mdToHtml(longDefinition) : undefined;

        if (seenIds.has(id)) {
            throw new Error(`Duplicate term id '${id}' generated from filename ${p}`);
        }
        seenIds.add(id);

        terms.push({
            id,
            term: termDisplayName,
            shortDefinition,
            fullDefinition: longDefinition || undefined,
            shortHtml,
            fullHtml,
            tags: tags.sort((a, b) => a.localeCompare(b)),
        });
    }

    return terms.sort((a, b) => a.term.localeCompare(b.term));
}

/**
 * Write generated TS module with stable key order.
 * @param {GeneratedTerm[]} terms
 * @returns {void}
 */
function writeOutput(terms) {
    const header = `// This file is auto-generated by docs/scripts/generate-glossary.mjs\n`;
    const normalized = terms.map((t) => ({
        id: t.id,
        term: t.term,
        shortDefinition: t.shortDefinition,
        fullDefinition: t.fullDefinition,
        shortHtml: t.shortHtml,
        fullHtml: t.fullHtml,
        tags: t.tags,
    }));
    const json = JSON.stringify(normalized, null, 4);
    const body = `const terms = ${json} as const;\nexport default terms;\n`;
    fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, header + body, "utf8");
    // eslint-disable-next-line no-console
    console.log(`Generated ${OUTPUT_FILE} with ${terms.length} terms.`);
}

/** @type {GeneratedTerm[]} */
const terms = readAllTerms();
writeOutput(terms);
