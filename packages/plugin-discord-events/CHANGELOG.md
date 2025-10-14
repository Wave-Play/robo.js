# @robojs/discord-events

## 0.0.0

### Major Changes

- Initial release of Discord Events Manager plugin
- Event creation with full customization and quick natural language parsing
- RSVP system with Going/Maybe/Can't Go options
- Smart automated reminders (1 hour to 1 week before events)
- Attendee management and viewing
- Event discovery and filtering
- Rich Discord embeds with interactive buttons
- Role-based permissions for event management

### Features Added

- `/event-create` command with modal and quick-event support
- `/event-list` command with filtering options
- `/event-remind` command for automated reminders  
- Interactive button handlers for RSVP actions
- Modal submission handlers
- Natural language date parsing
- Event validation and error handling
- Beautiful Discord embed formatting
- Permission-based access control

### Technical Details

- TypeScript support with proper type definitions
- Modular command and event structure
- Comprehensive error handling
- Event data persistence (in-memory for now)
- Extensible plugin architecture
- Full Discord.js v14 compatibility