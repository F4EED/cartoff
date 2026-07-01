# go-pmtiles

> **Cartoff :** binaire Windows `pmtiles.exe` fourni dans ce dossier pour manipuler les archives PMTiles du projet (extraction, inspection). Utilisé par `scripts/build_loire_pmtiles.py` pour regénérer `pmtiles/loire.pmtiles`. Voir [README PMTiles](../README.md) pour la restauration après `git clone`, le serveur `serve.py` / `start.bat`, et la configuration `levelDiff: 0` dans `index.html`.

The single-file utility for creating and working with [PMTiles](https://github.com/protomaps/PMTiles) archives.

## Installation

See [Releases](https://github.com/protomaps/go-pmtiles/releases) for your OS and architecture.

## Docs

See [docs.protomaps.com/pmtiles/cli](https://docs.protomaps.com/pmtiles/cli) for usage.

See [Go package docs](https://pkg.go.dev/github.com/protomaps/go-pmtiles/pmtiles) for API usage.

## Development

Run the program in development:

```sh
go run main.go
```

Run the test suite:

```sh
go test ./pmtiles
```
