<p align="center">✨ <strong>Generated with <a href="https://robojs.dev/create-robo">create-robo</a> magic!</strong> ✨</p>

---

# 📅 Discord Events Manager

**A comprehensive Discord events management plugin for Robo.js** that helps communities organize events with RSVP tracking, automated reminders, and seamless Discord integration.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Robo.js](https://img.shields.io/badge/robo.js-plugin-purple)

## ✨ Features

- **🎯 Event Creation**: Create detailed events with dates, descriptions, locations, and attendance limits
- **📝 RSVP System**: Track who's going, maybe attending, or can't attend (persisted in Flashcore)
- **⏰ Smart Reminders**: Automated event reminders (1 hour to 1 week before, stored in Flashcore)
- **📊 Attendee Management**: View and manage event participants
- **🔍 Event Discovery**: List and filter events by date, creator, or status
- **👥 Interactive UI**: Easy event creation through Discord modals
- **🎨 Rich Embeds**: Beautiful Discord embeds with interactive buttons
- **🔒 Permissions**: Role-based event management with proper permissions

## 📦 Installation

To add this plugin to your **Robo.js** project:

```bash
npx robo add events-manager
```

New to **Robo.js**? Start your project with this plugin pre-installed:

```bash
npx create-robo <project-name> -p events-manager
```

## 🎮 Commands

### `/event-create` - Create New Events

Create detailed events with full customization:

```bash
/event-create
```

This opens a modal where you can specify:
- Event title
- Description
- Date & Time (format: `YYYY-MM-DD HH:MM`)
- Location (optional)
- Max attendees (optional)

### `/event-list` - Browse Events

View and filter community events:

```bash
/event-list                           # Show upcoming events
/event-list filter:past              # Show past events
/event-list filter:all               # Show all events
/event-list user:@SomeUser           # Show events by specific user
```

### `/event-remind` - Set Reminders

Schedule automatic event reminders:

```bash
/event-remind event:"Gaming Night" time:"1 day before" channel:#events
```

**Reminder Options:**
- 1 hour before
- 6 hours before  
- 1 day before
- 3 days before
- 1 week before

## 🎯 Usage Examples

### Creating a Gaming Event

```bash
/event-create
```

Then fill in the modal with:
- **Title**: "Weekly Gaming Session"
- **Description**: "Join us for multiplayer fun!"
- **Date & Time**: "2025-12-01 20:00"
- **Location**: "Gaming Voice Channel"
- **Max Attendees**: "12"

### Setting Up a Community Meeting

1. Use `/event-create` (without quick-event parameter)
2. Fill in the modal:
   - **Title**: "Monthly Community Meeting"
   - **Description**: "Discuss server updates, new features, and community feedback"
   - **Date & Time**: "2025-10-20 19:00"
   - **Location**: "General Voice Channel"
   - **Max Attendees**: "50"

### Managing RSVPs

Users can interact with event posts using buttons:
- **✅ Going** - Confirm attendance (automatically tracked in Flashcore)
- **❓ Maybe** - Tentative attendance (with capacity overflow protection)
- **❌ Can't Go** - Decline attendance
- **👥 View Attendees** - See actual user names and attendance counts

### Setting Reminders

```bash
/event-remind event:"Community Meeting" time:"1 day before" channel:#announcements
```

**Note:** Reminders are scheduled and stored in Flashcore, persisting across bot restarts.

## 🔧 Configuration

### Required Permissions

**For Event Creators:**
- `Manage Guild` permission OR `Administrator`

**For All Users:**
- `Use Application Commands`
- `Read Message History`
- `Send Messages`

### Channel Setup

Recommended channel setup:
- **#events** - For event announcements
- **#event-reminders** - For automated reminders  
- Voice channels for event locations

## 🎨 Customization

### Event Embed Colors
- **Upcoming Events**: Blue (`#5865F2`)
- **Past Events**: Gray (`#99AAB5`)
- **Reminders**: Orange (`#FFAA00`)
- **Confirmations**: Green (`#00FF00`)

### Date/Time Format

Events use ISO 8601 date format:
- Format: `YYYY-MM-DD HH:MM`
- Example: `2025-12-25 14:30`
- Uses 24-hour time format

## 💾 Data Storage

This plugin uses **Flashcore**, Robo.js's built-in key-value storage system, to persist:
- Event details (title, description, date/time, location, attendees)
- RSVP responses (going, maybe, not going)
- Event reminders with scheduling information

All data is automatically saved and persists across bot restarts. No additional database setup required!

## 🛠️ Development

To contribute to this plugin:

```bash
git clone https://github.com/Wave-Play/robo.js
cd robo.js/packages/plugin-events-manager
pnpm install
pnpm dev
```

## 🤝 Contributing

Contributions are welcome! This plugin was created for **Hacktoberfest 2025**. Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📋 Roadmap

- [x] **Database Integration** - Persistent event storage using Flashcore
- [x] **RSVP Tracking** - Full Yes/Maybe/No response tracking with user data
- [x] **Event Reminders** - Scheduled reminders with Flashcore persistence
- [x] **Event Listing** - Filter events by date, creator, or status
- [ ] **Recurring Events** - Weekly/monthly event templates
- [ ] **Event Categories** - Gaming, Social, Educational, etc.
- [ ] **Calendar Integration** - Export to Google Calendar/Outlook
- [ ] **Event Analytics** - Attendance statistics and insights
- [ ] **Custom RSVP Options** - More than just Yes/No/Maybe
- [ ] **Event Templates** - Quick event creation from templates
- [ ] **Advanced Time Zone Support** - Automatic time zone conversion
- [ ] **Advanced Natural Language Processing** - Enhanced date parsing

## 📞 Support

- **Documentation**: [Robo.js Documentation](https://robojs.dev)
- **Discord**: [Robo.js Community](https://robojs.dev/discord)
- **Issues**: Create an issue in this repository

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

**Made with ❤️ by DevArqf for the Discord community and Hacktoberfest 2025**
