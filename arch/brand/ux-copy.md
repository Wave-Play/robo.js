# UX Copy Standards

This document provides copy patterns for all common UI scenarios. All copy uses the **Raphael voice** unless otherwise noted.

> **Related**: For voice characteristics and tone, see [voice.md](voice.md). For capitalization rules, see [terminology.md](terminology.md).

---

## Principles

1. **Direct over polite**: "Invalid email" not "Please enter a valid email"
2. **Active over passive**: "Deploy failed" not "Deployment was unsuccessful"
3. **Specific over vague**: "File not found: config.json" not "Something went wrong"
4. **Action-oriented**: Include what user can do next when relevant
5. **No apologies**: Skip "sorry", "oops", "unfortunately"
6. **No exclamation marks**: Avoid excitement punctuation

---

## Buttons & Actions

### Primary Actions

| Action               | Label            | Notes                       |
| -------------------- | ---------------- | --------------------------- |
| Proceed to next step | "Continue"       | Not "Next" or "Proceed"     |
| Create account       | "Create account" | Not "Sign up" or "Register" |
| Sign in              | "Sign in"        | Not "Log in" or "Login"     |
| Save changes         | "Save"           | Not "Save changes"          |
| Deploy project       | "Deploy"         | Simple verb                 |
| Create new Robo      | "Create Robo"    | Capitalized                 |
| Start service        | "Start"          | Context provides meaning    |
| Stop service         | "Stop"           |                             |
| Delete item          | "Delete"         | Red text, destructive       |
| Confirm action       | "Confirm"        |                             |
| Submit form          | "Submit"         |                             |
| Send message         | "Send"           |                             |
| Apply changes        | "Apply"          |                             |
| Install item         | "Install"        |                             |
| Uninstall item       | "Uninstall"      |                             |
| Upgrade plan         | "Upgrade"        |                             |
| Downgrade plan       | "Downgrade"      |                             |

### Secondary Actions

| Action            | Label        |
| ----------------- | ------------ |
| Cancel operation  | "Cancel"     |
| Go back           | "Back"       |
| Skip step         | "Skip"       |
| Learn more        | "Learn more" |
| View details      | "View"       |
| Edit item         | "Edit"       |
| Copy to clipboard | "Copy"       |
| Refresh content   | "Refresh"    |
| Retry action      | "Retry"      |
| Dismiss           | "Dismiss"    |
| Close             | "Close"      |

### OAuth/Social Sign-In

| Provider | Label                   |
| -------- | ----------------------- |
| Discord  | "Continue with Discord" |
| GitHub   | "Continue with GitHub"  |
| Google   | "Continue with Google"  |

### Destructive Actions

- Always use red text color (`#f44336`)
- Require confirmation for irreversible actions
- Labels: "Delete", "Remove", "Sign out", "Disconnect"

**Confirmation Dialog Pattern:**

```
Title: Delete Robo?
Body: This will permanently delete "MyBot" and all associated data.
Buttons: [Cancel] [Delete]  (Delete in red)
```

---

## Form Labels & Placeholders

### Labels

| Field           | Label          |
| --------------- | -------------- |
| Email input     | "Email"        |
| Password input  | "Password"     |
| Display name    | "Display name" |
| Username/handle | "Handle"       |
| Project name    | "Name"         |
| Description     | "Description"  |
| URL input       | "URL"          |
| Search          | "Search"       |

### Placeholders

| Field         | Placeholder                     |
| ------------- | ------------------------------- |
| Email         | "you@example.com"               |
| Password      | (none - security best practice) |
| Display name  | "Your name"                     |
| Handle        | "@yourhandle"                   |
| Project name  | "My Robo"                       |
| Search        | "Search..."                     |
| Command input | "Enter command..."              |
| URL           | "https://..."                   |
| Description   | "Describe your project..."      |

### Helper Text

| Context               | Helper                               |
| --------------------- | ------------------------------------ |
| Password requirements | "Minimum 8 characters"               |
| Handle format         | "Letters, numbers, underscores only" |
| Optional field        | "Optional"                           |
| New user hint         | "New here? We'll help you set up."   |
| Forgot password       | "Forgot password?"                   |

---

## Error Messages

### Validation Errors

| Condition            | Message                                  |
| -------------------- | ---------------------------------------- |
| Empty required field | "Required"                               |
| Invalid email        | "Invalid email address"                  |
| Password too short   | "Minimum 8 characters"                   |
| Password mismatch    | "Passwords don't match"                  |
| Handle taken         | "Handle unavailable"                     |
| Handle invalid       | "Letters, numbers, and underscores only" |
| Handle too short     | "Minimum 3 characters"                   |
| Handle too long      | "Maximum 20 characters"                  |
| URL invalid          | "Invalid URL"                            |
| Number out of range  | "Must be between 1 and 100"              |

