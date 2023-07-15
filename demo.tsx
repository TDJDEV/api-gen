import { Application, Router, Context } from "https://deno.land/x/abc/mod.ts";
import { writeJson, readJson } from "https://deno.land/std/fs/mod.ts";
import { Client } from "https://deno.land/x/postgres/mod.ts";
import { Database } from "https://deno.land/x/denodb/mod.ts";
import { h, render, useState, useEffect } from "https://cdn.skypack.dev/vno?dts";

class Record {
  private id: string;
  private data: any;

  constructor(data: any) {
    this.id = crypto.randomUUID();
    this.data = data;
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
  private records: Map<string, Record>;

  constructor() {
    this.records = new Map<string, Record>();
  }

  addRecord(record: Record) {
    this.records.set(record.getId(), record);
  }

  getRecords() {
    return Array.from(this.records.values());
  }

  getRecordById(id: string) {
    return this.records.get(id);
  }

  deleteRecord(id: string) {
    return this.records.delete(id);
  }

  async exportToJson(filename: string) {
    const jsonData = JSON.stringify(this.getRecords(), null, 2);
    await writeJson(filename, jsonData);
  }

  async importFromJson(filename: string) {
    const jsonData = await readJson(filename);
    if (Array.isArray(jsonData)) {
      this.records.clear();
      for (const data of jsonData) {
        const record = new Record(data);
        this.addRecord(record);
      }
    }
  }
}

class Store {
  private collections: Map<string, Collection>;
  private db: Database<any> | undefined;

  constructor() {
    this.collections = new Map<string, Collection>();
  }

  createCollection(name: string) {
    this.collections.set(name, new Collection());
  }

  addRecord(collectionName: string, record: Record) {
    const collection = this.collections.get(collectionName);
    if (collection) {
      collection.addRecord(record);
    } else {
      throw new Error(`Collection '${collectionName}' does not exist.`);
    }
  }

  getRecords(collectionName: string) {
    const collection = this.collections.get(collectionName);
    if (collection) {
      return collection.getRecords();
    } else {
      throw new Error(`Collection '${collectionName}' does not exist.`);
    }
  }

  getRecordById(collectionName: string, id: string) {
    const collection = this.collections.get(collectionName);
    if (collection) {
      return collection.getRecordById(id);
    } else {
      throw new Error(`Collection '${collectionName}' does not exist.`);
    }
  }

  deleteRecord(collectionName: string, id: string) {
    const collection = this.collections.get(collectionName);
    if (collection) {
      return collection.deleteRecord(id);
    } else {
      throw new Error(`Collection '${collectionName}' does not exist.`);
    }
  }

  async exportToJson(collectionName: string, filename: string) {
    const collection = this.collections.get(collectionName);
    if (collection) {
      await collection.exportToJson(filename);
    } else {
      throw new Error(`Collection '${collectionName}' does not exist.`);
    }
  }

  async importFromJson(collectionName: string, filename: string) {
    const collection = this.collections.get(collectionName);
    if (collection) {
      await collection.importFromJson(filename);
    } else {
      throw new Error(`Collection '${collectionName}' does not exist.`);
    }
  }

  async exportToSql(connectionString: string, collectionName: string) {
    const client = new Client(connectionString);
    await client.connect();

    const collection = this.collections.get(collectionName);
    if (collection) {
      for (const record of collection.getRecords()) {
        const { data } = record.getData();
        const columns = Object.keys(data).join(", ");
        const values = Object.values(data)
          .map((value: any) => typeof value === "string" ? `'${value}'` : value)
          .join(", ");
        await client.query(`INSERT INTO ${collectionName} (${columns}) VALUES (${values});`);
      }
    } else {
      throw new Error(`Collection '${collectionName}' does not exist.`);
    }

    await client.end();
  }

  async importFromSql(connectionString: string, collectionName: string) {
    const client = new Client(connectionString);
    await client.connect();

    const collection = this.collections.get(collectionName);
    if (collection) {
      const result = await client.query(`SELECT * FROM ${collectionName};`);
      if (Array.isArray(result.rows)) {
        collection.getRecords().clear();
        for (const row of result.rows) {
          const data: any = {};
          for (const key in row) {
            if (row.hasOwnProperty(key) && key !== "id") {
              data[key] = row[key];
            }
          }
          const record = new Record({ id: row.id, data });
          collection.addRecord(record);
        }
      }
    } else {
      throw new Error(`Collection '${collectionName}' does not exist.`);
    }

    await client.end();
  }

