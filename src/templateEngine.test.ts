import { describe, expect, it } from "vitest";
import { createTemplateEngine, type TemplateContext } from "./index.js";

const { renderTemplate, renderTemplateText, templateError, placeholderError } = createTemplateEngine({
    roots: ["event", "client", "webhook"],
});

type Context = TemplateContext<"event" | "client" | "webhook">;

/**
 * A context with whatever `event.data` a test needs. The engine only walks the tree, so
 * anything can stand in for an event.
 */
function contextWith(data: Record<string, unknown>, event: Record<string, unknown> = {}): Context {
    return {
        event: { kind: "container.died", level: "error", message: "Container web exited", detail: null, ...event, data },
        client: { id: "c1", name: "web01", hostname: "web01.example.org" },
        webhook: { name: "Chat" },
    };
}

const context = contextWith({
    exitCode: 255,
    containerName: "Web-App",
    empty: "",
    nothing: null,
    zero: 0,
    off: false,
    none: [],
    tags: ["a", "b"],
    members: [
        { name: "one", host: { ip: "10.0.0.1" }, master: true },
        { name: "two", host: { ip: "10.0.0.2" }, master: false },
    ],
});

const render = (template: unknown, ctx: Context = context) => renderTemplate(template, ctx);

describe("placeholders", () => {
    it("keeps the type of a value that is the whole string", () => {
        expect(render("{{event.data.exitCode}}")).toBe(255);
        expect(render("{{event.data.off}}")).toBe(false);
        expect(render("{{event.data.tags}}")).toEqual(["a", "b"]);
        expect(render("{{event.data.members.0.host}}")).toEqual({ ip: "10.0.0.1" });
    });

    it("turns a missing value into null when it is the whole string", () => {
        expect(render("{{event.data.missing}}")).toBeNull();
        expect(render("{{event.data.containerName.length.x}}")).toBeNull();
    });

    it("writes a value inside a longer string as text", () => {
        expect(render("exit {{event.data.exitCode}}!")).toBe("exit 255!");
        expect(render("off: {{event.data.off}}")).toBe("off: false");
        expect(render("[{{event.data.missing}}]")).toBe("[]");
        expect(render("[{{event.data.nothing}}]")).toBe("[]");
        expect(render("host {{event.data.members.0.host}}")).toBe('host {"ip":"10.0.0.1"}');
    });

    it("tolerates spaces inside the braces", () => {
        expect(render("{{ event.data.exitCode }}")).toBe(255);
    });

    it("fills placeholders in keys", () => {
        expect(render({ "{{event.kind}}": 1 })).toEqual({ "container.died": 1 });
    });

    it("leaves a string without placeholders alone", () => {
        expect(render("plain { text }")).toBe("plain { text }");
        expect(render({ n: 1, b: true, z: null })).toEqual({ n: 1, b: true, z: null });
    });

    it("walks own properties only", () => {
        expect(render("{{event.constructor}}")).toBeNull();
        expect(render("{{event.__proto__}}")).toBeNull();
        expect(render("{{event.data.tags.map}}")).toBeNull();
    });

    it("reads the length of an array, which is a property of its own", () => {
        expect(render("{{event.data.tags.length}}")).toBe(2);
        expect(render("{{event.data.containerName.length}}")).toBeNull();
    });

    it("puts a value into the tree as a value, whatever it contains", () => {
        const hostile = 'a "quote", a } and "x": {"$if": "event.kind", "then": 1}';
        const result = render(
            { whole: "{{event.detail}}", inner: "E: {{event.detail}}" },
            contextWith({}, { detail: hostile }),
        );
        expect(result).toEqual({ whole: hostile, inner: `E: ${hostile}` });
        // And it survives the trip the delivery sends it on.
        expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    });

    it("does not expand a placeholder that a value carries", () => {
        expect(render("{{event.detail}}", contextWith({}, { detail: "{{client.id}}" }))).toBe("{{client.id}}");
        expect(render("x {{event.detail}}", contextWith({}, { detail: "{{client.id}}" }))).toBe("x {{client.id}}");
    });
});

