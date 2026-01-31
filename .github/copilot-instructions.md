# Copilot Instructions for BoomSky

## Project Overview

BoomSky is a clean, single-page web application that reads your Bluesky timeline and hides Indiana Pacers spoilers unless you confirm you're caught up. It's a static web app with no build step or backend server.

## Technology Stack

- **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3
- **API**: Bluesky AT Protocol (xrpc)
- **Deployment**: Static hosting (GitHub Pages, or any static server)
- **Development Server**: Python's http.server or any static file server

## Project Structure

- `index.html` - Main HTML structure
- `app.js` - Application logic and Bluesky API integration
- `styles.css` - All styling
- `favicon-orange.svg` / `favicon-navy.svg` - Favicon variants
- `AGENTS.md` - Agent preferences
- `README.md` - Project documentation

## Development Guidelines

### Running the Application

Start a local development server from the repo root:

```bash
python3 -m http.server 5173
```

Then visit http://localhost:5173

### Code Style

- Use modern ES6+ JavaScript features
- Use `const` and `let` instead of `var`
- Use template literals for string interpolation
- Use arrow functions where appropriate
- Keep code clean and readable with minimal comments
- Follow existing indentation (2 spaces)

### API Integration

- All Bluesky API calls go through `https://bsky.social/xrpc`
- Use async/await for API calls
- Handle errors gracefully with user-friendly messages
- Store minimal data in localStorage (only user preferences)

### Filtering Logic

- Pacers-related keywords are defined in `PACERS_KEYWORDS` array
- Blocked handles are defined in `PACERS_BLOCKED_HANDLES` Set
- Filtering should be case-insensitive
- Filter by post text content and author handle

### UI/UX Principles

- Keep the interface clean and minimal
- Use the existing color scheme (orange/navy theme)
- Maintain responsive design for mobile and desktop
- Provide clear user feedback for loading and error states
- Use the existing toggle pattern for the Pacers Shield

### Testing

- Manual testing is the primary method
- Test all user flows: login, timeline loading, filtering, refresh
- Test with and without Pacers Shield enabled
- Verify responsive design on different screen sizes
- Check error handling with invalid credentials

## Common Tasks

### Adding New Keywords

Update the `PACERS_KEYWORDS` array in `app.js` with new keywords (lowercase).

### Modifying the Filtering Logic

The filtering happens in the post rendering logic. Look for functions that check for Pacers-related content.

### Styling Changes

All styles are in `styles.css`. The project uses custom CSS (no frameworks).

## Deployment

The app is deployed as a static site via GitHub Pages:
- Source: `main` branch, root folder
- No build process required
- Changes pushed to main are automatically deployed

## Security Considerations

- Never commit API credentials or app passwords
- User credentials are stored only in memory during the session
- Use Bluesky app passwords, not main account passwords
- All API calls use HTTPS

## Commit Guidelines

- Use concise, descriptive commit messages
- Follow conventional commit format when appropriate
- You may commit and push changes by default
- Keep commits focused and atomic

## Important Notes

- This is a static web app with no build step
- No package manager or dependencies to install
- No transpilation or bundling required
- Test locally before pushing changes
- Ensure changes don't break the Bluesky API integration
