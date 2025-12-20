# User Guide

Complete guide for using the LIMS system.

## Table of Contents

- [Getting Started](#getting-started)
- [Dashboard Overview](#dashboard-overview)
- [Managing Reagents](#managing-reagents)
- [Managing Batches](#managing-batches)
- [Managing Equipment](#managing-equipment)
- [Scheduling Experiments](#scheduling-experiments)
- [Generating Reports](#generating-reports)
- [User Settings](#user-settings)
- [Tips & Best Practices](#tips--best-practices)
- [Troubleshooting](#troubleshooting)

---

## Getting Started

### First Login

1. Open your browser and navigate to `http://localhost:3000`
2. Enter your credentials:
   - **Username**: Provided by your administrator
   - **Password**: Temporary password (you'll be prompted to change it)
3. Click **Login**

### Changing Your Password

1. Click on your username in the top right corner
2. Select **Profile**
3. Click **Change Password**
4. Enter current password and new password
5. Click **Save**

**Password Requirements:**
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character (!@#$%^&*)

### User Roles

- **Admin**: Full system access, can manage users
- **User**: Can create and edit reagents, experiments, equipment
- **Guest**: Read-only access to view data

---

## Dashboard Overview

The dashboard provides an at-a-glance view of your laboratory's status.

### Key Statistics

- **Total Reagents**: Number of reagents in the system
- **Low Stock Alerts**: Reagents running low
- **Active Experiments**: Currently ongoing experiments
- **Equipment Available**: Equipment ready for use

### Quick Actions

- **Add Reagent**: Quickly add a new chemical
- **Schedule Experiment**: Plan a new experiment
- **View Reports**: Access analytical reports
- **Import Data**: Bulk import from Excel/CSV

### Recent Activity

Shows the latest actions in the system:
- Recently added reagents
- Completed experiments
- Equipment maintenance performed
- User logins

---

## Managing Reagents

### Adding a New Reagent

1. Click **Reagents** in the main navigation
2. Click **Add Reagent** button
3. Fill in the required information:

   **Basic Information:**
   - Name (required)
   - CAS Number (required)
   - Chemical Formula
   - Molecular Weight

   **Safety Information:**
   - Hazard Class (flammable, toxic, corrosive, oxidizing, non-hazardous)
   - Storage Conditions
   - Safety Notes

   **Additional Details:**
   - Supplier
   - Catalog Number
   - Description
   - Image (optional)

4. Click **Save**

### Searching for Reagents

**Quick Search:**
- Use the search bar at the top of the Reagents page
- Search by name, CAS number, or formula
- Results appear as you type

**Advanced Filters:**
1. Click **Advanced Filters**
2. Set criteria:
   - Hazard Class
   - Stock Status
   - Supplier
   - Date Range
3. Click **Apply Filters**

### Editing a Reagent

1. Find the reagent using search or browse
2. Click on the reagent name
3. Click **Edit** button
4. Modify information as needed
5. Click **Save Changes**

### Viewing Reagent Details

The reagent details page shows:
- Complete reagent information
- All associated batches
- Usage history
- Linked experiments
- Safety data sheet (if uploaded)

### Deleting a Reagent

⚠️ **Warning**: Deleting a reagent with existing batches will mark it as inactive instead of deleting.

1. Go to reagent details page
2. Click **Delete** button
3. Confirm deletion
4. If batches exist, reagent will be marked as inactive

---

## Managing Batches

### Adding a New Batch

1. Go to the reagent details page
2. Click **Add Batch** in the Batches section
3. Fill in batch information:

   **Required Fields:**
   - Lot Number
   - Quantity
   - Unit (g, kg, mL, L, etc.)
   - Expiration Date

   **Optional Fields:**
   - Received Date
   - Storage Location
   - Supplier
   - Purchase Order Number
   - Cost
   - Notes

4. Click **Save**

### Tracking Batch Usage

When using reagents from a batch:

1. Find the batch
2. Click **Record Usage**
3. Enter:
   - Quantity Used
   - Date
   - Experiment ID (if applicable)
   - User
   - Notes
4. Click **Save**

The system automatically:
- Updates remaining quantity
- Adjusts reagent total quantity
- Triggers low stock alerts if needed

### Managing Batch Locations

**Moving a Batch:**
1. Go to batch details
2. Click **Change Location**
3. Enter new location (e.g., "Cabinet A, Shelf 3")
4. Add note about reason for move
5. Click **Save**

**Location Format:**
- Use consistent naming: `[Cabinet/Room]-[Section]-[Shelf/Drawer]`
- Example: "A-2-Top", "Cold Room-Shelf 4"

### Handling Expired Batches

System automatically flags expired batches with:
- Red warning indicator
- "Expired" status badge

**To Handle Expired Batch:**
1. Mark as **Disposed**
2. Enter disposal method
3. Record disposal date
4. Add disposal authorization (if required)

### Batch Status Indicators

- 🟢 **Available**: Ready to use
- 🟡 **Low Stock**: Below minimum threshold
- 🔴 **Expired**: Past expiration date
- ⚫ **Disposed**: Properly disposed
- 🔵 **Reserved**: Allocated for experiment

---

## Managing Equipment

### Adding Equipment

1. Navigate to **Equipment** page
2. Click **Add Equipment**
3. Enter information:

   **Basic Details:**
   - Name (required)
   - Model
   - Serial Number
   - Type (e.g., chromatography, spectroscopy, etc.)
   - Manufacturer

   **Location:**
   - Room/Lab
   - Specific Location

   **Maintenance:**
   - Purchase Date
   - Last Maintenance Date
   - Maintenance Interval (days)
   - Next Maintenance Due

   **Status:**
   - Available
   - In Use
   - Maintenance
   - Broken
   - Retired

4. Click **Save**

### Reserving Equipment

1. Go to equipment details page
2. Click **Reserve**
3. Select:
   - Start Date/Time
   - End Date/Time
   - Experiment (if applicable)
4. Click **Confirm Reservation**

### Recording Maintenance

1. Find equipment
2. Click **Record Maintenance**
3. Enter:
   - Maintenance Date
   - Type (routine, repair, calibration)
   - Description of work done
   - Technician name
   - Cost (if applicable)
   - Next maintenance due date
4. Click **Save**

### Equipment Status Updates

**To Change Status:**
1. Go to equipment page
2. Click **Update Status**
3. Select new status
4. Add reason/notes
5. Click **Save**

The system will:
- Send notifications to relevant users
- Update availability calendar
- Log status change in history

---

## Scheduling Experiments

### Creating an Experiment

1. Click **Experiments** → **Schedule New**
2. Fill in experiment details:

   **Basic Information:**
   - Title (required)
   - Description
   - Start Date/Time (required)
   - End Date/Time (required)
   - Room/Lab (required)
   - Principal Researcher

   **Resources:**
   - Reagents (select from list, specify quantities)
   - Equipment (select what you'll need)
   - Additional Materials

   **Procedure:**
   - Step-by-step procedure
   - Safety notes
   - Expected outcomes

3. Click **Schedule Experiment**

### Calendar View

The experiment calendar shows:
- All scheduled experiments
- Color-coded by status
- Filterable by room, researcher, or date range

**Calendar Controls:**
- **Day View**: Hourly breakdown
- **Week View**: Weekly overview
- **Month View**: Monthly planner

**Legend:**
- 🟦 Planned
- 🟩 In Progress
- 🟨 Completed
- 🟥 Cancelled

### Starting an Experiment

1. Find experiment in calendar or list
2. Click **Start Experiment**
3. System will:
   - Change status to "In Progress"
   - Reserve linked equipment
   - Notify relevant users
   - Start timer

### Recording Experiment Data

During experiment:
1. Go to experiment page
2. Click **Add Note** or **Upload Data**
3. Enter:
   - Observations
   - Measurements
   - Photos
   - Data files
4. Click **Save**

### Completing an Experiment

1. Go to experiment page
2. Click **Complete Experiment**
3. Fill in:
   - Final notes
   - Results summary
   - Actual reagents used
   - Issues encountered
   - Success/Failure status
4. Click **Mark Complete**

### Cancelling an Experiment

1. Find experiment
2. Click **Cancel**
3. Provide reason for cancellation
4. Click **Confirm**

System will:
- Update status to cancelled
- Release reserved resources
- Notify participants

---

## Generating Reports

### Pre-built Reports

**Reagent Inventory Report:**
1. Go to **Reports** → **Reagent Inventory**
2. Select filters (optional):
   - Hazard class
   - Stock status
   - Supplier
3. Choose format (PDF, Excel, CSV)
4. Click **Generate**

**Batch Expiration Report:**
1. Go to **Reports** → **Batch Expiration**
2. Set time frame (e.g., "Expiring in next 30 days")
3. Choose format
4. Click **Generate**

**Experiment History Report:**
1. Go to **Reports** → **Experiment History**
2. Select date range
3. Filter by status, researcher, or room
4. Choose format
5. Click **Generate**

**Equipment Utilization Report:**
1. Go to **Reports** → **Equipment Utilization**
2. Select date range
3. Choose specific equipment or all
4. Click **Generate**

### Custom Reports

1. Go to **Reports** → **Custom Report**
2. Select data source (Reagents, Experiments, etc.)
3. Choose fields to include
4. Set filters
5. Preview report
6. Export in desired format

### Scheduling Automatic Reports

1. Go to **Reports** → **Scheduled Reports**
2. Click **New Schedule**
3. Configure:
   - Report type
   - Frequency (daily, weekly, monthly)
   - Recipients (email addresses)
   - Format
4. Click **Save Schedule**

---

## User Settings

### Profile Settings

**Update Personal Information:**
1. Click username → **Profile**
2. Edit:
   - Display Name
   - Email
   - Phone (optional)
   - Department (optional)
3. Click **Save**

### Notification Preferences

Configure what notifications you receive:

1. Go to **Settings** → **Notifications**
2. Enable/disable:
   - Low stock alerts
   - Expiration warnings
   - Experiment reminders
   - Equipment maintenance alerts
   - System announcements
3. Choose delivery method (email, in-app, both)
4. Click **Save Preferences**

### Display Preferences

1. Go to **Settings** → **Display**
2. Configure:
   - Theme (light/dark)
   - Language
   - Date format
   - Time zone
   - Items per page
3. Click **Save**

---

## Tips & Best Practices

### Reagent Management

✅ **DO:**
- Enter complete information when adding reagents
- Update batch quantities immediately after use
- Check expiration dates regularly
- Use consistent naming conventions
- Add safety notes for hazardous materials

❌ **DON'T:**
- Leave quantity fields blank
- Forget to record batch usage
- Ignore expiration warnings
- Use abbreviations without explanation

### Experiment Planning

✅ **DO:**
- Schedule experiments in advance
- Include detailed procedures
- Link all required reagents and equipment
- Document results thoroughly
- Complete experiments promptly

❌ **DON'T:**
- Schedule overlapping experiments in same room
- Forget to reserve equipment
- Leave experiments in "In Progress" status indefinitely
- Skip safety documentation

### Equipment Management

✅ **DO:**
- Record all maintenance activities
- Reserve equipment in advance
- Report issues immediately
- Keep equipment status current
- Follow maintenance schedules

❌ **DON'T:**
- Ignore maintenance alerts
- Use broken equipment
- Forget to unreserve after use
- Skip calibration records

### Data Quality

✅ **DO:**
- Double-check CAS numbers
- Verify quantities and units
- Use standard nomenclature
- Add detailed notes
- Review data before saving

❌ **DON'T:**
- Guess at values
- Use inconsistent units
- Leave required fields empty
- Rush data entry

---

## Troubleshooting

### Common Issues

**Problem: Can't Login**
- Check username/password (case-sensitive)
- Ensure Caps Lock is off
- Try password reset
- Contact admin if account is locked

**Problem: Reagent Not Found in Search**
- Check spelling
- Try CAS number instead
- Use partial name match
- Check if reagent is inactive
- Try advanced filters

**Problem: Can't Schedule Experiment**
- Check for time conflicts
- Verify room is available
- Ensure equipment is not reserved
- Check date is in future
- Verify you have permission

**Problem: Report Not Generating**
- Check date range is valid
- Verify filters aren't too restrictive
- Try different format
- Check browser pop-up blocker
- Contact admin if problem persists

**Problem: Data Import Failed**
- Verify file format (Excel/CSV)
- Check column headers match template
- Look for special characters
- Ensure no empty required fields
- Download import error log for details

### Getting Help

**In-App Help:**
- Click **?** icon in any page
- Access context-sensitive help
- View video tutorials

**Contact Support:**
- Email: support@yourlab.com
- Phone: (555) 123-4567
- Submit ticket: help.yourlab.com

**Documentation:**
- User Guide (this document)
- FAQ: [FAQ.md](../FAQ.md)
- Video Tutorials: [link]

---

## Keyboard Shortcuts

- `Ctrl+K` - Quick search
- `Ctrl+N` - New reagent
- `Ctrl+E` - New experiment
- `Ctrl+R` - Generate report
- `Ctrl+S` - Save (in forms)
- `Esc` - Close modal/dialog
- `Ctrl+/` - Show keyboard shortcuts

---

## Glossary

**CAS Number**: Chemical Abstracts Service Registry Number - unique identifier for chemical substances

**Batch**: Specific lot or production run of a reagent

**Hazard Class**: Classification of chemical hazards (flammable, toxic, corrosive, etc.)

**FTS**: Full-Text Search - advanced search across all text fields

**JWT**: JSON Web Token - authentication token

**RBAC**: Role-Based Access Control - permissions system based on user roles

---

For additional help, please refer to the [FAQ](../FAQ.md) or contact your system administrator.
