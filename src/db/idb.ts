const DB_NAME = "math-problem-bank";
const DB_VERSION = 3;

export const STORES = {
  PROBLEMS: "problems",
  METHODS: "methods",
  SETTINGS: "settings",
  EVENTS: "events",
} as const;

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    let settled = false;
    const fail = (err: Error) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    };
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORES.PROBLEMS)) {
        db.createObjectStore(STORES.PROBLEMS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORES.METHODS)) {
        db.createObjectStore(STORES.METHODS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
        db.createObjectStore(STORES.SETTINGS, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORES.EVENTS)) {
        db.createObjectStore(STORES.EVENTS, { keyPath: "id" });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // 其他标签页升级数据库时主动关闭本连接，避免互相阻塞
      db.onversionchange = () => {
        db.close();
      };
      settled = true;
      resolve(db);
    };
    req.onerror = () =>
      fail(new Error(`无法打开本地数据库：${req.error?.message ?? "未知错误"}`));
    req.onblocked = () =>
      fail(
        new Error("本地数据库正被其他难题库页面占用：请关闭其他标签页/窗口后刷新重试")
      );
    // 兜底超时，避免无限转圈
    setTimeout(
      () => fail(new Error("打开本地数据库超时：请关闭其他难题库页面后刷新重试")),
      10000
    );
  });
  return dbPromise;
}

function run<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

export const db = {
  async all<T>(store: string): Promise<T[]> {
    return run<T[]>(store, "readonly", (s) => s.getAll());
  },
  async put<T>(store: string, value: T): Promise<void> {
    await run(store, "readwrite", (s) => s.put(value));
  },
  async remove(store: string, id: string): Promise<void> {
    await run(store, "readwrite", (s) => s.delete(id));
  },
  async clear(store: string): Promise<void> {
    await run(store, "readwrite", (s) => s.clear());
  },
  async getSetting<T>(key: string): Promise<T | undefined> {
    const record = await run<{ key: string; value: T } | undefined>(
      STORES.SETTINGS,
      "readonly",
      (s) => s.get(key)
    );
    return record?.value;
  },
  async setSetting(key: string, value: unknown): Promise<void> {
    await run(STORES.SETTINGS, "readwrite", (s) => s.put({ key, value }));
  },
  async removeSetting(key: string): Promise<void> {
    await run(STORES.SETTINGS, "readwrite", (s) => s.delete(key));
  },
};
