import { describe, expect, it } from "vitest";
import { createTemplateEngine } from "./index.js";

describe("createTemplateEngine", () => {
    it("reads paths from the roots it was given, and from no others", () => {
        const one = createTemplateEngine({ roots: ["job"] });
        const other = createTemplateEngine({ roots: ["event", "host"] });
        expect(one.renderTemplate("{{job.name}}", { job: { name: "Daily" } })).toBe("Daily");
        expect(one.templateError('"{{event.kind}}"')).toBe('"{{event.kind}}": a path starts with job');
        expect(other.templateError('"{{job.name}}"')).toBe('"{{job.name}}": a path starts with event, host');
    });

    it("says which roots it has", () => {
        expect(createTemplateEngine({ roots: ["event", "host"] }).roots).toEqual(["event", "host"]);
    });

    it("is not changed by a later change to the list it was given", () => {
        const roots = ["event"];
        const engine = createTemplateEngine({ roots });
        roots.push("host");
        expect(engine.templateError('"{{host.name}}"')).toContain("a path starts with event");
    });

    it("can be taken apart: its functions do not depend on the engine they came from", () => {
        const { renderTemplateText, placeholderError } = createTemplateEngine({ roots: ["event"] });
        expect(renderTemplateText("k={{event.kind}}", { event: { kind: "x" } })).toBe("k=x");
        expect(placeholderError("{{nope}}")).toBe('"{{nope}}": a path starts with event');
    });

    it("refuses roots a path could not start with", () => {
        expect(() => createTemplateEngine({ roots: [] })).toThrow("at least one root");
        expect(() => createTemplateEngine({ roots: ["event", "a.b"] })).toThrow('"a.b" cannot be a root');
        expect(() => createTemplateEngine({ roots: ["__proto__"] })).toThrow('"__proto__" cannot be a root');
        expect(() => createTemplateEngine({ roots: ["event", "event"] })).toThrow('"event" is a root twice');
    });
});
