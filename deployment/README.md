# Deployment Guide for Time Logger Game API

## Overview
This guide covers the deployment of the Time Logger Game API to a production environment.

## Prerequisites
- Ubuntu 20.04 or newer
- Python 3.10+
- PostgreSQL 12+
- Nginx
- SSL certificate (Let's Encrypt recommended)
- Domain name configured with DNS

## Deployment Steps

### 1. Server Setup
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install required packages
sudo apt install -y python3.10 python3.10-venv python3-pip nginx postgresql postgresql-contrib certbot python3-certbot-nginx
```

### 2. Database Setup
```bash
# Create production database and user
sudo -u postgres psql
CREATE DATABASE timelogger;
CREATE USER time_game WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE timelogger TO time_game;
\q

# Run database migrations
psql -U time_game -d timelogger -f setup_db.sql
```

### 3. Application Setup
```bash
# Create application directory
sudo mkdir -p /opt/timelogger
sudo chown -R $USER:$USER /opt/timelogger

# Clone repository
git clone https://your-repo-url.git /opt/timelogger

# Set up Python environment
cd /opt/timelogger
python3.10 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Create production environment file
cp .env.example .env
# Edit .env with production values
```

### 4. Nginx Configuration
```bash
# Copy nginx configuration
sudo cp deployment/nginx.conf.template /etc/nginx/sites-available/timelogger
sudo ln -s /etc/nginx/sites-available/timelogger /etc/nginx/sites-enabled/

# Get SSL certificate
sudo certbot --nginx -d your-domain.com

# Test configuration
sudo nginx -t

# Restart nginx
sudo systemctl restart nginx
```

### 5. Application Service Setup
Create a systemd service file for the application:

```bash
sudo nano /etc/systemd/system/timelogger.service
```

Add the following content:
```ini
[Unit]
Description=Time Logger Game API
After=network.target

[Service]
User=www-data
Group=www-data
WorkingDirectory=/opt/timelogger
Environment="PATH=/opt/timelogger/venv/bin"
ExecStart=/opt/timelogger/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 4
Restart=always

[Install]
WantedBy=multi-user.target
```

Enable and start the service:
```bash
sudo systemctl enable timelogger
sudo systemctl start timelogger
```

## Security Considerations

### 1. Firewall Configuration
```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 2. Environment Variables
Required production environment variables:
- `DATABASE_URL`: Production database URL
- `SECRET_KEY`: Long, random string for JWT
- `OPENAI_API_KEY`: Your OpenAI API key
- `ALLOWED_ORIGINS`: Comma-separated list of allowed CORS origins

### 3. Rate Limiting
The nginx configuration includes rate limiting:
- 10 requests per second per IP
- Burst of 20 requests allowed
- Maximum request size of 25MB

## Monitoring

### 1. Log Locations
- Application logs: `/var/log/timelogger/`
- Nginx access logs: `/var/log/nginx/access.log`
- Nginx error logs: `/var/log/nginx/error.log`

### 2. Health Check
- Endpoint: `https://your-domain.com/health`
- Expected response: `200 OK`

## Backup Strategy

### 1. Database Backups
```bash
# Create backup script
sudo nano /opt/timelogger/backup.sh
```

Add the following content:
```bash
#!/bin/bash
BACKUP_DIR="/var/backups/timelogger"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
pg_dump -U time_game timelogger > "$BACKUP_DIR/timelogger_$TIMESTAMP.sql"
```

Set up daily cron job:
```bash
sudo crontab -e
# Add line:
0 0 * * * /opt/timelogger/backup.sh
```

## Troubleshooting

### Common Issues
1. 502 Bad Gateway
   - Check if the application is running: `sudo systemctl status timelogger`
   - Check application logs: `sudo journalctl -u timelogger`

2. SSL Certificate Issues
   - Renew certificate: `sudo certbot renew`
   - Check certificate status: `sudo certbot certificates`

3. Database Connection Issues
   - Check PostgreSQL status: `sudo systemctl status postgresql`
   - Verify database connection: `psql -U time_game -d timelogger -c "\conninfo"`

## Next Steps

### 1. Performance Optimization
- [ ] Configure PostgreSQL for production
- [ ] Set up connection pooling
- [ ] Implement caching if needed

### 2. Monitoring Setup
- [ ] Set up application metrics
- [ ] Configure error reporting
- [ ] Set up uptime monitoring

### 3. CI/CD Pipeline
- [ ] Set up automated testing
- [ ] Configure deployment automation
- [ ] Implement blue-green deployment

### 4. Documentation
- [ ] Create API documentation
- [ ] Document backup/restore procedures
- [ ] Create incident response playbook