  async exportDatabaseToJson(filename: string) {
    const jsonData = JSON.stringify(Array.from(this.collections.entries()), null, 2);
    await writeJson(filename, jsonData);
  }

  async importDatabaseFromJson(filename: string) {
    const jsonData = await readJson(filename);
    if (Array.isArray(jsonData)) {
      this.collections.clear();
      for (const [collectionName, records] of jsonData) {
        const collection = new Collection();
        for (const recordData of records) {
          const record = new Record(recordData);
          collection.addRecord(record);
        }
        this.collections.set(collectionName, collection);
      }
    }
  }

  async exportDatabaseToSql(connectionString: string) {
    const client = new Client(connectionString);
    await client.connect();

    for (const [collectionName, collection] of this.collections) {
      for (const record of collection.getRecords()) {
        const { data } = record.getData();
        const columns = Object.keys(data).join(", ");
        const values = Object.values(data)
          .map((value: any) => typeof value === "string" ? `'${value}'` : value)
          .join(", ");
        await client.query(`INSERT INTO ${collectionName} (${columns}) VALUES (${values});`);
      }
    }

    await client.end();
  }

  async importDatabaseFromSql(connectionString: string) {
    const client = new Client(connectionString);
    await client.connect();

    const tablesResult = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public';`);
    if (Array.isArray(tablesResult.rows)) {
      const tables = tablesResult.rows.map((row) => row.table_name);
      this.collections.clear();

      for (const table of tables) {
        const result = await client.query(`SELECT * FROM ${table};`);
        if (Array.isArray(result.rows)) {
          const collection = new Collection();
          for (const row of result.rows) {
            const data: any = {};
            for (const key in row) {
              if (row.hasOwnProperty(key) && key !== "id") {
                data[key] = row[key];
              }
            }
            const record = new Record({ id: row.id, data });
            collection.addRecord(record);
          }
          this.collections.set(table, collection);
        }
      }
    }

    await client.end();
  }
}

interface HookContext {
  route?: string;
  collectionName?: string;
  id?: string;
  body?: any;
}

type HookCallback = (ctx: HookContext) => Promise<void>;

interface RouteHook {
  route: string;
  hook: HookCallback;
}

class API {
  private router: Router;
  private store: Store;
  private globalPreHooks: HookCallback[];
  private globalPostHooks: HookCallback[];
  private preRouteHooks: Map<string, RouteHook[]>;
  private postRouteHooks: Map<string, RouteHook[]>;

  constructor() {
    this.router = new Router();
    this.store = new Store();
    this.globalPreHooks = [];
    this.globalPostHooks = [];
    this.preRouteHooks = new Map<string, RouteHook[]>();
    this.postRouteHooks = new Map<string, RouteHook[]>();
  }

  private async executeHooks(hooks: HookCallback[], ctx: HookContext) {
    for (const hook of hooks) {
      await hook(ctx);
    }
  }

  private async executePreHooks(ctx: HookContext) {
    await this.executeHooks(this.globalPreHooks, ctx);
    const route = ctx.route;
    if (route && this.preRouteHooks.has(route)) {
      const routeHooks = this.preRouteHooks.get(route) || [];
      await this.executeHooks(routeHooks.map((hook) => hook.hook), ctx);
    }
  }

  private async executePostHooks(ctx: HookContext) {
    await this.executeHooks(this.globalPostHooks, ctx);
    const route = ctx.route;
    if (route && this.postRouteHooks.has(route)) {
      const routeHooks = this.postRouteHooks.get(route) || [];
      await this.executeHooks(routeHooks.map((hook) => hook.hook), ctx);
    }
  }

  private createCollection = async (ctx: Context) => {
    const { name } = ctx.body();
    const route = "/collections";
    await this.executePreHooks({ route });
    this.store.createCollection(name);
    await this.executePostHooks({ route });
    ctx.json({ message: `Collection '${name}' created successfully` });
  }

  private addRecord = async (ctx: Context) => {
    const { collectionName } = ctx.params;
    const body = await ctx.body();
    const route = `/collections/${collectionName}/records`;
    await this.executePreHooks({ route, collectionName, body });
    const record = new Record(body);
    this.store.addRecord(collectionName, record);
    await this.executePostHooks({ route, collectionName, id: record.getId(), body });
    ctx.json({ message: "Record added successfully" });
  }

