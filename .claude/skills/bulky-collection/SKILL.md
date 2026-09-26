---
name: bulky-collection
description: "Author a BulkyApi collection as importable JSON — the collection/item/environment shape, the api.* script DSL, item conventions, how to verify the requests before saving, and which importer accepts which shape. Use when asked to create, extend, or fix a BulkyApi collection for an API, or to turn a schema/spec/curl command into saved requests."
trigger: "/bulky-collection"
---

# Authoring a BulkyApi collection

A collection is a JSON file the user imports. Nothing is written to their
account programmatically — produce the file, verify the calls in it, tell them
how to import it.

Requests are **JavaScript scripts** against an `api.*` DSL, not static request
forms. One item can chain calls, loop, extract variables, and assert.

## Workflow

1. **Discover the API.** Read the spec, `$metadata`, OpenAPI doc, or service
   root — never invent set names, property names, or key syntax. For OData,
   load the `odata-usage` skill.
2. **Probe the live service** before writing anything. Confirm which query
   options, expands, filters, and paths actually work on *that deployment* —
   servers routinely skip parts of a spec. Record the 404s and 405s; they are
   the most valuable thing in the collection.
3. **Design the items** — one concern each, ordered so the early ones seed the
   variables the later ones use.
4. **Write the JSON** to `collections/<name>.bulky.json`. Generate it with a
   short script rather than hand-editing escaped JS inside JSON.
5. **Verify every script's calls run** (see Verifying).
6. **Report** the item list, the env vars, and the import steps.

## File shape

Exact types: [`src/lib/sampleData.ts`](../../../src/lib/sampleData.ts).
Import reducer: `importCollections` in
[`src/store/collectionsSlice.ts`](../../../src/store/collectionsSlice.ts).

```jsonc
[
  {
    "id": "placeholder",              // reassigned on import
    "name": "Profile Service (dev)",
    "open": true,                     // expanded in the sidebar
    "envIdx": 0,                      // which environment is active
    "environments": [
      { "id": "placeholder", "name": "dev", "vars": { "baseUrl": "https://…" } }
    ],
    "items": [
      {
        "id": "placeholder",
        "name": "00 - Service document",
        "method": "GET",              // sidebar badge only; the script decides
        "code": "const r = await api.get(env.baseUrl + '/');\n"
      }
    ]
  }
]
```

Every key is required — `importCollections` only defaults `environments` and
`envIdx`. `vars` values are strings, always.

## Which importer takes which shape

| Control | Accepts |
| --- | --- |
| Collections pane → Import collection | one collection object, or an array |
| File pane → Import collection | the above, plus `{ "collections": [...] }` and a legacy top-level `environments` |

Ship an **array of collections** — both importers take it. File pane → Export
collection emits the wrapped `{ "collections": [...] }` form, which the
collections dialog would import as one junk collection, so a round trip has to
go back through the file pane.

## Script surface

```js
// note: label shown on the next call in the run log
const r = await api.get('{{baseUrl}}/users/1');          // {{var}} interpolation
const s = await api.post(`${env.baseUrl}/users`, { name: 'Ada' }, {
  auth: { type: 'bearer', token: env.token },            // or 'basic' / 'apikey'
  headers: { 'X-Trace': 'bulky' },
});
console.log(s.status, s.data);
env.newUserId = s.data.id;                               // written back to the env
```

- Verbs: `get post put patch delete options`, each resolving to
  `{ data, status, headers, ok }`. `api.sse(url, opts?, onEvent)` for streams.
- With no `opts.auth`, a non-empty `env.token` becomes a bearer header on its
  own. Leave `token: ""` for an unauthenticated service.
- `api.server.*` behaves like `api.*`.
- `api.wait(ms)` pauses between calls — polling, rate limits — and shows as a
  divider line in the call list; the global `sleep(ms)` pauses without one.
  Stopping the run cancels either.
- Top-level `await` works. No `process`, `require`, or filesystem.
- Limits: 30s per call, 50 calls per run, bodies truncated past 20k chars. Keep
  loops under the call cap and say so in the script when a guard trims work.

## Item conventions

- **Numbered names** — `00 - Service document`, `01 - $metadata`. The sidebar
  renders `items` in array order and never sorts, so the numbers are there to
  survive renames and reordering, and to show the intended running order.
- **Every value that varies goes in the environment.** No literal hosts, ids,
  or tokens in a script body. Never write a real token into the JSON at all —
  ship the var empty and let the user fill it.
- **Seed then reuse.** An early item extracts `env.userId`; later items fall
  back to a lookup when it is empty, so any item runs standalone:
  ```js
  let id = env.userId;
  if (!id) {
    const first = await api.get(q('Users', { '$select': 'Id', '$top': 1 }));
    id = first.data.value[0].Id;
    env.userId = id;
  }
  ```
- **Comments carry the findings** — the quirk, the 404, the encoding rule that
  cost an hour. That is what makes the collection worth keeping.
- **Guard writes.** A POST/PATCH/DELETE from a saved item hits the real API.
  Gate it on an env flag that ships off, and log the reference form instead:
  ```js
  if (env.allowWrites !== 'true') {
    console.log('allowWrites is not "true" - nothing sent. Reference only:');
    console.log('  PATCH {baseUrl}/Things(<id>)  body: only changed fields (merge)');
  } else { /* … */ }
  ```
- **A last item worth adding:** one script with no calls that logs the probed
  quirks, enum values, and paging behavior of the deployment.
- Query strings need encoding, not hand-typing. Repeat a small helper in each
  item that needs it — items must stand alone, so shared code is duplicated:
  ```js
  const q = (path, opts = {}) => {
    const s = Object.entries(opts)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => k + '=' + encodeURIComponent(String(v)))
      .join('&');
    return env.baseUrl + '/' + path + (s ? '?' + s : '');
  };
  ```

## Verifying

Scripts run in the app, so verification happens outside it — send the same
calls with `curl` or a throwaway node script and check the status codes before
saving the item.

```bash
# read-only probes are safe; keep writes out of verification
curl -s -o /dev/null -w '%{http_code}\n' -H 'Accept: application/json' \
  'https://api.example.com/v1/Users?$top=1'
```

For anything past a couple of calls, drive them from one node script that
prints `status | label` per case and a pass/fail tally. Report real numbers —
"all 19 queries returned 200", not "should work". A query that returns `200`
with `0` rows means the example literal is wrong for this data: look up an
actual value and use it.

Never verify a write against a shared environment. Show the user the write
script and let them run it.

## Reporting back

Say what was probed and what broke, then the import steps:

> Collections pane → **Import collection** → pick the file. Reload any open
> BulkyApi tab first — the app persists whole snapshots and a stale tab can
> overwrite the import.

## Worked example

[`collections/profile-service-dev.bulky.json`](../../../collections/profile-service-dev.bulky.json)
— 21 items over an OData v4 service: service doc and `$metadata`, per-domain
reads with nested `$expand`, an enum-filter sweep, a `@odata.nextLink` pager, a
row-count sweep, a guarded write template, and a final item that logs the
deployment's quirks (nav path segments 404, `$batch` 405, page size 100).
