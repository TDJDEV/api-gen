import { Application, Router, Context } from "https://deno.land/x/oak/mod.ts";

class Record {
  private id: string;
  private data: any;

  constructor(data: any) {
    this.id = data.id || crypto.randomUUID();
    this.data = data.data || {};
  }

  getId() {
    return this.id;
  }

  getData() {
    return this.data;
  }

  setData(data: any) {
    this.data = data;
  }
}

class Collection {
  private name: string;
  private records: Map<string, Record>;

  constructor(name: string) {
    this.name = name;
    this.records = new Map<string, Record>();
  }

  getName() {
    return this.name;
  }

  getRecords() {
    return Array.from(this.records.values());
  }

  addRecord(record: Record) {
    this.records.set(record.getId(), record);
  }

  getRecordById(id: string) {
    return this.records.get(id);
  }

  updateRecord(record: Record) {
    this.records.set(record.getId(), record);
  }

  deleteRecord(id: string) {
    this.records.delete(id);
  }
}

class Store {
  private collections: Map<string, Collection>;

  constructor() {
    this.collections = new Map<string, Collection>();
  }

  createCollection(name: string) {
    if (!this.collections.has(name)) {
      this.collections.set(name, new Collection(name));
    }
  }

  getCollections() {
    return Array.from(this.collections.keys());
  }

  getCollection(name: string) {
    return this.collections.get(name);
  }

  addRecord(collectionName: string, record: Record) {
    const collection = this.collections.get(collectionName);
    if (collection) {
      collection.addRecord(record);
    }
  }

  getRecords(collectionName: string) {
    const collection = this.collections.get(collectionName);
    return collection ? collection.getRecords() : [];
  }

  getRecordById(collectionName: string, id: string) {
    const collection = this.collections.get(collectionName);
    return collection ? collection.getRecordById(id) : null;
  }

  updateRecord(collectionName: string, record: Record) {
    const collection = this.collections.get(collectionName);
    if (collection) {
      collection.updateRecord(record);
    }
  }

  deleteRecord(collectionName: string, id: string) {
    const collection = this.collections.get(collectionName);
    if (collection) {
      collection.deleteRecord(id);
      return true;
    }
    return false;
  }

  exportToJson(collectionName: string) {
    const collection = this.collections.get(collectionName);
    if (collection) {
      const jsonData = JSON.stringify(collection.getRecords());
      const encoder = new TextEncoder();
      const data = encoder.encode(jsonData);
      return {
        filename: `${collectionName}.json`,
        data,
      };
    }
    return null;
  }

  importFromJson(collectionName: string, data: Uint8Array) {
    const decoder = new TextDecoder();
    const jsonData = decoder.decode(data);
    const recordsData = JSON.parse(jsonData);
    const collection = this.collections.get(collectionName);
    if (collection && Array.isArray(recordsData)) {
      collection.getRecords().splice(0);
      recordsData.forEach((recordData: any) => {
        const record = new Record(recordData);
        collection.addRecord(record);
      });
      return true;
    }
    return false;
  }

  exportToSql(collectionName: string) {
    const collection = this.collections.get(collectionName);
    if (collection) {
      let sqlData = `CREATE TABLE IF NOT EXISTS ${collectionName} (id TEXT PRIMARY KEY, data JSONB);\n`;
      for (const record of collection.getRecords()) {
        const values = JSON.stringify(record.getData());
        sqlData += `INSERT INTO ${collectionName} (id, data) VALUES ('${record.getId()}', '${values}');\n`;
      }
      const encoder = new TextEncoder();
      const data = encoder.encode(sqlData);
      return {
        filename: `${collectionName}.sql`,
        data,
      };
    }
    return null;
  }

  importFromSql(collectionName: string, data: Uint8Array) {
    const decoder = new TextDecoder();
    const sqlData = decoder.decode(data);
    const statements = sqlData.split(";\n");
    const collection = new Collection(collectionName);
    statements.forEach((statement: string) => {
      if (statement.trim()) {
        const match = statement.match(/INSERT INTO (\w+) \(id, data\) VALUES \('(.+)', '(.+)'\)/);
        if (match && match.length === 4) {
          const tableName = match[1];
          const id = match[2];
          const values = JSON.parse(match[3]);
          if (tableName === collectionName && id && typeof values === "object") {
            const record = new Record({ id, data: values });
            collection.addRecord(record);
          }
        }
      }
    });
    this.collections.set(collectionName, collection);
  }

