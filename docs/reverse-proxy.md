# Reverse Proxy Configuration

This guide covers deploying Deebee behind a reverse proxy like nginx or Apache, including HTTPS setup and authentication.

## Overview

Deebee supports deployment behind reverse proxies with custom base paths using the `VITE_BASE_PATH` environment variable (available since v1.5.30).

## Quick Setup

### Docker Configuration

Set the base path when running Deebee:

```yaml
services:
  deebee:
    image: ghcr.io/ll931217/deebee:latest
    ports:
      - "127.0.0.1:5521:5521"  # Only bind to localhost
    environment:
      VITE_CLICKHOUSE_URL: "http://clickhouse:8123"
      VITE_CLICKHOUSE_USER: "default"
      VITE_CLICKHOUSE_PASS: "password"
      VITE_BASE_PATH: "/deebee"  # Must match proxy location
```

## Nginx Configuration

### Basic Setup

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Deebee with custom base path
    location /deebee/ {
        proxy_pass http://localhost:5521/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket support for real-time features
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        
        # Timeout settings for long queries
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
}
```

### HTTPS with Let's Encrypt

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    location /deebee/ {
        proxy_pass http://localhost:5521/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### Basic Authentication

Add password protection:

```nginx
location /deebee/ {
    auth_basic "Restricted Access";
    auth_basic_user_file /etc/nginx/.htpasswd;
    
    proxy_pass http://localhost:5521/;
    # ... other proxy settings
}
```

Create password file:
```bash
htpasswd -c /etc/nginx/.htpasswd username
```

### Multiple Deebee Instances

Host multiple instances at different paths:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Production instance
    location /deebee-prod/ {
        proxy_pass http://localhost:5521/;
        # ... proxy settings
    }

    # Development instance
    location /deebee-dev/ {
        proxy_pass http://localhost:5522/;
        # ... proxy settings
    }
}
```

## Apache Configuration

### Basic Setup

Enable required modules:
```bash
a2enmod proxy proxy_http proxy_wstunnel headers
```

Configure virtual host:
```apache
<VirtualHost *:80>
    ServerName your-domain.com

    # Deebee proxy
    ProxyPreserveHost On
    ProxyPass /deebee/ http://localhost:5521/
    ProxyPassReverse /deebee/ http://localhost:5521/
    
    # WebSocket support
    RewriteEngine On
    RewriteCond %{HTTP:Upgrade} websocket [NC]
    RewriteCond %{HTTP:Connection} upgrade [NC]
    RewriteRule ^/deebee/(.*) ws://localhost:5521/$1 [P,L]
    
    # Headers
    RequestHeader set X-Forwarded-Proto "http"
</VirtualHost>
```

### HTTPS Configuration

```apache
<VirtualHost *:443>
    ServerName your-domain.com
    
    SSLEngine On
    SSLCertificateFile /etc/letsencrypt/live/your-domain.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/your-domain.com/privkey.pem
    
    # Security Headers
    Header always set X-Frame-Options "SAMEORIGIN"
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-XSS-Protection "1; mode=block"
    
    # Deebee proxy
    ProxyPreserveHost On
    ProxyPass /deebee/ http://localhost:5521/
    ProxyPassReverse /deebee/ http://localhost:5521/
    
    # WebSocket support
    RewriteEngine On
    RewriteCond %{HTTP:Upgrade} websocket [NC]
    RewriteCond %{HTTP:Connection} upgrade [NC]
    RewriteRule ^/deebee/(.*) ws://localhost:5521/$1 [P,L]
    
    RequestHeader set X-Forwarded-Proto "https"
</VirtualHost>
```

### Basic Authentication

```apache
<Location /deebee/>
    AuthType Basic
    AuthName "Restricted Access"
    AuthUserFile /etc/apache2/.htpasswd
    Require valid-user
    
    ProxyPass http://localhost:5521/
    ProxyPassReverse http://localhost:5521/
</Location>
```

## Traefik Configuration

### Docker Compose with Traefik

```yaml
version: '3.8'

services:
  traefik:
    image: traefik:v2.10
    command:
      - "--api.insecure=true"
      - "--providers.docker=true"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock

  deebee:
    image: ghcr.io/ll931217/deebee:latest
    environment:
      VITE_CLICKHOUSE_URL: "http://clickhouse:8123"
      VITE_CLICKHOUSE_USER: "default"
      VITE_CLICKHOUSE_PASS: "password"
      VITE_BASE_PATH: "/deebee"
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.deebee.rule=Host(`your-domain.com`) && PathPrefix(`/deebee`)"
      - "traefik.http.routers.deebee.entrypoints=websecure"
      - "traefik.http.routers.deebee.tls=true"
      - "traefik.http.services.deebee.loadbalancer.server.port=5521"
      - "traefik.http.middlewares.deebee-stripprefix.stripprefix.prefixes=/deebee"
      - "traefik.http.routers.deebee.middlewares=deebee-stripprefix"
```

