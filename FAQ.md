# Frequently Asked Questions (FAQ)

Common questions and answers about LIMS.

## Table of Contents

- [General Questions](#general-questions)
- [Installation & Setup](#installation--setup)
- [Using LIMS](#using-lims)
- [Technical Questions](#technical-questions)
- [Troubleshooting](#troubleshooting)
- [Security & Privacy](#security--privacy)

---

## General Questions

### What is LIMS?

LIMS (Laboratory Information Management System) is a software system for managing laboratory operations, including reagent inventory, equipment tracking, experiment scheduling, and reporting. Our LIMS is specifically designed for small to medium-sized chemical laboratories.

### Who should use LIMS?

- Chemical laboratories
- Research institutions
- Quality control labs
- Educational institutions
- Pharmaceutical companies
- Any organization managing chemical reagents and experiments

### What makes this LIMS different?

- **Open Source**: Free to use and modify (MIT License)
- **Modern Stack**: Built with Rust and React for performance and security
- **Security First**: Designed with security best practices from the ground up
- **Lightweight**: Can run on modest hardware
- **No Vendor Lock-in**: Full control over your data
- **Easy to Deploy**: Single binary for backend, static files for frontend

### Is LIMS free?

Yes! LIMS is open source under the MIT License. You can use it for free, modify it.


## Installation & Setup

### What are the system requirements?

**Minimum:**
- CPU: 2 cores
- RAM: 2GB
- Storage: 10GB
- OS: Windows, Linux, or macOS

**Recommended:**
- CPU: 4+ cores
- RAM: 4GB+
- Storage: 20GB+ SSD
- OS: Linux (Ubuntu 20.04+ or similar)

### How do I install LIMS?

See the [README.md](../README.md) for detailed installation instructions. Quick summary:

1. Install Rust, Node.js, and SQLite
2. Clone the repository
3. Set up environment variables (.env)
4. Build and run backend: `cargo run`
5. Build and run frontend: `npm start`

### Can I run LIMS on Windows?

Yes! LIMS works on Windows, macOS, and Linux. All dependencies are cross-platform.

### Do I need a powerful server?

No. LIMS can run on modest hardware. For a lab with 10-20 users, a typical desktop computer or small cloud instance is sufficient.

### Can I use a different database?

The current version uses SQLite. PostgreSQL and MySQL support are planned for future releases. SQLite is recommended for most use cases due to its simplicity and reliability.

### How do I backup my data?

SQLite database is a single file (`lims.db`). Simply copy this file to back up all your data:

```bash
# Stop the server first
cp lims.db lims.db.backup-$(date +%Y%m%d)
```

For automated backups, see [Deployment Guide](deployment/DEPLOYMENT.md).

---

## Using LIMS

### How do I create my first user?

The default admin user is created automatically on first run. Credentials are in your `.env` file:

- Username: `admin`
- Password: Value of `DEFAULT_ADMIN_PASSWORD`

**Important**: Change the admin password immediately after first login!

### How do I add reagents to the system?

1. Login as admin or user
2. Navigate to "Reagents"
3. Click "Add Reagent"
4. Fill in required information (name, CAS number)
5. Save

Then add batches for each reagent with specific lot numbers and quantities.

### What's the difference between a Reagent and a Batch?

- **Reagent**: The chemical substance itself (e.g., "Sodium Chloride")
- **Batch**: A specific lot or purchase of that reagent (e.g., "Lot #123, 1kg, expires 2025-12-31")

One reagent can have multiple batches.

### How do I search for reagents?

Use the search bar at the top of the Reagents page. You can search by:
- Chemical name
- CAS number
- Formula
- Description

The system uses full-text search (FTS5) for fast, accurate results.

### Can I import existing reagent data?

Yes! LIMS supports import from:
- Excel (.xlsx)
- CSV
- JSON

Go to **Import/Export** → **Import Data** and follow the wizard. Download the template first to ensure correct format.

### How do I generate reports?

Navigate to **Reports** and select the type of report:
- Reagent Inventory
- Batch Expiration
- Experiment History
- Equipment Utilization

Choose filters and format (PDF, Excel, CSV), then click "Generate".

### Can I schedule recurring reports?

Yes! In the Reports section, click "Schedule Report" to set up automated reports sent via email on a daily, weekly, or monthly basis.

### How do I track reagent usage?

When using reagents from a batch:
1. Go to the batch details
2. Click "Record Usage"
3. Enter quantity used and experiment (if applicable)
4. Save

The system automatically updates remaining quantities and triggers low-stock alerts.

---

## Technical Questions

### What technologies does LIMS use?

**Backend:**
- Language: Rust
- Framework: Actix-web
- Database: SQLite with FTS5
- ORM: SQLx
- Authentication: JWT

**Frontend:**
- Framework: React
- Language: JavaScript (ES6+)
- Styling: CSS3

### Can I integrate LIMS with other systems?

Yes! LIMS provides a RESTful API that can be accessed by other systems. See [API Reference](api/API_REFERENCE.md) for documentation.

### Is there an API?

Yes! Complete RESTful API with JWT authentication. All frontend operations are available through the API. See [API Reference](api/API_REFERENCE.md).

### Can I customize LIMS?

Yes! LIMS is open source. You can:
- Modify the code
- Add new features
- Customize the UI
- Extend the API

See [Developer Guide](guides/DEVELOPER_GUIDE.md) for details.

### Does LIMS support multiple languages?

Currently, LIMS is in English. Internationalization (i18n) support is planned for future releases. Contributions welcome!

### Can multiple users access LIMS simultaneously?

Yes! LIMS supports concurrent users. The backend handles multiple connections safely.

### What's the maximum number of users?

There's no hard limit. Performance depends on your hardware and database size. SQLite can handle dozens of concurrent users easily.

---

## Troubleshooting

### I forgot the admin password. How do I reset it?

**Option 1: Environment Variable**
1. Stop the server
2. Change `DEFAULT_ADMIN_PASSWORD` in `.env`
3. Delete `lims.db` (⚠️ this deletes all data)
4. Restart server (creates new admin with new password)

**Option 2: Database Reset (if you have backups)**
```bash
# Stop server
sqlite3 lims.db
> UPDATE users SET password_hash = '<new_hash>' WHERE username = 'admin';
> .quit
# Use bcrypt to generate new hash
```

### LIMS won't start. What should I check?

1. **Port already in use**: Check if port 8080 is available
2. **Database locked**: Ensure no other process is using `lims.db`
3. **Missing .env**: Create `.env` from `.env.example`
4. **Invalid JWT_SECRET**: Generate new secret with `openssl rand -hex 32`

Check logs for specific error messages.

### I get "401 Unauthorized" errors

Your JWT token may have expired. Solutions:
1. Logout and login again
2. Clear browser cache
3. Check if `JWT_SECRET` changed in `.env`

### Search isn't working

1. Check if FTS5 is enabled in your SQLite installation
2. Rebuild FTS index:
   ```bash
   cargo run -- --rebuild-fts
   ```

### Import fails with "Invalid format"

1. Download the import template
2. Ensure column headers match exactly
3. Check for special characters
4. Verify date formats (YYYY-MM-DD)
5. Look at the error log for specific issues

### Frontend can't connect to backend

1. Check backend is running: `http://localhost:8080/api/health`
2. Verify CORS settings in `.env`: `ALLOWED_ORIGINS=*`
3. Check browser console for errors
4. Ensure frontend API URL is correct in `src/api.js`

---

## Security & Privacy

### Is my data secure?

Yes, if you follow security best practices:
- Use HTTPS in production
- Keep JWT_SECRET secure
- Use strong passwords
- Keep software updated
- Regular backups

See [Security Guide](guides/SECURITY.md) for details.

### How are passwords stored?

Passwords are hashed using bcrypt with a cost factor of 12. Plain text passwords are never stored.

### What is JWT and why do you use it?

JWT (JSON Web Token) is a secure way to transmit authentication information. We use it because:
- Stateless (no server-side session storage)
- Secure (cryptographically signed)
- Standard (widely adopted)
- Efficient (contains all needed information)

### How long do JWT tokens last?

- Access token: 1 hour
- Refresh token: 7 days

These can be configured in `src/auth.rs`.

### Can I use LIMS over the internet?

Yes, but ensure you:
1. Use HTTPS (not HTTP)
2. Set up proper firewall rules
3. Use strong passwords
4. Keep software updated
5. Monitor access logs

See [Deployment Guide](deployment/DEPLOYMENT.md) for production setup.

### Is my data private?

Yes. LIMS is self-hosted - all data stays on your servers. Nothing is sent to external services.

### Does LIMS comply with data protection regulations?

LIMS provides the tools for secure data handling, but compliance (GDPR, HIPAA, etc.) depends on how you deploy and use it. Consult with your legal team for regulatory compliance.

### How do I securely dispose of data?

1. Export data if needed (backup)
2. Delete records through the UI
3. For complete removal:
   ```bash
   # Stop server
   rm lims.db lims.db-shm lims.db-wal
   # Or use secure delete
   shred -u lims.db
   ```

---

## Performance

### LIMS is running slow. What can I do?

1. **Database optimization**:
   ```bash
   sqlite3 lims.db "VACUUM;"
   sqlite3 lims.db "ANALYZE;"
   ```

2. **Check database size**: If > 1GB, consider archiving old data

3. **Increase resources**: More RAM and SSD can help

4. **Enable caching**: Coming in future releases

5. **Optimize queries**: Check slow query log

### How much storage does LIMS need?

Depends on data volume:
- Base installation: ~50MB
- Per 1000 reagents: ~10MB
- Per 10,000 experiments: ~100MB
- Plus uploaded files (images, documents)

Regular SQLite VACUUM helps reduce size.

### Can LIMS handle large laboratories?

Current version is optimized for small to medium labs (up to 100 users, 10,000 reagents). For larger scale:
- Consider PostgreSQL (future feature)
- Use read replicas (planned)
- Horizontal scaling (planned)

---

## Support & Community

### Where can I get help?

1. **Documentation**: Check [docs](.) folder
2. **GitHub Issues**: Report bugs or ask questions
3. **Discussions**: Community forum on GitHub
4. **Email**: support@example.com (if applicable)

### How do I report a bug?

Open an issue on GitHub with:
- LIMS version
- Operating system
- Steps to reproduce
- Expected vs actual behavior
- Error messages/logs

### Can I request features?

Yes! Open a feature request on GitHub. Include:
- Clear description
- Use case
- Expected behavior
- Why it's valuable

### How can I contribute?

See [CONTRIBUTING.md](../CONTRIBUTING.md). Contributions welcome:
- Bug fixes
- New features
- Documentation
- Translations
- Testing

### Is there a roadmap?

See [ROADMAP.md](../ROADMAP.md) for planned features and timeline.

---

## Miscellaneous

### Can I use LIMS offline?

Yes! LIMS doesn't require internet connection. All data is stored locally.

### Does LIMS have a mobile app?

Not yet. The web interface is responsive and works on mobile browsers. Native apps are planned for future releases.

### Can I change the interface language?

Currently English only. i18n support is planned. Contributions for translations are welcome!

### How do I update LIMS?

```bash
# Backup database first!
cp lims.db lims.db.backup

# Pull latest code
git pull origin main

# Update dependencies
cargo build --release
cd lims-frontend && npm install

# Run migrations
cargo run -- --migrate

# Restart server
```

### Where are uploaded files stored?

In the `uploads/` directory. Ensure this is backed up along with the database.

---

**Didn't find your answer?**

- Check the full [Documentation](.)
- Open an issue on [GitHub](https://github.com/Emil9405/LIMSgen/issues)
- Join our community discussions