  exportDatabaseToJson() {
    const data = {};
    for (const [collectionName, collection] of this.collections) {
      data[collectionName] = Array.from(collection.getRecords());
    }
    const jsonData = JSON.stringify(data);
    const encoder = new TextEncoder();
    const encodedData = encoder.encode(jsonData);
    return {
      filename: "database.json",
      data: encodedData,
    };
  }

  importDatabaseFromJson(data: Uint8Array) {
    const decoder = new TextDecoder();
    const jsonData = decoder.decode(data);
    const collectionsData = JSON.parse(jsonData);
    if (typeof collectionsData === "object") {
      for (const collectionName in collectionsData) {
        if (collectionsData.hasOwnProperty(collectionName)) {
          const recordsData = collectionsData[collectionName];
          const collection = new Collection(collectionName);
          if (Array.isArray(recordsData)) {
            recordsData.forEach((recordData: any) => {
              const record = new Record(recordData);
              collection.addRecord(record);
            });
          }
          this.collections.set(collectionName, collection);
        }
      }
      return true;
    }
    return false;
  }

  exportDatabaseToSql() {
    let sqlData = "";
    for (const [collectionName, collection] of this.collections) {
      sqlData += `CREATE TABLE IF NOT EXISTS ${collectionName} (id TEXT PRIMARY KEY, data JSONB);\n`;
      for (const record of collection.getRecords()) {
        const values = JSON.stringify(record.getData());
        sqlData += `INSERT INTO ${collectionName} (id, data) VALUES ('${record.getId()}', '${values}');\n`;
      }
    }
    const encoder = new TextEncoder();
    const data = encoder.encode(sqlData);
    return {
      filename: "database.sql",
      data,
    };
  }

  importDatabaseFromSql(data: Uint8Array) {
    const decoder = new TextDecoder();
    const sqlData = decoder.decode(data);
    const statements = sqlData.split(";\n");
    for (const statement of statements) {
      if (statement.trim()) {
        const match = statement.match(/INSERT INTO (\w+) \(id, data\) VALUES \('(.+)', '(.+)'\)/);
        if (match && match.length === 4) {
          const tableName = match[1];
          const id = match[2];
          const values = JSON.parse(match[3]);
          if (tableName && id && typeof values === "object") {
            const collection = this.collections.get(tableName);
            if (collection) {
              const record = new Record({ id, data: values });
              collection.addRecord(record);
            }
          }
        }
      }
    }
  }
}

class API {
  private store: Store;
  private app: Application;
  private router: Router;

  constructor() {
    this.store = new Store();
    this.app = new Application();
    this.router = new Router();
  }

  registerRoutes() {
    this.router.post("/collections", this.createCollection.bind(this));
    this.router.post("/collections/:collectionName/records", this.addRecord.bind(this));
    this.router.get("/collections/:collectionName/records", this.getRecords.bind(this));
    this.router.get("/collections/:collectionName/records/:id", this.getRecordById.bind(this));
    this.router.put("/collections/:collectionName/records/:id", this.updateRecord.bind(this));
    this.router.delete("/collections/:collectionName/records/:id", this.deleteRecord.bind(this));
    this.router.get(
      "/collections/:collectionName/export-json",
      this.exportToJson.bind(this)
    );
    this.router.post(
      "/collections/:collectionName/import-json",
      this.importFromJson.bind(this)
    );
    this.router.get("/collections/:collectionName/export-sql", this.exportToSql.bind(this));
    this.router.post("/collections/:collectionName/import-sql", this.importFromSql.bind(this));
    this.router.get("/export-json", this.exportDatabaseToJson.bind(this));
    this.router.post("/import-json", this.importDatabaseFromJson.bind(this));
    this.router.get("/export-sql", this.exportDatabaseToSql.bind(this));
    this.router.post("/import-sql", this.importDatabaseFromSql.bind(this));

    this.app.use(this.router);
  }

  async createCollection(ctx: Context) {
    const { name } = await ctx.body();
    this.store.createCollection(name);
    ctx.json({ message: "Collection created successfully" });
  }

  async addRecord(ctx: Context) {
    const { collectionName } = ctx.params;
    const recordData = await ctx.body();
    const record = new Record(recordData);
    this.store.addRecord(collectionName, record);
    ctx.json({ message: "Record added successfully" });
  }

  async getRecords(ctx: Context) {
    const { collectionName } = ctx.params;
    const records = this.store.getRecords(collectionName);
    ctx.json(records);
  }

  async getRecordById(ctx: Context) {
    const { collectionName, id } = ctx.params;
    const record = this.store.getRecordById(collectionName, id);
    if (record) {
      ctx.json(record);
    } else {
      ctx.json({ message: "Record not found" }, 404);
    }
  }

