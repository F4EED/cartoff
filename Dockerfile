# Utilise l'image officielle de Nginx (version alpine pour un container plus léger)
FROM nginx:alpine

# Change le répertoire de travail pour /usr/share/nginx/html
# C'est ici que Nginx cherche par défaut les fichiers à servir.
WORKDIR /usr/share/nginx/html

# Copie le fichier index.html dans le répertoire de travail
# Si ton fichier index.html est dans le même répertoire que le Dockerfile
COPY ./index.html /usr/share/nginx/html/

# Tu peux aussi copier des fichiers supplémentaires (par exemple, si tu as des assets Leaflet)
# COPY ./assets/ /usr/share/nginx/html/assets/

# Change le fichier de configuration Nginx (facultatif mais recommandé pour gérer les ports)
# On copie un fichier nginx.conf personnalisé (si tu en as un, sinon laisse cette ligne)
# COPY ./nginx.conf /etc/nginx/nginx.conf

# Expose le port 8043 (port que tu utiliseras pour accéder à ton site)
EXPOSE 8043

# Commande pour démarrer Nginx en mode non-détaché (en arrière-plan)
CMD ["nginx", "-g", "daemon off;"] 
