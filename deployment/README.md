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

## Render Deployment (Recommended)

### Prerequisites
- A Render account
- OpenAI API key
- Git repository with your code

### Deployment Steps

1. **Fork or Clone the Repository**
   - Ensure your code is in a Git repository
   - Make sure you have the following files:
     - `Dockerfile`
     - `render.yaml`
     - `requirements.txt`

2. **Create a New Web Service in Render**
   - Go to the Render dashboard
   - Click "New +"
   - Select "Web Service"
   - Connect your repository
   - Render will automatically detect the Docker configuration

3. **Configure Environment Variables**
   The following environment variables need to be set in the Render dashboard:
   - `API_USERNAME`: Your chosen API username
   - `API_PASSWORD`: Your chosen API password
   - `OPENAI_API_KEY`: Your OpenAI API key
   
   Other variables are automatically set through `render.yaml`:
   - `FLASK_ENV`: production
   - `LOG_LEVEL`: INFO

4. **Deploy**
   - Click "Create Web Service"
   - Render will automatically build and deploy your application
   - The first deployment may take a few minutes

5. **Verify Deployment**
   - Once deployed, test the API endpoints using the provided URL
   - Check the logs in the Render dashboard for any issues
   - Verify that the health check endpoint is responding

### Monitoring and Maintenance

1. **Logs**
   - Access logs through the Render dashboard
   - Filter logs by severity (ERROR, INFO, etc.)
   - Set up log alerts for critical errors

2. **Performance**
   - Monitor response times in the Render metrics dashboard
   - Check memory usage and CPU utilization
   - Note: Free tier has 512 MB RAM limit

3. **Usage Limits**
   - Free tier limitations:
     - 512 MB RAM
     - Shared CPU
     - Auto-sleep after 15 minutes of inactivity
     - Build time: 500 minutes/month
     - Bandwidth: 100 GB/month

4. **Troubleshooting**
   - Check application logs for errors
   - Verify environment variables are set correctly
   - Ensure OpenAI API key is valid
   - Check disk usage in /app/temp directory

### Upgrading
To upgrade to a paid plan if needed:
1. Go to the service settings in Render
2. Click "Change Plan"
3. Select new plan
4. Confirm upgrade

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