## Caddy Configuration

### Caddyfile

```caddy
your-domain.com {
    handle_path /deebee/* {
        reverse_proxy localhost:5521
    }
}
```

### With Authentication

```caddy
your-domain.com {
    handle_path /deebee/* {
        basicauth {
            username $2a$14$...  # bcrypt hash
        }
        reverse_proxy localhost:5521
    }
}
```

## HAProxy Configuration

```haproxy
frontend http_front
    bind *:80
    acl is_deebee path_beg /deebee
    use_backend deebee_backend if is_deebee

backend deebee_backend
    server deebee localhost:5521 check
    http-request set-path %[path,regsub(^/deebee,/)]
    http-request set-header X-Forwarded-Proto http
```

## Complete Production Example

### Docker Compose

```yaml
version: '3.8'

services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
      - ./htpasswd:/etc/nginx/.htpasswd
    depends_on:
      - deebee

  deebee:
    image: ghcr.io/ll931217/deebee:latest
    restart: always
    environment:
      VITE_CLICKHOUSE_URL: "${CLICKHOUSE_URL}"
      VITE_CLICKHOUSE_USER: "${CLICKHOUSE_USER}"
      VITE_CLICKHOUSE_PASS: "${CLICKHOUSE_PASS}"
      VITE_BASE_PATH: "/deebee"
    networks:
      - internal

  clickhouse:
    image: clickhouse/clickhouse-server
    volumes:
      - clickhouse-data:/var/lib/clickhouse
    networks:
      - internal

networks:
  internal:

volumes:
  clickhouse-data:
```

### Nginx Configuration

```nginx
events {
    worker_connections 1024;
}

http {
    upstream deebee {
        server deebee:5521;
    }

    server {
        listen 80;
        return 301 https://$host$request_uri;
    }

    server {
        listen 443 ssl http2;
        
        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;
        
        location /deebee/ {
            auth_basic "Deebee Access";
            auth_basic_user_file /etc/nginx/.htpasswd;
            
            proxy_pass http://deebee/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            
            # WebSocket
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            
            # Timeouts
            proxy_read_timeout 300s;
            proxy_connect_timeout 75s;
            
            # Buffer settings
            proxy_buffering off;
            proxy_buffer_size 4k;
            proxy_buffers 8 4k;
        }
    }
}
```

## Troubleshooting

### Assets Not Loading (404 errors)

**Problem**: CSS/JS files return 404
**Solution**: Ensure `VITE_BASE_PATH` matches your proxy location

```yaml
# Wrong
VITE_BASE_PATH: "/deebee/"  # Don't include trailing slash

# Correct
VITE_BASE_PATH: "/deebee"
```

### WebSocket Connection Failed

**Problem**: Real-time features not working
**Solution**: Add WebSocket proxy headers

```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

### Authentication Loop

**Problem**: Continuous authentication prompts
**Solution**: Check session handling and cookies

```nginx
proxy_set_header Cookie $http_cookie;
proxy_cookie_path / /deebee/;
```

### Slow Query Timeout

**Problem**: Long queries timeout
**Solution**: Increase proxy timeout

```nginx
proxy_read_timeout 600s;  # 10 minutes
proxy_send_timeout 600s;
```

## Security Best Practices

1. **Always use HTTPS** in production
2. **Implement authentication** at proxy level
3. **Restrict access** by IP if possible
4. **Use strong passwords** for basic auth
5. **Keep proxy software updated**
6. **Monitor access logs** regularly
7. **Implement rate limiting** to prevent abuse

### Rate Limiting Example (nginx)

```nginx
limit_req_zone $binary_remote_addr zone=deebee:10m rate=10r/s;

location /deebee/ {
    limit_req zone=deebee burst=20 nodelay;
    # ... proxy configuration
}
```

## Related Documentation

- [Getting Started](/getting-started) - Initial setup
- [Environment Variables](/environment-variables) - Configuration reference
- [Troubleshooting](/troubleshooting) - Common issues
- [Security](/permissions) - ClickHouse permissions