### Action Errors

| Condition         | Message                             |
| ----------------- | ----------------------------------- |
| Network failure   | "Connection failed. Retry?"         |
| Auth failure      | "Invalid credentials"               |
| Session expired   | "Session expired. Sign in again."   |
| Permission denied | "Access denied"                     |
| Not found         | "Not found"                         |
| Rate limited      | "Too many requests. Wait a moment." |
| Server error      | "Something went wrong. Try again."  |
| Timeout           | "Request timed out. Try again."     |
| Conflict          | "Already exists"                    |
| Quota exceeded    | "Limit reached"                     |

### Deployment Errors

| Condition      | Message                         |
| -------------- | ------------------------------- |
| Build failed   | "Build failed" (show logs link) |
| Deploy failed  | "Deploy failed" (show reason)   |
| Timeout        | "Deployment timed out"          |
| Invalid config | "Invalid configuration"         |

### Error Display Rules

- No "Error:" prefix needed (context is clear)
- No exclamation marks
- No apologetic language ("Oops!", "Sorry!")
- Red color for error text (`#f44336`)
- Include actionable next step when possible
- Show technical details in expandable section if helpful

---

## Empty States

### Pattern

```
[Icon or illustration - optional]
[Short statement - required]
[Action button - optional]
```

### Examples

| Context           | Copy                | Action          |
| ----------------- | ------------------- | --------------- |
| No Robos          | "No Robos yet."     | "Create Robo"   |
| No deployments    | "No deployments."   | —               |
| No files          | "No files."         | "Create file"   |
| Search no results | "No results."       | —               |
| Empty inbox       | "All clear."        | —               |
| No activity       | "No activity yet."  | —               |
| No notifications  | "No notifications." | —               |
| No team members   | "No members yet."   | "Invite"        |
| Filtered empty    | "No matches."       | "Clear filters" |

### Anti-Patterns

| Don't                               | Do                       |
| ----------------------------------- | ------------------------ |
| "You don't have any Robos yet!"     | "No Robos yet."          |
| "Looks like there's nothing here"   | "No results."            |
| "Start your journey by creating..." | "No Robos yet." + button |
| "Oops! Nothing to show"             | "No activity."           |
| "Your inbox is empty. Yay!"         | "All clear."             |

---

## Loading States

### In-Progress Labels

| Action     | Loading text    |
| ---------- | --------------- |
| Deploying  | "Deploying..."  |
| Saving     | "Saving..."     |
| Loading    | "Loading..."    |
| Connecting | "Connecting..." |
| Building   | "Building..."   |
| Starting   | "Starting..."   |
| Stopping   | "Stopping..."   |
| Installing | "Installing..." |
| Uploading  | "Uploading..."  |
| Processing | "Processing..." |
| Analyzing  | "Analyzing..."  |

### Loading Patterns

- Use skeleton loaders for content areas (not spinners)
- Show progress percentage when available: "Uploading... 45%"
- For long operations, show steps: "Building... (step 2 of 4)"
- No text needed for inline skeleton states

---

## Success States

### Confirmation Messages

| Action    | Message     |
| --------- | ----------- |
| Saved     | "Saved"     |
| Deployed  | "Deployed"  |
| Created   | "Created"   |
| Deleted   | "Deleted"   |
| Copied    | "Copied"    |
| Sent      | "Sent"      |
| Updated   | "Updated"   |
| Installed | "Installed" |
| Connected | "Connected" |
| Uploaded  | "Uploaded"  |

### Display Rules

- Brief, single word when possible
- Green checkmark icon optional
- Auto-dismiss after 2-3 seconds
- No exclamation marks
- No "Successfully" prefix ("Saved" not "Successfully saved")

---

## Tooltips & Hints

### Keyboard Shortcuts

Format: `Key: Action`

| Shortcut | Tooltip          |
| -------- | ---------------- |
| Cmd+S    | "Cmd+S: Save"    |
| Escape   | "Escape: Close"  |

### Feature Hints

| Context       | Hint                          |
| ------------- | ----------------------------- |
| Deploy button | "Deploy to make changes live" |

### Status Info

| Context       | Format                     |
| ------------- | -------------------------- |
| Last saved    | "Last saved 2 minutes ago" |
| Online status | "Online" / "Offline"       |
| Synced        | "All changes synced"       |

### Rules

- Max ~60 characters
- No periods for short hints
- Include keyboard shortcut when relevant
- Use colon format for shortcut hints