  async updateRecord(ctx: Context) {
    const { collectionName, id } = ctx.params;
    const recordData = await ctx.body();
    const existingRecord = this.store.getRecordById(collectionName, id);
    if (existingRecord) {
      const updatedRecord = new Record({ id, data: recordData });
      this.store.updateRecord(collectionName, updatedRecord);
      ctx.json({ message: "Record updated successfully" });
    } else {
      ctx.json({ message: "Record not found" }, 404);
    }
  }

  async deleteRecord(ctx: Context) {
    const { collectionName, id } = ctx.params;
    const success = this.store.deleteRecord(collectionName, id);
    if (success) {
      ctx.json({ message: "Record deleted successfully" });
    } else {
      ctx.json({ message: "Record not found" }, 404);
    }
  }

  async exportToJson(ctx: Context) {
    const { collectionName } = ctx.params;
    const exportData = this.store.exportToJson(collectionName);
    if (exportData) {
      ctx.response.headers.set("Content-Disposition", `attachment; filename="${exportData.filename}"`);
      ctx.response.headers.set("Content-Type", "application/json");
      ctx.response.body = exportData.data;
    } else {
      ctx.json({ message: "Collection not found" }, 404);
    }
  }

  async importFromJson(ctx: Context) {
    const { collectionName } = ctx.params;
    const file = ctx.request.serverRequest.body?.file;
    if (file) {
      const fileData = await file.arrayBuffer();
      const importSuccess = this.store.importFromJson(collectionName, new Uint8Array(fileData));
      if (importSuccess) {
        ctx.json({ message: "Data imported successfully" });
      } else {
        ctx.json({ message: "Invalid JSON data or collection not found" }, 400);
      }
    } else {
      ctx.json({ message: "No file provided" }, 400);
    }
  }

  async exportToSql(ctx: Context) {
    const { collectionName } = ctx.params;
    const exportData = this.store.exportToSql(collectionName);
    if (exportData) {
      ctx.response.headers.set("Content-Disposition", `attachment; filename="${exportData.filename}"`);
      ctx.response.headers.set("Content-Type", "text/plain");
      ctx.response.body = exportData.data;
    } else {
      ctx.json({ message: "Collection not found" }, 404);
    }
  }

  async importFromSql(ctx: Context) {
    const { collectionName } = ctx.params;
    const file = ctx.request.serverRequest.body?.file;
    if (file) {
      const fileData = await file.arrayBuffer();
      const importSuccess = this.store.importFromSql(collectionName, new Uint8Array(fileData));
      if (importSuccess) {
        ctx.json({ message: "Data imported successfully" });
      } else {
        ctx.json({ message: "Invalid SQL data or collection not found" }, 400);
      }
    } else {
      ctx.json({ message: "No file provided" }, 400);
    }
  }

  async exportDatabaseToJson(ctx: Context) {
    const exportData = this.store.exportDatabaseToJson();
    if (exportData) {
      ctx.response.headers.set("Content-Disposition", `attachment; filename="${exportData.filename}"`);
      ctx.response.headers.set("Content-Type", "application/json");
      ctx.response.body = exportData.data;
    } else {
      ctx.json({ message: "Failed to export database" }, 500);
    }
  }

  async importDatabaseFromJson(ctx: Context) {
    const file = ctx.request.serverRequest.body?.file;
    if (file) {
      const fileData = await file.arrayBuffer();
      const importSuccess = this.store.importDatabaseFromJson(new Uint8Array(fileData));
      if (importSuccess) {
        ctx.json({ message: "Database imported successfully" });
      } else {
        ctx.json({ message: "Invalid JSON data" }, 400);
      }
    } else {
      ctx.json({ message: "No file provided" }, 400);
    }
  }

  async exportDatabaseToSql(ctx: Context) {
    const exportData = this.store.exportDatabaseToSql();
    if (exportData) {
      ctx.response.headers.set("Content-Disposition", `attachment; filename="${exportData.filename}"`);
      ctx.response.headers.set("Content-Type", "text/plain");
      ctx.response.body = exportData.data;
    } else {
      ctx.json({ message: "Failed to export database" }, 500);
    }
  }

  async importDatabaseFromSql(ctx: Context) {
    const file = ctx.request.serverRequest.body?.file;
    if (file) {
      const fileData = await file.arrayBuffer();
      this.store.importDatabaseFromSql(new Uint8Array(fileData));
      ctx.json({ message: "Database imported successfully" });
    } else {
      ctx.json({ message: "No file provided" }, 400);
    }
  }

  serverRequestHandler = (ctx: any) => {
    return this.app.handle(ctx.request.serverRequest);
  }

  start(port: number) {
    this.app.listen({ port });
  }
}

export { API };
