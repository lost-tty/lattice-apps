# Inventory App

Lattice-hosted inventory tracker. Preact + Lattice SDK, backed by a `core:kvstore`.

## Build

```
npm install
npm run bundle   # build + zip → inventory.zip
```

## Upload

```
curl -X POST "http://localhost:8080/api/apps/bundles?registry_store_id=<ROOT_STORE_ID>" \
     -H "Content-Type: application/octet-stream" \
     --data-binary @inventory.zip
```

## Dev

```
npm run watch    # rebuild on save (no zip)
```