  private getRecords = async (ctx: Context) => {
    const { collectionName } = ctx.params;
    const route = `/collections/${collectionName}/records`;
    await this.executePreHooks({ route, collectionName });
    const records = this.store.getRecords(collectionName);
    await this.executePostHooks({ route, collectionName });
    ctx.json(records);
  }

  private getRecordById = async (ctx: Context) => {
    const { collectionName, id } = ctx.params;
    const route = `/collections/${collectionName}/records/${id}`;
    await this.executePreHooks({ route, collectionName, id });
    const record = this.store.getRecordById(collectionName, id);
    if (record) {
      await this.executePostHooks({ route, collectionName, id });
      ctx.json(record.getData());
    } else {
      await this.executePostHooks({ route, collectionName, id });
      ctx.json({ message: "Record not found" }, 404);
    }
  }

  private updateRecord = async (ctx: Context) => {
    const { collectionName, id } = ctx.params;
    const route = `/collections/${collectionName}/records/${id}`;
    await this.executePreHooks({ route, collectionName, id });
    const record = this.store.getRecordById(collectionName, id);
    if (record) {
      const body = await ctx.body();
      await this.executePreHooks({ route, collectionName, id, body });
      record.setData(body);
      await this.executePostHooks({ route, collectionName, id, body });
      ctx.json({ message: "Record updated successfully" });
    } else {
      await this.executePostHooks({ route, collectionName, id });
      ctx.json({ message: "Record not found" }, 404);
    }
  }

  private deleteRecord = async (ctx: Context) => {
    const { collectionName, id } = ctx.params;
    const route = `/collections/${collectionName}/records/${id}`;
    await this.executePreHooks({ route, collectionName, id });
    const success = this.store.deleteRecord(collectionName, id);
    if (success) {
      await this.executePostHooks({ route, collectionName, id });
      ctx.json({ message: "Record deleted successfully" });
    } else {
      await this.executePostHooks({ route, collectionName, id });
      ctx.json({ message: "Record not found" }, 404);
    }
  }

  private async exportToJson(ctx: Context) {
    const { collectionName } = ctx.params;
    const filename = `${collectionName}.json`;
    const route = `/collections/${collectionName}/export-json`;
    await this.executePreHooks({ route, collectionName });
    await this.store.exportToJson(collectionName, filename);
    await this.executePostHooks({ route, collectionName });
    ctx.file(filename);
  }

  private async importFromJson(ctx: Context) {
    const { collectionName } = ctx.params;
    const file = ctx.request.serverRequest.body?.file;
    if (file) {
      const filename = "import.json";
      const route = `/collections/${collectionName}/import-json`;
      await this.executePreHooks({ route, collectionName });
      await Deno.copyFile(file, filename);
      await this.store.importFromJson(collectionName, filename);
      await this.executePostHooks({ route, collectionName });
      ctx.json({ message: "Data imported successfully" });
    } else {
      ctx.json({ message: "No file provided" }, 400);
    }
  }

  private async exportToSql(ctx: Context) {
    const { collectionName } = ctx.params;
    const connectionString = "your_connection_string";
    const route = `/collections/${collectionName}/export-sql`;
    await this.executePreHooks({ route, collectionName });
    await this.store.exportToSql(connectionString, collectionName);
    await this.executePostHooks({ route, collectionName });
    ctx.json({ message: "Data exported to SQL successfully" });
  }

  private async importFromSql(ctx: Context) {
    const { collectionName } = ctx.params;
    const connectionString = "your_connection_string";
    const route = `/collections/${collectionName}/import-sql`;
    await this.executePreHooks({ route, collectionName });
    await this.store.importFromSql(connectionString, collectionName);
    await this.executePostHooks({ route, collectionName });
    ctx.json({ message: "Data imported from SQL successfully" });
  }

  private async exportDatabaseToJson(ctx: Context) {
    const filename = "database.json";
    const route = "/export-json";
    await this.executePreHooks({ route });
    await this.store.exportDatabaseToJson(filename);
    await this.executePostHooks({ route });
    ctx.file(filename);
  }

