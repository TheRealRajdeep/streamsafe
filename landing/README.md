# Earmuffs landing page

Vite + React + Motion.

```
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/ — deploy to Vercel / Netlify / GitHub Pages
```

**When the extension is published:** set `CHROME_STORE_URL` in `src/config.ts`. Every "install extension" button uses it (currently points to the GitHub `chrome-extension` folder).

Content lives in `src/data/`: `demoScript.ts` (hero stream captions and chat) and `examples.ts` (the "smart, not a word list" playground).