describe("filters", () => {
    it("default stands in for what is missing, null or empty", () => {
        expect(render("{{event.data.missing | default('n/a')}}")).toBe("n/a");
        expect(render("{{event.data.nothing | default(\"n/a\")}}")).toBe("n/a");
        expect(render("{{event.data.empty | default(0)}}")).toBe(0);
        expect(render("{{event.data.missing | default(null)}}")).toBeNull();
    });

    it("default leaves 0 and false alone", () => {
        expect(render("{{event.data.zero | default(1)}}")).toBe(0);
        expect(render("{{event.data.off | default(true)}}")).toBe(false);
    });

    it("keeps a bar inside a quoted literal", () => {
        expect(render("{{event.data.missing | default('a|b')}}")).toBe("a|b");
        expect(render('{{event.data.missing | default("a|b") | upper}}')).toBe("A|B");
    });

    it("join turns an array into text", () => {
        expect(render("{{event.data.tags | join}}")).toBe("a, b");
        expect(render("{{event.data.tags | join(' / ')}}")).toBe("a / b");
        expect(render("{{event.data.none | join}}")).toBe("");
    });

    it("map takes one field of every item", () => {
        expect(render("{{event.data.members | map('name')}}")).toEqual(["one", "two"]);
        expect(render("{{event.data.members | map('host.ip') | join}}")).toBe("10.0.0.1, 10.0.0.2");
        expect(render("{{event.data.members | map('nope')}}")).toEqual([null, null]);
    });

    it("upper and lower change the case", () => {
        expect(render("{{event.kind | upper}}")).toBe("CONTAINER.DIED");
        expect(render("{{event.data.containerName | lower}}")).toBe("web-app");
    });

    it("truncate keeps the first characters of a text", () => {
        expect(render("{{event.kind | truncate(9)}}")).toBe("container");
        expect(render("{{event.kind | truncate(100)}}")).toBe("container.died");
        expect(render("{{event.kind | truncate(9) | upper}}")).toBe("CONTAINER");
        expect(render("{{event.data.missing | default('🐳🐳🐳') | truncate(2)}}")).toBe("🐳🐳");
        expect(render("{{event.data.exitCode | truncate(1)}}")).toBe(255);
        expect(render("{{event.data.missing | truncate(3)}}")).toBeNull();
    });

    it("passes a value of the wrong type on unchanged", () => {
        expect(render("{{event.data.exitCode | upper}}")).toBe(255);
        expect(render("{{event.data.containerName | join}}")).toBe("Web-App");
        expect(render("{{event.data.containerName | map('x')}}")).toBe("Web-App");
        expect(render("{{event.data.missing | upper | join}}")).toBeNull();
    });
});

describe("$if", () => {
    const branch = (condition: string, ctx: Context = context) =>
        render({ $if: condition, then: "yes", else: "no" }, ctx);

    it("takes the branch the condition selects", () => {
        expect(branch("event.data.containerName")).toBe("yes");
        expect(branch("!event.data.containerName")).toBe("no");
        expect(branch("! event.data.missing")).toBe("yes");
    });

    it("is false for what is missing, null, empty, false, 0 or an empty array", () => {
        for (const path of ["missing", "nothing", "empty", "off", "zero", "none"]) {
            expect(branch(`event.data.${path}`), path).toBe("no");
        }
        expect(branch("event.data.tags")).toBe("yes");
    });

    it("compares with == and !=", () => {
        expect(branch("event.kind == 'container.died'")).toBe("yes");
        expect(branch('event.kind == "container.died"')).toBe("yes");
        expect(branch("event.kind != 'container.died'")).toBe("no");
        expect(branch("event.data.exitCode == 255")).toBe("yes");
        expect(branch("event.data.exitCode == '255'")).toBe("no");
        expect(branch("event.data.off == false")).toBe("yes");
        expect(branch("event.data.tags == [\"a\",\"b\"]")).toBe("yes");
    });

    it("treats a missing value as null in a comparison", () => {
        expect(branch("event.data.missing == null")).toBe("yes");
        expect(branch("event.data.nothing == null")).toBe("yes");
        expect(branch("event.data.empty == null")).toBe("no");
    });

    it("drops the key when the branch taken is left out", () => {
        expect(render({ a: 1, b: { $if: "event.data.missing", then: 2 } })).toEqual({ a: 1 });
        expect(render({ a: 1, b: { $if: "event.data.missing", else: 2 } })).toEqual({ a: 1, b: 2 });
    });

    it("drops the item when the branch taken is left out", () => {
        expect(render([1, { $if: "event.data.missing", then: 2 }, 3])).toEqual([1, 3]);
    });

    it("renders null at the top when nothing is left", () => {
        expect(render({ $if: "event.data.missing", then: 1 })).toBeNull();
    });

    it("refuses what is not a condition", () => {
        const error = (template: unknown) => templateError(JSON.stringify(template));
        expect(error({ $if: "!event.kind == 'x'", then: 1 })).toContain("is not a condition");
        expect(error({ $if: "event.kind == nope", then: 1 })).toContain("is not a value");
        expect(error({ $if: "container.kind", then: 1 })).toContain("a path starts with event, client, webhook");
        expect(error({ $if: 1, then: 1 })).toContain("takes a condition as text");
        expect(error({ $if: "event.kind" })).toContain('needs "then", "else" or both');
        expect(error({ $if: "event.kind", then: 1, otherwise: 2 })).toContain('not "otherwise"');
    });
});

