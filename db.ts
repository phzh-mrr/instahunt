import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "results.db");

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS handles (
    handle      TEXT    PRIMARY KEY,
    link        TEXT    NOT NULL,
    followers   TEXT,
    first_seen  INTEGER NOT NULL,
    last_seen   INTEGER NOT NULL,
    search_count INTEGER NOT NULL DEFAULT 1
  )
`);

export interface HandleRow {
  handle: string;
  link: string;
  followers: string | null;
  first_seen: number;
  last_seen: number;
  search_count: number;
}

const upsertHandle = db.prepare<[string, string, string | null, number, number]>(`
  INSERT INTO handles (handle, link, followers, first_seen, last_seen, search_count)
  VALUES (?, ?, ?, ?, ?, 1)
  ON CONFLICT(handle) DO UPDATE SET
    followers    = excluded.followers,
    last_seen    = excluded.last_seen,
    search_count = search_count + 1
`);

const getAllHandles = db.prepare<[], HandleRow>(`
  SELECT * FROM handles ORDER BY last_seen DESC
`);

export function saveHandles(items: { handle: string; link: string; followers: string | null }[]) {
  const now = Date.now();
  const insertMany = db.transaction((rows: typeof items) => {
    for (const item of rows) {
      upsertHandle.run(item.handle, item.link, item.followers, now, now);
    }
  });
  insertMany(items);
}

export function getAllStoredHandles(): HandleRow[] {
  return getAllHandles.all();
}

export function clearAllHandles(): void {
  db.prepare('DELETE FROM handles').run();
}
