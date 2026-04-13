/**
 * @file nginx.conf
 * @description Configuration de production pour dodovroum.com (NestJS + Media Storage)
 */

server {
    server_name dodovroum.com www.dodovroum.com;

    # 1. Gestion des fichiers statiques (Images centralisées)
    # L'URL /storage/residences/image.jpg pointera vers /var/www/dodovroum-assets/residences/image.jpg
    location /storage/ {
        alias /var/www/dodovroum-assets/;

        # Sécurité et Accès Cross-Origin (Vital pour le Mobile & Web)
        add_header Access-Control-Allow-Origin *;
        add_header Access-Control-Allow-Methods 'GET, OPTIONS';
        add_header Access-Control-Allow-Headers 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range';

        # Performance Cache (30 jours)
        expires 30d;
        add_header Cache-Control "public, no-transform";

        # Sécurité : Pas de listing de dossier et pas d'exécution de scripts
        autoindex off;
        location ~ \.(php|pl|py|jsp|sh|cgi)$ {
            deny all;
        }
    }

    # 2. Proxy vers l'API NestJS (Swagger & Endpoints)
    location /api/ {
        proxy_pass http://localhost:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 3. Racine (Dashboard ou Frontend NestJS)
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Configuration SSL (Gérée par Certbot)
    listen [::]:443 ssl; 
    listen 443 ssl; 
    ssl_certificate /etc/letsencrypt/live/dodovroum.com/fullchain.pem; 
    ssl_certificate_key /etc/letsencrypt/live/dodovroum.com/privkey.pem; 
    include /etc/letsencrypt/options-ssl-nginx.conf; 
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; 
}

# Redirection HTTP vers HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name dodovroum.com www.dodovroum.com;
    
    if ($host = www.dodovroum.com) {
        return 301 https://$host$request_uri;
    }
    if ($host = dodovroum.com) {
        return 301 https://$host$request_uri;
    }
    return 404;
}
