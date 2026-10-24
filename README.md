# ICAT (I Can Do All Things)

A trauma-informed emotional regulation app. It's built on Barrett's theory of constructed emotion (feelings are built from your body budget plus the situation) and Gross's process model of emotion regulation.

- **Mental battery:** sleep, food, water, movement and connection make up today's charge.
- **Check-in:** body signals, then the situation, then *you* name the feeling. The app never labels it for you.
- **Toolbox:** one tool for each stage of Gross's model. Change the situation, 5-4-3-2-1 grounding, reappraisal ("Rethink it"), long-exhale breathing, and "I am" self-talk.
- **Morning message:** your own "I am" line the first time you open the app each morning.
- **Feedback:** testers send answers to Dag through the share sheet.

This is a free test build that runs in **Expo Go**. Apple Health, the home screen widget, notifications and phone breaks need the paid Apple Developer account, so the app shows them as "locked" previews.

## Easiest: home screen app (no installs)

Live at **https://dagmawit28-spec.github.io/ICAT/**. Open it in Safari, tap Share, then **Add to Home Screen**. It gets the ICAT icon and opens full screen.

To publish changes: run `python3 scripts/build-web.py`, then push the `dist/` folder to the `gh-pages` branch.

## Run it in Expo Go (developer route)

1. Install **Node.js** (LTS) from https://nodejs.org
2. Get this code onto your computer: on GitHub hit **Code → Download ZIP** and unzip it, or run `git clone https://github.com/dagmawit28-spec/icat`
3. Open a terminal in the folder and run:
   ```
   npm install
   npx expo start --tunnel
   ```
4. Install **Expo Go** from the App Store on your iPhone, then scan the QR code in the terminal with your camera.

## Let friends test it

**Quick way (your computer has to stay on):** leave `npx expo start --tunnel` running and send friends a screenshot of the QR code. They install Expo Go and scan it. It stops working when you close the terminal.

**Always-on way (free):**
1. Make a free account at https://expo.dev, then run:
   ```
   npx eas-cli@latest login
   npx eas-cli@latest init
   npx eas-cli@latest update --branch main --message "test build"
   ```
2. On expo.dev, create a free **organization** and add your friends as members. Each friend needs their own free Expo account. On iPhone, Expo Go only opens published projects for people on your account or organization.
3. Friends sign in to Expo Go with their account and open ICAT from there.
4. Every time you change the code, run the `update` command again and friends get the new version.

## Files

- `App.js`: the whole app
- `web-prototype/index.html`: the earlier browser version
