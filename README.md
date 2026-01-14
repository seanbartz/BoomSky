# BoomSky

BoomSky is a clean, single-page web app that reads your Bluesky timeline and hides
Indiana Pacers spoilers unless you confirm you're caught up.

## Quick start

1. Run a local static server from the repo root:

   ```bash
   python3 -m http.server 5173
   ```

2. Open the app at <http://localhost:5173>.
3. Enter your Bluesky handle + app password and choose whether you're caught up.

## Notes

- Use a Bluesky app password from your account settings.
- If the Bluesky API blocks browser requests in your environment, try another browser or
  run the app from a trusted local domain.
- Pacers-related posts are filtered using common keywords (team name and key players).