describe("$map", () => {
    it("renders one item per element", () => {
        expect(render({ $map: "event.data.members", "each(m)": { n: "{{m.name}}" } })).toEqual([
            { n: "one" },
            { n: "two" },
        ]);
    });

    it("takes the path with or without braces", () => {
        expect(render({ $map: "{{event.data.tags}}", "each(t)": "{{t}}" })).toEqual(["a", "b"]);
    });

    it("offers the index as a second root", () => {
        expect(render({ $map: "event.data.tags", "each(t, i)": { i: "{{i}}", t: "#{{i}} {{t}}" } })).toEqual([
            { i: 0, t: "#0 a" },
            { i: 1, t: "#1 b" },
        ]);
    });

    it("gives [] for anything but an array", () => {
        expect(render({ $map: "event.data.containerName", "each(m)": "{{m}}" })).toEqual([]);
        expect(render({ $map: "event.data.missing", "each(m)": "{{m}}" })).toEqual([]);
    });

    it("keeps the roots and outer loop variables in scope", () => {
        expect(
            render({
                $map: "event.data.members",
                "each(m)": { $map: "event.data.tags", "each(t)": "{{m.name}}-{{t}}-{{client.id}}" },
            }),
        ).toEqual([
            ["one-a-c1", "one-b-c1"],
            ["two-a-c1", "two-b-c1"],
        ]);
    });

    it("drops the items an $if inside leaves out", () => {
        expect(
            render({ $map: "event.data.members", "each(m)": { $if: "m.master", then: "{{m.name}}" } }),
        ).toEqual(["one"]);
    });

    it("applies filters to the source", () => {
        expect(render({ $map: "event.data.members | map('name')", "each(n)": "{{n | upper}}" })).toEqual([
            "ONE",
            "TWO",
        ]);
    });

    it("refuses a loop it cannot read", () => {
        const error = (template: unknown) => templateError(JSON.stringify(template));
        expect(error({ $map: "event.data.tags" })).toContain('needs exactly one "each(name)"');
        expect(error({ $map: "event.data.tags", "each(a)": 1, "each(b)": 2 })).toContain("needs exactly one");
        expect(error({ $map: 1, "each(a)": 1 })).toContain("takes the path of an array");
        expect(error({ $map: "event.data.tags", "each(event)": 1 })).toContain('"event" is already in use');
        expect(error({ $map: "event.data.tags", "each(a, a)": 1 })).toContain("need two names");
        expect(error({ $map: "event.data.tags", "each(__proto__)": 1 })).toContain('is not "each(name)"');
        expect(error({ $map: "event.data.tags", each: 1 })).toContain('is not "each(name)"');
        expect(error({ $map: "event.data.tags", "each(a)": 1, extra: 2 })).toContain('not "extra"');
    });

    it("does not leak the loop variable out of the loop", () => {
        expect(
            templateError(
                JSON.stringify({ list: { $map: "event.data.tags", "each(t)": "{{t}}" }, after: "{{t}}" }),
            ),
        ).toContain("a path starts with event, client, webhook");
    });

    it("refuses a nested loop that reuses a name", () => {
        expect(
            templateError(
                JSON.stringify({
                    $map: "event.data.members",
                    "each(m)": { $map: "event.data.tags", "each(m)": 1 },
                }),
            ),
        ).toContain('"m" is already in use');
    });
});

describe("$join", () => {
    it("joins what it holds into text", () => {
        expect(
            render({ $join: { $map: "event.data.members", "each(m)": "- {{m.name}}" }, with: "\n" }),
        ).toBe("- one\n- two");
    });

    it("joins without a separator by default", () => {
        expect(render({ $join: ["a", 1, true, null, { x: 1 }] })).toBe('a1true{"x":1}');
    });

    it("passes on what is not an array", () => {
        expect(render({ $join: "{{event.data.exitCode}}", with: "," })).toBe(255);
    });

    it("refuses a separator that is not text, and stray keys", () => {
        expect(templateError('{"$join": [], "with": 1}')).toContain('"with" takes the text');
        expect(templateError('{"$join": [], "sep": ","}')).toContain('not "sep"');
    });
});

