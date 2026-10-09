# js-template-engine

JSON templates with `{{path}}` placeholders, filters, conditions and loops.

A template is a JSON document, and it is filled in on the **parsed tree**, never as text.
What the context carries — an error message, a hostname — is put into the tree as a value,
so a quote or a brace in it cannot break the JSON or smuggle in keys of its own, and nothing
in a template is ever executed.

The engine has no dependencies and uses neither Node nor the DOM: a browser can preview a
template with the same code a server renders it with.

It is the template language of the webhooks of the
[Keepalived Status Monitor](https://github.com/stefgo/keepalived-status-monitor), the
[Docker Instance Manager](https://github.com/stefgo/docker-instance-manager) and the
[Proxmox Backup Client Manager](https://github.com/stefgo/proxmox-backup-client-manager), and
of the [Shutdown Notifier](https://github.com/stefgo/shutdown-notifier).

## Installation

The package is published to GitHub Packages. Point the `@stefgo` scope at it in `.npmrc` and
hand npm a token that may read packages:

```ini
@stefgo:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NPM_TOKEN}
```

```sh
npm install @stefgo/js-template-engine
```

## Usage

An engine is created with the **roots** a path may start with. They are the only thing the
grammar leaves open; everything else reads the same for every engine.

```ts
import { createTemplateEngine } from "@stefgo/js-template-engine";

const engine = createTemplateEngine({ roots: ["event", "host"] });

const template = {
    text: "[{{event.level | upper}}] {{host.name}}: {{event.message}}",
    code: "{{event.data.exitCode}}",
    tags: { $map: "event.data.tags", "each(t)": "#{{t}}" },
};

engine.renderTemplate(template, {
    event: { level: "error", message: "Backup failed", data: { exitCode: 255, tags: ["a", "b"] } },
    host: { name: "zeus" },
});
// { text: "[ERROR] zeus: Backup failed", code: 255, tags: ["#a", "#b"] }
```

| Function | Does |
| :------- | :--- |
| `createTemplateEngine({ roots })` | Creates an engine. Throws when `roots` is empty, holds a name twice, or holds something a path cannot start with. |
| `engine.renderTemplate(template, context)` | Fills a parsed template. Throws on a template that does not compile. |
| `engine.renderTemplateText(text, context)` | Fills the placeholders of one string as text — for a URL or a header. |
| `engine.templateError(source)` | Why a template, given as JSON text, cannot be used, or `null`. |
| `engine.placeholderError(strings)` | Why a string or a list of strings with placeholders cannot be used, or `null`. |
| `matchesKindPattern(kind, pattern)` | Whether a dotted kind matches a pattern: `job.*` matches every kind below `job.`. |

Check a template with `templateError` when it is stored. The check and the render compile the
template with the same code, so a template that passes cannot fail to compile later — and a
missing value never fails a render.

The functions of an engine do not depend on the object they came from and can be taken apart:

```ts
const { renderTemplate, templateError } = createTemplateEngine({ roots: ["event"] });
```

## The template language

### Placeholders

A placeholder is a path into the context: `{{event.data.exitCode}}`. A number reaches into
an array: `{{event.data.members.0.host}}`. Only own properties are found, so
`{{event.constructor}}` finds nothing.

| Template | Becomes |
| :------- | :------ |
| `"{{event.data.exitCode}}"` | The value itself, with its type: `255`. An object stays an object, a missing value becomes `null`. |
| `"exit {{event.data.exitCode}}"` | Text: `"exit 255"`. A missing value is written as `""`, an object as its JSON. |
| `{"{{event.kind}}": 1}` | Placeholders in keys are filled as text. |

A value is never read as a template: a placeholder or a directive that an event carries is
passed on as it is.

### Filters

Filters follow the path and can be chained: `{{event.data.members | map('host') | join(' / ')}}`.
An argument is a JSON value, or text in single quotes, which saves escaping quotes inside the
JSON template.

| Filter | Does |
| :----- | :--- |
| `default(<value>)` | Stands in for a value that is missing, `null` or `""`. `0` and `false` are values and stay. |
| `join` / `join(<text>)` | Turns an array into text, with `", "` unless told otherwise. |
| `map(<field>)` | Takes one field of every item of an array; the field may be a path, `map('host.ip')`. |
| `upper`, `lower` | Change the case of a text. |
| `truncate(<n>)` | Keeps the first `n` characters of a text — characters, not UTF-16 units. |

A filter handed a value of the wrong type passes it on unchanged.

### Conditions

```json
{ "$if": "event.level == 'error'", "then": "🔴", "else": "🟢" }
```

A condition is `path`, `!path`, `path == <literal>` or `path != <literal>`; there is no
expression language. A bare path is false for what is missing, `null`, `""`, `false`, `0` or
an empty array. In a comparison a missing value counts as `null`.

A branch that is left out drops the key (in an object) or the item (in an array):

```json
{ "text": "{{event.message}}", "detail": { "$if": "event.detail", "then": "{{event.detail}}" } }
```

### Loops

```json
{ "$map": "event.data.members", "each(m, i)": "{{i}}: {{m.host}} is {{m.state | lower}}" }
```

`$map` renders one item per element of the array, with `m` — and, if named, the index `i` — as
further roots inside it. The roots of the engine and the variables of outer loops stay in
reach. The source may carry filters, and anything but an array gives `[]`. An `$if` inside
the loop that drops its branch drops the item.

### Joining

```json
{ "$join": { "$map": "event.data.members", "each(m)": "- {{m.host}}" }, "with": "\n" }
```

`$join` renders what it holds and joins an array into text; `with` defaults to `""`.

### Escaping and limits

- A key starting with `$$` is written with one `$` less, for a target that wants a key such
  as `$if` itself.
- Loops only run over arrays the context carries, `$if`, `$map` and `$join` nest at most
  8 levels deep, and a template at most 64 levels — so a render always ends.
- An error says where it happened: `blocks[0].text: "{{foo.bar}}": a path starts with event, host`.

## Development

```sh
npm install
npm test          # Vitest
npm run lint      # tsc and ESLint
npm run build     # dist/
```

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/); a hook
checks them. They are what a release is made of: a push to `main` publishes a release, a push
to `dev` a prerelease on the `beta` dist-tag, and the version is derived from the commit
types since the last tag. A breaking change is marked with a `BREAKING CHANGE:` footer.

## License

[MIT](LICENSE)
