# Todo App

Lattice-hosted todo list. Preact + Lattice SDK, backed by a `core:kvstore`.

## Build

```
npm install
npm run bundle   # build + zip → todo.zip
```

## Upload

```
curl -X POST "http://localhost:8080/api/apps/bundles?registry_store_id=<ROOT_STORE_ID>" \
     -H "Content-Type: application/octet-stream" \
     --data-binary @todo.zip
```

## Dev

```
npm run watch    # rebuild on save (no zip)
```