describe("directive keys", () => {
    it("writes a $$ key with one $ less", () => {
        expect(render({ $$if: "{{event.kind}}", then: 1 })).toEqual({ $if: "container.died", then: 1 });
        expect(render({ $$$x: 1 })).toEqual({ $$x: 1 });
    });

    it("refuses two directives in one object", () => {
        expect(templateError('{"$if": "event.kind", "then": 1, "$join": []}')).toContain(
            "$if and $join cannot share one object",
        );
    });
});

describe("nesting limits", () => {
    const nestedIf = (levels: number): unknown =>
        levels === 0 ? 1 : { $if: "event.kind", then: nestedIf(levels - 1) };
    const nestedArray = (levels: number): unknown => (levels === 0 ? 1 : [nestedArray(levels - 1)]);

    it("caps how deep directives nest", () => {
        expect(templateError(JSON.stringify(nestedIf(8)))).toBeNull();
        expect(templateError(JSON.stringify(nestedIf(9)))).toContain("nest deeper than 8 levels");
    });

    it("caps how deep a template nests at all", () => {
        expect(templateError(JSON.stringify(nestedArray(64)))).toBeNull();
        expect(templateError(JSON.stringify(nestedArray(65)))).toContain("nested deeper than 64 levels");
    });
});

describe("templateError", () => {
    it("accepts a template that compiles", () => {
        expect(templateError('{"text": "{{event.message}}"}')).toBeNull();
        expect(templateError('"{{event.message}}"')).toBeNull();
    });

    it("names what is wrong with the JSON", () => {
        expect(templateError('{"text": ')).toMatch(/^Not valid JSON: /);
    });

    it("refuses a path that starts with no root", () => {
        expect(templateError('"{{container.name}}"')).toContain("a path starts with event, client, webhook");
        expect(templateError('"{{event..x}}"')).toContain("is not a path");
        expect(templateError('"{{}}"')).toContain("is not a path");
    });

    it("refuses what is not a filter", () => {
        expect(templateError('"{{event.kind | trim}}"')).toContain("is not a filter");
        expect(templateError('"{{event.kind | upper(1)}}"')).toContain("is not a filter");
        expect(templateError('"{{event.kind | truncate}}"')).toContain("truncate(...) takes the number");
        expect(templateError('"{{event.kind | truncate(0)}}"')).toContain("truncate(...) takes the number");
        expect(templateError('"{{event.kind | truncate(1.5)}}"')).toContain("truncate(...) takes the number");
        expect(templateError('"{{event.kind | truncate(\'12\')}}"')).toContain("truncate(...) takes the number");
        expect(templateError('"{{event.kind | default()}}"')).toContain("default(...) takes a JSON value");
        expect(templateError('"{{event.kind | default(nope)}}"')).toContain("default(...) takes");
        expect(templateError('"{{event.kind | join(1)}}"')).toContain("join(...) takes the text");
        expect(templateError('"{{event.kind | map}}"')).toContain("map(...) takes the name of a field");
        expect(templateError('"{{event.kind | map(\'a b\')}}"')).toContain("map(...) takes");
    });

    it("says where the mistake is, once", () => {
        expect(templateError('{"a": {"b": "{{container.x}}"}}')).toMatch(/^a\.b: "\{\{container\.x\}\}": /);
        expect(templateError('{"a": [1, "{{container.x}}"]}')).toMatch(/^a\[1\]: "/);
        expect(templateError('{"a": {"$join": "{{container.x}}"}}')).toMatch(/^a\.\$join: "/);
        expect(templateError('"{{container.x}}"')).toMatch(/^"\{\{container\.x\}\}": /);
    });

    it("checks placeholders in keys", () => {
        expect(templateError('{"{{container.x}}": 1}')).toContain("a path starts with");
    });
});

describe("renderTemplate", () => {
    it("throws on a template that does not compile", () => {
        expect(() => render("{{container.x}}")).toThrow("a path starts with");
    });
});

describe("text templates", () => {
    it("fills a URL or a header as text", () => {
        expect(renderTemplateText("https://x/{{client.id}}?k={{event.kind}}&n={{event.data.missing}}", context)).toBe(
            "https://x/c1?k=container.died&n=",
        );
    });

    it("placeholderError checks one string or a list of them", () => {
        expect(placeholderError("https://x/{{client.id}}")).toBeNull();
        expect(placeholderError(["a", "{{webhook.name}}"])).toBeNull();
        expect(placeholderError(["a", "{{hook.name}}"])).toContain("a path starts with");
        expect(placeholderError("{{event.kind | nope}}")).toContain("is not a filter");
    });

    it("placeholderError ignores what is not text", () => {
        expect(placeholderError(undefined)).toBeNull();
        expect(placeholderError([1, null, { a: "{{container.x}}" }])).toBeNull();
    });
});