---

## Notifications

### In-App Toast Notifications

| Type    | Format                          | Duration                |
| ------- | ------------------------------- | ----------------------- |
| Success | Green accent, brief message     | Auto-dismiss 3s         |
| Error   | Red accent, message + action    | Persist until dismissed |
| Warning | Yellow accent, message + action | Auto-dismiss 5s         |
| Info    | Blue accent, message only       | Auto-dismiss 3s         |

### Push/System Notifications

| Event           | Title             | Body                       |
| --------------- | ----------------- | -------------------------- |
| Deploy complete | "Deploy Complete" | "Your Robo is now live."   |
| Deploy failed   | "Deploy Failed"   | "Build error. Check logs." |

---

## Auth Flow Copy

### Welcome Screen

- Title: "Welcome"
- Subtitle: (none)

### Email Step

- Title: "Sign in"
- Description: "Enter your email to continue."
- Helper: "New here? We'll help you set up."
- Button: "Continue"

### Password Step (Existing User)

- Title: "Welcome back"
- Description: "Enter your password."
- Helper: "Forgot password?"
- Button: "Sign in"

### Password Step (New User)

- Title: "Create password"
- Description: "Choose a secure password."
- Helper: "Minimum 8 characters"
- Button: "Continue"

### Create Account Step

- Title: "Create your account"
- Description: "Set up your profile."
- Fields: Display name, Handle
- Legal: "By creating an account, you agree to our Terms of Service and Privacy Policy."
- Button: "Create account"

### Forgot Password

- Title: "Reset password"
- Description: "Enter your email to receive a reset link."
- Button: "Send link"
- Success: "Check your email for a reset link."

---

## Contextual Help

### Onboarding Hints

- Use sparingly
- Always dismissible
- Progressive (reveal as user explores)
- Don't block primary actions

### Documentation Links

- Label: "Learn more"
- Opens in new tab
- Show diamond badge (external link indicator)

### Inline Help

- Use `?` icon for contextual help
- Show on hover/click
- Keep explanations brief

---

## Formatting Guidelines

### Numbers

- Use digits: "3 files modified" not "three files modified"
- Use separators for large numbers: "1,234" not "1234"
- Percentages: "50%" not "50 percent"
- Don't include decimals unless necessary: "5 MB" not "5.00 MB"

### Time

| Age          | Format          |
| ------------ | --------------- |
| < 1 minute   | "Just now"      |
| 1-59 minutes | "5 minutes ago" |
| 1-23 hours   | "2 hours ago"   |
| 1-6 days     | "3 days ago"    |
| 7+ days      | "Dec 15, 2024"  |

**Durations:** "2m 34s" (deployment time)

### File Sizes

- KB, MB, GB (abbreviated, uppercase)
- One decimal max: "1.2 MB"
- Round small sizes: "< 1 KB"

### Lists

- Use sentence case
- No periods for single items
- Periods for full sentences
- Oxford comma in body text

---

## Dialog Copy

### Confirmation Dialogs

```
Title: [Action] [Object]?
Body: [Consequence of action]
Buttons: [Cancel] [Action]
```

**Examples:**

```
Title: Delete Robo?
Body: This will permanently delete "MyBot" and all deployment history.
Buttons: [Cancel] [Delete]
```

```
Title: Sign out?
Body: You'll need to sign in again to continue.
Buttons: [Cancel] [Sign out]
```

### Information Dialogs

```
Title: [Topic]
Body: [Information]
Button: [Got it] or [Close]
```

### Input Dialogs

```
Title: [Action]
Body: [Instructions]
Input: [Field]
Buttons: [Cancel] [Action]
```

---

## Accessibility Copy

### Screen Reader Labels

| Element         | Label              |
| --------------- | ------------------ |
| Close button    | "Close"            |
| Menu button     | "Menu"             |
| Search button   | "Search"           |
| Settings button | "Settings"         |
| User avatar     | "[Name]'s profile" |
| Loading spinner | "Loading"          |

### Alt Text

- Describe function, not appearance
- "Deploy button" not "Green arrow icon"
- Skip decorative images

---

## Copy Checklist

Before shipping UI copy:

- [ ] Uses Raphael voice (direct, efficient)
- [ ] Correct capitalization (Robo, Sage, etc.)
- [ ] No exclamation marks
- [ ] No apologies ("sorry", "oops")
- [ ] Action-oriented
- [ ] Specific error messages
- [ ] Consistent with existing UI
- [ ] Appropriate length for context

---

## Changelog

- **2026-01-02**: Initial UX copy standards created.