  private async importDatabaseFromJson(ctx: Context) {
    const file = ctx.request.serverRequest.body?.file;
    if (file) {
      const filename = "import-database.json";
      const route = "/import-json";
      await this.executePreHooks({ route });
      await Deno.copyFile(file, filename);
      await this.store.importDatabaseFromJson(filename);
      await this.executePostHooks({ route });
      ctx.json({ message: "Database imported successfully" });
    } else {
      ctx.json({ message: "No file provided" }, 400);
    }
  }

  private async exportDatabaseToSql(ctx: Context) {
    const connectionString = "your_connection_string";
    const route = "/export-sql";
    await this.executePreHooks({ route });
    await this.store.exportDatabaseToSql(connectionString);
    await this.executePostHooks({ route });
    ctx.json({ message: "Database exported to SQL successfully" });
  }

  private async importDatabaseFromSql(ctx: Context) {
    const connectionString = "your_connection_string";
    const route = "/import-sql";
    await this.executePreHooks({ route });
    await this.store.importDatabaseFromSql(connectionString);
    await this.executePostHooks({ route });
    ctx.json({ message: "Database imported from SQL successfully" });
  }

  registerGlobalPreHook(hook: HookCallback) {
    this.globalPreHooks.push(hook);
  }

  registerGlobalPostHook(hook: HookCallback) {
    this.globalPostHooks.push(hook);
  }

  registerPreRouteHook(route: string, hook: HookCallback) {
    const routeHooks = this.preRouteHooks.get(route) || [];
    routeHooks.push({ route, hook });
    this.preRouteHooks.set(route, routeHooks);
  }

  registerPostRouteHook(route: string, hook: HookCallback) {
    const routeHooks = this.postRouteHooks.get(route) || [];
    routeHooks.push({ route, hook });
    this.postRouteHooks.set(route, routeHooks);
  }

  registerRoutes() {
    this.router.post("/collections", this.createCollection);
    this.router.post("/collections/:collectionName/records", this.addRecord);
    this.router.get("/collections/:collectionName/records", this.getRecords);
    this.router.get("/collections/:collectionName/records/:id", this.getRecordById);
    this.router.put("/collections/:collectionName/records/:id", this.updateRecord);
    this.router.delete("/collections/:collectionName/records/:id", this.deleteRecord);
    this.router.get("/collections/:collectionName/export-json", this.exportToJson);
    this.router.post("/collections/:collectionName/import-json", this.importFromJson);
    this.router.get("/collections/:collectionName/export-sql", this.exportToSql);
    this.router.post("/collections/:collectionName/import-sql", this.importFromSql);
    this.router.get("/export-json", this.exportDatabaseToJson);
    this.router.post("/import-json", this.importDatabaseFromJson);
    this.router.get("/export-sql", this.exportDatabaseToSql);
    this.router.post("/import-sql", this.importDatabaseFromSql);
  }

  getRouter() {
    return this.router;
  }
}

class Server {
  private app: Application;

  constructor() {
    this.app = new Application();
  }

  start(port: number) {
    this.app.start({ port });
  }

