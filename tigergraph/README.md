# TigerGraph integration (optional)

TigerGraph is a derived graph index. Supabase remains authoritative; if the
graph is unavailable, analysis results are still stored and the `graph_sync`
row is marked `failed` or `skipped` so it can be retried later.

## Install

1. Create a graph named `Amethyst` (or set `TIGERGRAPH_GRAPH` to your name).
2. Run `schema.gsql` in GSQL Shell as a role that can create schema and queries:

```
gsql -g Amethyst schema.gsql
```

3. Install the query if your workflow does not do it automatically:

```
gsql -g Amethyst 'INSTALL QUERY amethyst_neighbors'
```

4. Set server environment:

```
TIGERGRAPH_URL=https://<instance>.tgcloud.io
TIGERGRAPH_GRAPH=Amethyst
TIGERGRAPH_TOKEN=<api token>
```

The server uses:

- `POST /graph/{graph}/upsert` for vertices and edges
- `POST /query/{graph}/amethyst_neighbors` with
  `{ "project_id", "entity_id", "depth" }`

Vertex ids are scoped as `<project_uuid>:<entity_id>`, so two projects can use
the same module path without collision. Upserts are idempotent per job and
overwrite the same vertex/edge ids.

## Status

The GSQL schema and payload shapes were written from TigerGraph's documented
REST format but have **not been executed against a live instance** in this
environment. Validate schema installation, upsert, and query in staging before
relying on them. If the query syntax differs for your TigerGraph version,
adjust `schema.gsql`; no application code changes are required as long as the
endpoint and parameter names stay the same.
