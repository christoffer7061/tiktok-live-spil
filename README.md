# TikTok LIVE community game

A Kahoot-style game for TikTok LIVE. Viewers answer in the comments, the fastest
correct answers score the most points, and likes and gifts trigger extra effects.
The game screen is a local web page you add to TikTok LIVE Studio (Link Source) or OBS (Browser Source).

> Work in progress. A full step-by-step guide arrives with the final milestone.

## Quick start

Requires [Node.js](https://nodejs.org) 18 or newer.

```bash
npm install
npm start
```

The terminal prints two addresses:

- **Game screen:** http://localhost:3000/ (add this to LIVE Studio or OBS, 1080 × 1920)
- **Admin + simulator:** http://localhost:3000/admin

Run the tests with `npm test`.

## Settings

All settings live in `config.json` (TikTok username, answer time, game types, difficulty, scoring, gifts, likes, sound).
