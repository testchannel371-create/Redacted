# REDACTED

A browser first-person shooter with a Cold War / Black Ops look. It's 3D, runs on school Chromebooks, and needs no account. Made by Divan.

- **Modes:** Free for all, Two teams, Four teams. Each new round picks a random map out of 5:
  - **CITADEL**: a rainy coastal fortress with a keep, a radio mast, a naval gun, a helipad and climbable ramparts.
  - **POLARIS**: an arctic research station in a blizzard, with red/navy modules and a catwalk bridge between them.
  - **GRACHT**: a canal city with bridges (including a red steel arch bridge), townhouses, a tram and a clock tower.
  - **KOMBINAT**: a Soviet factory with a brick hall, a gantry crane, slogan-covered garages, a railway and a chimney.
  - **BORGO**: an Italian hill village with a fountain piazza, a bell tower, an arcade cantina and a raised terrace.
- **Players:** up to 200 on one server, and up to 64 real players in one match.
- **Party:** you get a 5-digit code. When the party leader presses PLAY, everyone in the party joins the same match and team.
- **[BOTS] option** (in PARTY, set by the party leader): **✓ ON** gives your party its own match with 1–200 bots. **✗ OFF** matches you with real players only. Bots don't count toward coin rewards.
- **Weapons:** 50 guns made in Blender. The first 10 are free. The others are bought with coins.
- **Coins:** winning gives 50 coins. Above 10 real players the reward goes up by 50 for every extra 5 players (11–15 players = 100, 16–20 = 150, and so on). Coins and unlocked guns are saved in your browser.
- **Operator:** you can change the soldier's skin tone, headgear, face gear, torso, backpack, extras and 4 clothing colours.

## Admin

The **ADMIN** button in the top-left of the menu asks for the admin password. Once it's unlocked:

- **Fly**: press **F** in a match. SPACE goes up, C goes down, SHIFT goes fast. There's no gravity and you pass through walls.
- **ESP**: press **G**. Every player gets a box with their name and distance, visible through walls.
- **AIMBOT**: press **H**. While you hold right click or shoot, your aim snaps to the nearest visible enemy near your crosshair (head first, chest if the head is hidden). ESP shows the locked target in yellow.
- **Unlimited coins**: coins show ∞ and every gun in the shop is free.

Admin lasts until you close the tab. The password is checked on the server and is never sent to players' browsers. Each address gets 15 tries per 10 minutes.

- **Changing the password:** set the `ADMIN_PASSWORD` environment variable on your host. Do this especially if you put the code on a public GitHub, because the default is written in `server.js`.
- **Offline practice:** it only stores a SHA-256 fingerprint of the default password (in `client/js/net.js`). If you change the password, update that fingerprint too.

## Run it

