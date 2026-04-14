# SMTP Email Configuration Guide

This guide will help you configure SMTP for sending invitation emails in production.

## Quick Setup

### Option 1: Gmail (Easiest for Development/Testing)

1. **Enable 2-Step Verification** on your Google Account
2. **Generate App Password**:
   - Go to: https://myaccount.google.com/apppasswords
   - Select "Mail" and "Other (Custom name)"
   - Enter "TrackPro" as the name
   - Copy the 16-character password

3. **Add to `backend/.env`**:
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-16-character-app-password
SMTP_FROM=noreply@trackpro.com
SMTP_TLS_REJECT_UNAUTHORIZED=true
```

### Option 2: SendGrid (Recommended for Production)

1. **Sign up** at https://sendgrid.com (Free tier: 100 emails/day)
2. **Create API Key**:
   - Go to Settings → API Keys
   - Create API Key with "Mail Send" permissions
   - Copy the API key

3. **Add to `backend/.env`**:
```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
SMTP_FROM=noreply@trackpro.com
SMTP_TLS_REJECT_UNAUTHORIZED=true
```

### Option 3: AWS SES (Best for High Volume)

1. **Set up AWS SES**:
   - Verify your email/domain in AWS SES
   - Create SMTP credentials in AWS SES Console

2. **Add to `backend/.env`**:
```env
SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-aws-smtp-username
SMTP_PASS=your-aws-smtp-password
SMTP_FROM=noreply@yourdomain.com
SMTP_TLS_REJECT_UNAUTHORIZED=true
```

### Option 4: Mailgun (Good Alternative)

1. **Sign up** at https://www.mailgun.com (Free tier: 5,000 emails/month)
2. **Get SMTP credentials** from Mailgun dashboard

3. **Add to `backend/.env`**:
```env
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-mailgun-smtp-username
SMTP_PASS=your-mailgun-smtp-password
SMTP_FROM=noreply@yourdomain.com
SMTP_TLS_REJECT_UNAUTHORIZED=true
```

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `SMTP_HOST` | SMTP server hostname | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP server port | `587` (TLS) or `465` (SSL) |
| `SMTP_SECURE` | Use SSL/TLS | `false` for port 587, `true` for port 465 |
| `SMTP_USER` | SMTP username | Your email or API key username |
| `SMTP_PASS` | SMTP password | Your password or API key |
| `SMTP_FROM` | From email address | `noreply@trackpro.com` |
| `SMTP_TLS_REJECT_UNAUTHORIZED` | Reject unauthorized certificates | `true` (recommended) |
| `FRONTEND_URL` | Frontend URL for invite links | `http://localhost:3000` or `https://yourdomain.com` |

## Testing SMTP Configuration

1. **Start the backend server**:
   ```bash
   cd backend
   npm start
   ```

2. **Check logs** - You should see:
   - `SMTP server is ready to send emails` (if configured correctly)
   - `SMTP not configured` (if not configured)

3. **Send a test invite**:
   - Go to Workspaces page
   - Click "Add People" → "Send Invitation"
   - Enter an email and send
   - Check the email inbox

## Troubleshooting

### Gmail Issues:
- **"Less secure app" error**: Use App Password instead of regular password
- **"Authentication failed"**: Make sure 2-Step Verification is enabled
- **"Connection timeout"**: Check firewall/network settings

### General Issues:
- **"Connection refused"**: Check SMTP_HOST and SMTP_PORT
- **"Authentication failed"**: Verify SMTP_USER and SMTP_PASS
- **"Certificate error"**: Set `SMTP_TLS_REJECT_UNAUTHORIZED=false` (not recommended for production)

### Development Mode:
If SMTP is not configured, the system will:
- Log invite URLs to console
- Still create invites in database
- Users can manually copy invite URLs

## Security Best Practices

1. **Never commit `.env` file** to version control
2. **Use App Passwords** instead of main account passwords
3. **Use environment-specific credentials** (dev/staging/prod)
4. **Rotate credentials** regularly
5. **Use dedicated email service** (SendGrid, AWS SES) for production

## Production Checklist

- [ ] SMTP credentials configured in production `.env`
- [ ] `FRONTEND_URL` set to production domain
- [ ] `SMTP_FROM` uses verified domain
- [ ] Test invite email delivery
- [ ] Monitor email delivery rates
- [ ] Set up email bounce handling (future feature)