  registerApiRoutes(api: API) {
    this.app.use(api.getRouter().routes());
  }
}

const api = new API();
api.registerRoutes();

const server = new Server();
server.registerApiRoutes(api);
server.start(3000);

// Backoffice GUI using Vno
function Backoffice() {
  const [collections, setCollections] = useState([]);
  const [selectedCollection, setSelectedCollection] = useState("");
  const [records, setRecords] = useState([]);
  const [selectedRecord, setSelectedRecord] = useState("");
  const [recordData, setRecordData] = useState({});
  const [exportOptions, setExportOptions] = useState({
    format: "",
    collectionName: "",
  });
  const [importOptions, setImportOptions] = useState({
    format: "",
    collectionName: "",
    file: null,
  });

  useEffect(() => {
    // Fetch collections
    fetch("/collections")
      .then((response) => response.json())
      .then((data) => setCollections(data));
  }, []);

  useEffect(() => {
    // Fetch records of selected collection
    if (selectedCollection) {
      fetch(`/collections/${selectedCollection}/records`)
        .then((response) => response.json())
        .then((data) => setRecords(data));
    }
  }, [selectedCollection]);

  useEffect(() => {
    // Fetch record data of selected record
    if (selectedCollection && selectedRecord) {
      fetch(`/collections/${selectedCollection}/records/${selectedRecord}`)
        .then((response) => response.json())
        .then((data) => setRecordData(data));
    }
  }, [selectedCollection, selectedRecord]);

  const handleCollectionSelect = (event) => {
    setSelectedCollection(event.target.value);
    setSelectedRecord("");
    setRecordData({});
  };

  const handleRecordSelect = (event) => {
    setSelectedRecord(event.target.value);
  };

  const handleExportFormatChange = (event) => {
    setExportOptions({
      ...exportOptions,
      format: event.target.value,
    });
  };

  const handleExportCollectionChange = (event) => {
    setExportOptions({
      ...exportOptions,
      collectionName: event.target.value,
    });
  };

  const handleImportFormatChange = (event) => {
    setImportOptions({
      ...importOptions,
      format: event.target.value,
    });
  };

  const handleImportCollectionChange = (event) => {
    setImportOptions({
      ...importOptions,
      collectionName: event.target.value,
    });
  };

  const handleImportFileChange = (event) => {
    setImportOptions({
      ...importOptions,
      file: event.target.files[0],
    });
  };

  const handleExportButtonClick = () => {
    if (exportOptions.format === "json") {
      window.open(`/collections/${exportOptions.collectionName}/export-json`);
    } else if (exportOptions.format === "sql") {
      window.open(`/collections/${exportOptions.collectionName}/export-sql`);
    }
  };

  const handleImportButtonClick = async () => {
    if (importOptions.format === "json" && importOptions.file) {
      const formData = new FormData();
      formData.append("file", importOptions.file);
      await fetch(`/collections/${importOptions.collectionName}/import-json`, {
        method: "POST",
        body: formData,
      });
      window.location.reload();
    } else if (importOptions.format === "sql" && importOptions.file) {
      const formData = new FormData();
      formData.append("file", importOptions.file);
      await fetch(`/collections/${importOptions.collectionName}/import-sql`, {
        method: "POST",
        body: formData,
      });
      window.location.reload();
    }
  };

  return (
    <div>
      <h1>Backoffice</h1>
      <div>
        <h2>Collections</h2>
        <select onChange={handleCollectionSelect}>
          <option value="">Select a collection</option>
          {collections.map((collection) => (
            <option value={collection}>{collection}</option>
          ))}
        </select>
      </div>
      {selectedCollection && (
        <div>
          <h2>Records</h2>
          <select onChange={handleRecordSelect}>
            <option value="">Select a record</option>
            {records.map((record) => (
              <option value={record.id}>{record.id}</option>
            ))}
          </select>
        </div>
      )}
      {selectedCollection && selectedRecord && (
        <div>
          <h2>Record Data</h2>
          <pre>{JSON.stringify(recordData, null, 2)}</pre>
        </div>
      )}
      <div>
        <h2>Export/Import</h2>
        <div>
          <h3>Export</h3>
          <div>
            <label>Format:</label>
            <select value={exportOptions.format} onChange={handleExportFormatChange}>
              <option value="">Select a format</option>
              <option value="json">JSON</option>
              <option value="sql">SQL</option>
            </select>
          </div>
          {exportOptions.format && (
            <div>
              <label>Collection:</label>
              <select value={exportOptions.collectionName} onChange={handleExportCollectionChange}>
                <option value="">Select a collection</option>
                {collections.map((collection) => (
                  <option value={collection}>{collection}</option>
                ))}
              </select>
            </div>
          )}
          {exportOptions.format && exportOptions.collectionName && (
            <button onClick={handleExportButtonClick}>Export</button>
          )}
        </div>
        <div>
          <h3>Import</h3>
          <div>
            <label>Format:</label>
            <select value={importOptions.format} onChange={handleImportFormatChange}>
              <option value="">Select a format</option>
              <option value="json">JSON</option>
              <option value="sql">SQL</option>
            </select>
          </div>
          {importOptions.format && (
            <div>
              <label>Collection:</label>
              <select value={importOptions.collectionName} onChange={handleImportCollectionChange}>
                <option value="">Select a collection</option>
                {collections.map((collection) => (
                  <option value={collection}>{collection}</option>
                ))}
              </select>
            </div>
          )}
          {importOptions.format && importOptions.collectionName && (
            <div>
              <label>File:</label>
              <input type="file" onChange={handleImportFileChange} />
            </div>
          )}
          {importOptions.format && importOptions.collectionName && importOptions.file && (
            <button onClick={handleImportButtonClick}>Import</button>
          )}
        </div>
      </div>
    </div>
  );
}

render(<Backoffice />, "body");
