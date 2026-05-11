import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import * as cheerio from "cheerio";
import { saveHandles, getAllStoredHandles, clearAllHandles } from "./db.js";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Search proxy endpoint
  app.post("/api/search", async (req, res) => {
    try {
      const { query } = req.body;
      if (!query) {
        return res.status(400).json({ error: "Query is required" });
      }

      console.log(`Searching DuckDuckGo for: ${query}`);

      const response = await fetch("https://html.duckduckgo.com/html/", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        },
        body: new URLSearchParams({ q: query }).toString(),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch from DuckDuckGo: ${response.statusText}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      const items: { handle: string; link: string; followers: string | null }[] = [];
      const seenHandles = new Set<string>();
      const allLinks: string[] = [];

      // DuckDuckGo HTML structures results in .links_main
      $(".links_main").each((_, element) => {
        const linkElem = $(element).find("a.result__a");
        const rawHref = linkElem.attr("href") || "";
        
        // Decode DDG redirect wrappers
        const href = decodeURIComponent(rawHref);
        
        const snippet = $(element).find(".result__snippet").text();

        if (href && href.includes("instagram.com") && !href.includes("google.com")) {
          allLinks.push(href);

          const match = href.match(/instagram\.com\/([^/?&]+)/);
          const handle = match ? match[1] : null;

          const BLOCKED_PATHS = ["p", "reel", "reels", "explore", "stories", "tv", 
                                 "tags", "hashtag", "accounts", "direct", "locations", "about", "popular"];

          if (
            handle &&
            !BLOCKED_PATHS.includes(handle.toLowerCase()) &&
            !seenHandles.has(handle.toLowerCase())
          ) {
            seenHandles.add(handle.toLowerCase());

            //const followerMatch = snippet.match(/([\d.]+[KMB]?) Followers/i);
            //const followers = followerMatch ? followerMatch[1] : null;

            const followerMatch = snippet.match(/([\d.,]+[KMB]?) Followers/i);
            const followers = followerMatch ? followerMatch[1].replace(/,/g, "") : null;

            items.push({ handle, link: href, followers });
          }
        }
      });

      if (items.length > 0) {
        saveHandles(items);
      }

      res.json({
        items,
        links: [...new Set(allLinks)]
      });
    } catch (error: any) {
      console.error("Search error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Stored handles endpoint
  app.get("/api/handles", (_req, res) => {
    try {
      res.json(getAllStoredHandles());
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Clear all handles
  app.delete("/api/handles", (_req, res) => {
    try {
      clearAllHandles();
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