You need [Node.js](https://nodejs.org) 18 or newer.

```bash
npm install
npm start
```

Then open http://localhost:3000. Friends on the same network can open `http://<your-computer's-IP>:3000`.

If the page can't reach a server, the game switches to **offline practice against bots**. It runs the same game code in the browser, but parties don't work in this mode.

## Put it online on Render.com

Render deploys from a GitHub repository. The project already includes a `render.yaml`, so Render can set everything up for you.

1. **Put the code on GitHub.**
   1. Sign in at github.com and click **+ → New repository**.
   2. Give it a name such as `redacted`. Choosing **Private** keeps your code hidden.
   3. Click **Create repository**, then click **uploading an existing file**.
   4. Unzip `redacted-game.zip`, open the `redacted` folder, select **everything inside it** and drag it onto the GitHub page. That's about 95 files, under GitHub's 100-file limit.
   5. Click **Commit changes**.
2. **Create the service on Render.**
   1. Sign in at render.com (you can use your GitHub account) and click **New + → Blueprint**.
   2. Connect your GitHub and pick the `redacted` repository.
   3. Render reads `render.yaml` and asks for `ADMIN_PASSWORD`. Type your admin password there.
   4. Click **Apply**.
3. **Wait for the build.** It takes about 2 minutes. Your game is then live at `https://redacted-xxxx.onrender.com`. Share that link to play.

If you'd rather not use the Blueprint, choose **New + → Web Service** instead. Pick the repository, then set:
- Runtime: **Node**
- Build command: `npm install --omit=dev`
- Start command: `npm start`
- Instance type: **Free**
- Environment variable: `ADMIN_PASSWORD`

**Free-plan notes:**
- **Sleeping:** the free plan sleeps after 15 minutes with nobody playing. The next visitor waits about a minute while it wakes up; if they open the page during that minute it may start in offline practice, and refreshing once it's awake fixes that.
- **Coins:** coins and unlocked guns are saved in each player's own browser, so they aren't lost when Render restarts.
- **Updating:** upload the changed files to the same GitHub repository and Render redeploys automatically.

## Other hosts

The game is a single Node server that serves the website and handles multiplayer on the same port, so any host that runs Node works. Examples are Railway, Fly.io or any VPS.

1. Upload the project, with `npm install --omit=dev` as the build command and `npm start` as the start command.
2. The host sets `PORT` automatically. The game connects over `wss://<your-site>/ws`.
3. Optional settings (environment variables):
   - `MAX_PLAYERS` – total players allowed on the server (default **200**)
   - `MAX_PER_MATCH` – players per match (default 64)
   - `ROUND_SECONDS` – round length (default 6 min for FFA, 8 min for team modes)

The website files can also live on a separate static host. In that case, point them at the game server with `?server=wss://your-game-server/ws` or `window.REDACTED_SERVER`.

Load test: `node tools/load-test.mjs 200` connects 200 fake players. On a normal PC the server's 50 ms game tick took about 9 ms with 200 players connected. `node tools/bots-test.mjs` checks a 200-bot match.

## School Chromebooks

- No downloads or installs. Everything, fonts included, is served by the game server, so no blocked CDNs are needed.
- Small downloads: the models are Draco-compressed. The soldier is 87 KB and each gun is 10–36 KB. Only your equipped gun loads at startup, and the rest download quietly in the background. The shop pictures are pre-rendered in Blender (about 8 KB each) and load lazily.
- Each map is merged into about 20 draw calls (one per material). Textures are generated in the browser, so they cost no download. Sun shadows are drawn once per map rather than every frame, and are off on LOW. Each soldier is about 10 draw calls.
- Graphics **AUTO** lowers the render resolution if the frame rate drops. In the pause menu (ESC) you can choose LOW for very slow laptops and turn on an FPS counter.
- Crouch is **C**, because Ctrl+W would close the tab.

Controls: WASD move · SPACE jump · SHIFT sprint · C crouch · mouse aim and shoot · right click aim down sights · R reload · TAB scores · ESC pause.

## Project layout

| Path | What it is |
| --- | --- |
| `server.js` | HTTP + WebSocket server (game loop at 20 ticks/s) |
| `client/shared/core.js` | Game rules: parties, matchmaking, teams, hit checks, scoring, coins, bots. Used by the server **and** by offline mode. |
| `client/shared/maps.js` | The 5 map layouts |
| `client/shared/mapkit.js` | Map toolkit: buildings, roofs, stairs, towers, vehicles, props, plus collision, spawns and the bot pathfinding grid |
| `client/js/world.js` | Map renderer: procedural textures, merged geometry, water, sky, weather, smoke and signs |
| `client/shared/guns.json` | All 50 weapons (stats, prices, looks). Generated by `tools/build-guns.mjs`. |
| `client/js/` | Browser game: `game.js` (in-match), `main.js` (menus/shop/party), `assets.js`, `world.js`, `menu3d.js`, `audio.js`, `net.js` |
| `blender/make_assets.py` | Builds every gun and the operator in Blender. Exports `client/assets/guns/gun_XX.glb` and `client/assets/operator.glb`, and renders `client/assets/icons/gun_XX.webp`. |

### Rebuilding the Blender models

```bash
node tools/build-guns.mjs
"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" --background --factory-startup --python blender/make_assets.py -- --preview
```

Options after `--`:
- `--preview` renders picture sheets of the guns and operator into `client/assets/`.
- `--no-icons` skips the 50 shop pictures.
- `--only 4,5` rebuilds just those guns.
