import type { SQLiteDatabase } from 'expo-sqlite';

import type { Shape } from '@/lib/annotations';

export const DatabaseName = 'volleyball.db';

export type Video = {
  id: number;
  title: string;
  uri: string;
  duration: number;
  /** Detected on first playback (or reported by the GoPro); null until known. */
  frameRate: number | null;
  /** Still frame for the library list; null until generated. */
  thumbnailUri: string | null;
  folderId: number | null;
  createdAt: number;
};

export type Folder = {
  id: number;
  name: string;
  createdAt: number;
};

export type Note = {
  id: number;
  videoId: number;
  time: number;
  text: string;
};

export type Annotation = {
  id: number;
  videoId: number;
  time: number;
  shape: Shape;
};

const LatestVersion = 4;

export async function migrateDb(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  if (version >= LatestVersion) return;

  if (version === 0) {
    await db.execAsync(`
      PRAGMA journal_mode = 'wal';
      CREATE TABLE videos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        uri TEXT NOT NULL,
        skill TEXT NOT NULL,
        duration REAL NOT NULL DEFAULT 0,
        createdAt INTEGER NOT NULL
      );
      CREATE TABLE notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        videoId INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
        time REAL NOT NULL,
        text TEXT NOT NULL
      );
    `);
    version = 1;
  }

  if (version === 1) {
    // Technique categories were dropped; drawings are stored as JSON shapes per frame.
    await db.execAsync(`
      ALTER TABLE videos DROP COLUMN skill;
      CREATE TABLE annotations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        videoId INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
        time REAL NOT NULL,
        shape TEXT NOT NULL
      );
    `);
    version = 2;
  }

  if (version === 2) {
    await db.execAsync('ALTER TABLE videos ADD COLUMN frameRate REAL');
    version = 3;
  }

  if (version === 3) {
    await db.execAsync(`
      CREATE TABLE folders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        createdAt INTEGER NOT NULL
      );
      ALTER TABLE videos ADD COLUMN folderId INTEGER;
      ALTER TABLE videos ADD COLUMN thumbnailUri TEXT;
    `);
    version = 4;
  }

  await db.execAsync(`PRAGMA user_version = ${version}`);
}

export function getVideos(db: SQLiteDatabase) {
  return db.getAllAsync<Video>('SELECT * FROM videos ORDER BY createdAt DESC');
}

export function getVideo(db: SQLiteDatabase, id: number) {
  return db.getFirstAsync<Video>('SELECT * FROM videos WHERE id = ?', id);
}

export async function addVideo(
  db: SQLiteDatabase,
  video: Pick<Video, 'title' | 'uri' | 'duration'> & {
    frameRate?: number | null;
    folderId?: number | null;
  }
) {
  const result = await db.runAsync(
    'INSERT INTO videos (title, uri, duration, frameRate, folderId, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
    video.title,
    video.uri,
    video.duration,
    video.frameRate ?? null,
    video.folderId ?? null,
    Date.now()
  );
  return result.lastInsertRowId;
}

export async function setVideoFrameRate(db: SQLiteDatabase, id: number, frameRate: number) {
  await db.runAsync('UPDATE videos SET frameRate = ? WHERE id = ?', frameRate, id);
}

export function getVideosByIds(db: SQLiteDatabase, ids: number[]) {
  return db.getAllAsync<Video>(
    `SELECT * FROM videos WHERE id IN (${ids.map(() => '?').join(',')})`,
    ...ids
  );
}

export async function renameVideo(db: SQLiteDatabase, id: number, title: string) {
  await db.runAsync('UPDATE videos SET title = ? WHERE id = ?', title, id);
}

export async function setVideoThumbnail(db: SQLiteDatabase, id: number, thumbnailUri: string) {
  await db.runAsync('UPDATE videos SET thumbnailUri = ? WHERE id = ?', thumbnailUri, id);
}

export async function moveVideo(db: SQLiteDatabase, id: number, folderId: number | null) {
  await db.runAsync('UPDATE videos SET folderId = ? WHERE id = ?', folderId, id);
}

export async function deleteVideo(db: SQLiteDatabase, id: number) {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM notes WHERE videoId = ?', id);
    await db.runAsync('DELETE FROM annotations WHERE videoId = ?', id);
    await db.runAsync('DELETE FROM videos WHERE id = ?', id);
  });
}

export function getFolders(db: SQLiteDatabase) {
  return db.getAllAsync<Folder>('SELECT * FROM folders ORDER BY name COLLATE NOCASE');
}

export async function addFolder(db: SQLiteDatabase, name: string) {
  const result = await db.runAsync(
    'INSERT INTO folders (name, createdAt) VALUES (?, ?)',
    name,
    Date.now()
  );
  return result.lastInsertRowId;
}

export async function renameFolder(db: SQLiteDatabase, id: number, name: string) {
  await db.runAsync('UPDATE folders SET name = ? WHERE id = ?', name, id);
}

/** Removes the folder only; its videos stay in the library without a folder. */
export async function deleteFolder(db: SQLiteDatabase, id: number) {
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE videos SET folderId = NULL WHERE folderId = ?', id);
    await db.runAsync('DELETE FROM folders WHERE id = ?', id);
  });
}

export function getNotes(db: SQLiteDatabase, videoId: number) {
  return db.getAllAsync<Note>('SELECT * FROM notes WHERE videoId = ? ORDER BY time', videoId);
}

export async function addNote(db: SQLiteDatabase, videoId: number, time: number, text: string) {
  await db.runAsync('INSERT INTO notes (videoId, time, text) VALUES (?, ?, ?)', videoId, time, text);
}

export async function deleteNote(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM notes WHERE id = ?', id);
}

export async function getAnnotations(db: SQLiteDatabase, videoId: number): Promise<Annotation[]> {
  const rows = await db.getAllAsync<{ id: number; videoId: number; time: number; shape: string }>(
    'SELECT * FROM annotations WHERE videoId = ? ORDER BY time, id',
    videoId
  );
  return rows.map((row) => ({ ...row, shape: JSON.parse(row.shape) as Shape }));
}

export async function addAnnotation(db: SQLiteDatabase, videoId: number, time: number, shape: Shape) {
  const result = await db.runAsync(
    'INSERT INTO annotations (videoId, time, shape) VALUES (?, ?, ?)',
    videoId,
    time,
    JSON.stringify(shape)
  );
  return result.lastInsertRowId;
}

export async function deleteAnnotations(db: SQLiteDatabase, ids: number[]) {
  if (ids.length === 0) return;
  await db.runAsync(
    `DELETE FROM annotations WHERE id IN (${ids.map(() => '?').join(',')})`,
    ...ids
  );
}
