# Base carto PMTiles — fichiers découpés

Le fichier `loire.pmtiles` (~132 Mo) dépasse la limite GitHub de **100 Mo par fichier**. Il n’est donc **pas versionné** tel quel (voir `.gitignore`).

À la place, le dépôt contient :

| Fichier | Rôle |
|---------|------|
| `loire.pmtiles.part001` | 1er morceau (80 Mo max) |
| `loire.pmtiles.part002` | 2e morceau |
| `loire.pmtiles.manifest.json` | Manifeste (tailles, liste des morceaux, empreinte SHA-256) |

Les scripts de découpage et de restauration se trouvent dans `scripts/` :

- `pack_large_file.py` — découpe un gros fichier en morceaux
- `unpack_large_file.py` — reconstitue le fichier original

---

## Restauration après `git clone`

**Prérequis :** Python 3 (aucune dépendance externe).

Depuis la racine du projet :

```bash
python scripts/unpack_large_file.py
```

Cette commande :

1. lit `pmtiles/loire.pmtiles.manifest.json` ;
2. assemble les morceaux `loire.pmtiles.part001`, `loire.pmtiles.part002`, etc. ;
3. recrée `pmtiles/loire.pmtiles` ;
4. vérifie la taille et l’empreinte SHA-256.

En cas de succès, vous devriez voir :

```
Contrôle SHA-256 : OK
Fichier reconstitué : pmtiles\loire.pmtiles
```

### Si le fichier existe déjà

```bash
python scripts/unpack_large_file.py --force
```

### Options utiles

```bash
# Manifeste ou sortie personnalisés
python scripts/unpack_large_file.py pmtiles/loire.pmtiles.manifest.json
python scripts/unpack_large_file.py -o chemin/vers/sortie.pmtiles
```

---

## Lancer la carte

`loire.pmtiles` doit être présent dans `pmtiles/` pour que la fond de carte s’affiche dans `index.html`.

Servez le projet via un serveur web (pas en `file://`) — par exemple :

```bash
python serve.py
```

Le serveur `serve.py` gère les requêtes HTTP Range nécessaires au format PMTiles.

---

## Recréer les morceaux (mise à jour de la base)

Si vous disposez d’un nouveau `loire.pmtiles` complet en local :

```bash
python scripts/pack_large_file.py
```

Par défaut, le script découpe `pmtiles/loire.pmtiles` en morceaux de **80 Mo** maximum et régénère le manifeste.

Puis versionnez les nouveaux morceaux et le manifeste (pas le `.pmtiles` complet) :

```bash
git add pmtiles/loire.pmtiles.part* pmtiles/loire.pmtiles.manifest.json
```

---

## Dépannage

| Problème | Piste |
|----------|-------|
| `Morceau manquant` | Vérifiez que tous les fichiers `.part00X` listés dans le manifeste sont présents (clone incomplet ?). |
| `Contrôle d'intégrité SHA-256 échoué` | Un morceau est corrompu ou tronqué ; retéléchargez depuis le dépôt ou regénérez avec `pack_large_file.py`. |
| `existe déjà` | Utilisez `--force` ou supprimez l’ancien `loire.pmtiles` avant de relancer. |
| Fond de carte vide | Confirmez que `pmtiles/loire.pmtiles` existe et que vous utilisez un serveur web (`python serve.py`). |

---

## Note sur la compression

Une compression gzip du PMTiles n’apporte pas de gain (le format est déjà optimisé). Seul le **découpage** permet de rester sous la limite GitHub.
