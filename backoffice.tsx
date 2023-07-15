import { h, useState, useEffect } from "https://cdn.skypack.dev/vno?dts";
import { API } from "./api.ts";

export function Backoffice() {
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

  const api = new API();

  useEffect(() => {
    // Fetch collections
    api.getCollections()
      .then((data) => setCollections(data));
  }, []);

  useEffect(() => {
    // Fetch records of selected collection
    if (selectedCollection) {
      api.getRecords(selectedCollection)
        .then((data) => setRecords(data));
    }
  }, [selectedCollection]);

  useEffect(() => {
    // Fetch record data of selected record
    if (selectedCollection && selectedRecord) {
      api.getRecordById(selectedCollection, selectedRecord)
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
      api.exportToJson(exportOptions.collectionName)
        .then(() => {
          window.open(`/collections/${exportOptions.collectionName}.json`);
        });
    } else if (exportOptions.format === "sql") {
      api.exportToSql(exportOptions.collectionName)
        .then(() => {
          window.open(`/collections/${exportOptions.collectionName}.sql`);
        });
    }
  };

  const handleImportButtonClick = () => {
    if (importOptions.format === "json" && importOptions.file) {
      const reader = new FileReader();
      reader.onload = async () => {
        const jsonData = reader.result;
        await api.importFromJson(importOptions.collectionName, jsonData);
        window.location.reload();
      };
      reader.readAsText(importOptions.file);
    } else if (importOptions.format === "sql" && importOptions.file) {
      const reader = new FileReader();
      reader.onload = async () => {
        const sqlData = reader.result;
        await api.importFromSql(importOptions.collectionName, sqlData);
        window.location.reload();
      };
      reader.readAsText(importOptions.file);
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
