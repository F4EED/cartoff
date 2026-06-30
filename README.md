# 🚨 Cartoff

## Comprendre le terrain, décider plus vite.

**Cartoff** est un outil de cartographie open source dédié à la **gestion de crise**, conçu pour fonctionner **100% hors ligne**.

> ✅ Pensé pour les environnements dégradés  
> ✅ Fonctionne sans aucune connexion réseau  
> ✅ Basé sur Leaflet  

---

## 🧪 À propos du projet

Cartoff est avant tout un **POC (Proof of Concept)**.

👉 Objectif initial :  
explorer les possibilités de **Leaflet** pour créer un outil de cartographie utilisable en conditions réelles de crise.

Au fil des expérimentations, le projet a évolué vers un cas d’usage concret :

💥 **la gestion de crise en environnement sans connectivité**

---

## 🌍 Pourquoi Cartoff ?

En situation de crise (inondation, catastrophe naturelle, incident industriel),  
les réseaux sont souvent indisponibles.

👉 Mais les décisions, elles, ne peuvent pas attendre.

Cartoff répond à ce besoin :

- fournir une **cartographie opérationnelle**
- disponible **sans internet**
- simple, rapide et utilisable sur le terrain

---

## 🌊 Cas concret : inondation de la Loire

Crue soudaine :

- 🌊 zones inondées  
- 🚧 routes coupées  
- 📡 réseau indisponible  

👉 Les équipes terrain doivent malgré tout :
- comprendre la situation  
- se coordonner  
- continuer à intervenir  

### ✅ Avec Cartoff

- 🗺️ visualiser immédiatement les zones impactées  
- 🚧 identifier les routes impraticables  
- 📍 positionner des points critiques  
- ⚡ travailler **100% hors ligne**  

💥 Résultat : décisions plus rapides, meilleure coordination.

---

## ⚙️ Fonctionnalités

- 🗺️ Visualisation de données cartographiques (Leaflet)
- ⚡ Interface légère et rapide
- 🔌 Fonctionnement entièrement offline
- 📍 Ajout de points d’intérêt (incidents, zones, repères)
- 🧩 Architecture simple et extensible

---

## 🚨 Cas d’usage

Cartoff est conçu pour :

- 🚒 Services de secours (pompiers, sécurité civile)
- 🏛️ Collectivités locales
- 🌍 ONG / humanitaire
- 🛠️ Cellules de gestion de crise
- 🧭 Équipes terrain sans connectivité

---

## 🧠 Philosophie

Cartoff repose sur trois principes :

👉 **Simplicité**  
👉 **Robustesse en conditions dégradées**  
👉 **Exploration et ouverture (open source)**  

---

## 🚀 Démarrage

```bash
git clone https://github.com/F4EED/cartoff.git
cd cartoff

# Reconstituer le fond de carte PMTiles (morceaux versionnés → loire.pmtiles)
python scripts/unpack_large_file.py

# (Optionnel) Grille d'altitude Copernicus — voir elevation/README.md
pip install rasterio numpy shapely
python scripts/build_elevation_loire.py

# Serveur web local (HTTP Range requis pour PMTiles, port 8000 par défaut)
python serve.py -p 8000
```

👉 Ouvrir **http://localhost:8000** dans le navigateur.

Détails : [pmtiles/README.md](pmtiles/README.md) (fond de carte), [elevation/README.md](elevation/README.md) (MNT).