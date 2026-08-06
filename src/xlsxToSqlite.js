const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const XLSX = require('xlsx');

const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_XLSX_FILE = 'Ozango_Controle_Soldagem_Banco_V5_2_3.xlsx';
const DEFAULT_DB_FILE = path.join('data', 'soldagem.db');

const defaultXlsxPath = path.join(ROOT_DIR, DEFAULT_XLSX_FILE);
const defaultDbPath = path.join(ROOT_DIR, DEFAULT_DB_FILE);

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function sanitizeIdentifier(value, fallback) {
  const clean = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

  const output = clean || fallback;
  return /^[0-9]/.test(output) ? `t_${output}` : output;
}

function toCellValue(value) {
  if (value == null || value === '') {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  return value;
}

function uniqueColumnNames(rawHeaders) {
  const seen = new Map();
  return rawHeaders.map((header, index) => {
    const fallback = `col_${index + 1}`;
    const base = sanitizeIdentifier(header, fallback);
    const count = seen.get(base) || 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}_${count + 1}`;
  });
}

function inferColumnType(values) {
  let sawNumber = false;
  let sawDecimal = false;

  for (const value of values) {
    if (value == null || value === '') {
      continue;
    }
    if (typeof value === 'boolean') {
      continue;
    }

    if (typeof value === 'number') {
      sawNumber = true;
      if (!Number.isInteger(value)) {
        sawDecimal = true;
      }
      continue;
    }

    if (value instanceof Date) {
      return 'TEXT';
    }

    const normalized = String(value).trim().replace(',', '.');
    if (normalized === '') {
      continue;
    }
    if (!Number.isNaN(Number(normalized))) {
      sawNumber = true;
      if (!Number.isInteger(Number(normalized))) {
        sawDecimal = true;
      }
      continue;
    }

    return 'TEXT';
  }

  if (!sawNumber) {
    return 'TEXT';
  }
  return sawDecimal ? 'REAL' : 'INTEGER';
}

function sheetToRecords(sheet) {
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: null,
  });

  if (!matrix.length) {
    return { columns: [], rows: [] };
  }

  const headers = uniqueColumnNames(matrix[0]);
  const rows = matrix
    .slice(1)
    .map((rowArray) => {
      const record = {};
      headers.forEach((columnName, index) => {
        record[columnName] = toCellValue(rowArray[index]);
      });
      return record;
    })
    .filter((row) => Object.values(row).some((value) => value != null && value !== ''));

  return { columns: headers, rows };
}

function importWorkbookToSqlite({ xlsxPath = defaultXlsxPath, dbPath = defaultDbPath } = {}) {
  if (!fs.existsSync(xlsxPath)) {
    throw new Error(`Arquivo XLSX nao encontrado: ${xlsxPath}`);
  }

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const workbook = XLSX.readFile(xlsxPath, { cellDates: true });
  const db = new DatabaseSync(dbPath);

  const tableNames = new Set();
  const summary = {
    dbPath,
    xlsxPath,
    importedAt: new Date().toISOString(),
    sheets: [],
    totalRows: 0,
  };

  try {
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('BEGIN');

    workbook.SheetNames.forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const { columns, rows } = sheetToRecords(sheet);
      const baseName = sanitizeIdentifier(sheetName, 'sheet');
      let tableName = baseName;
      let suffix = 2;
      while (tableNames.has(tableName)) {
        tableName = `${baseName}_${suffix}`;
        suffix += 1;
      }
      tableNames.add(tableName);

      db.exec(`DROP TABLE IF EXISTS ${quoteIdentifier(tableName)}`);

      if (!columns.length) {
        db.exec(
          `CREATE TABLE ${quoteIdentifier(tableName)} (__pk INTEGER PRIMARY KEY AUTOINCREMENT, __source_row INTEGER)`,
        );
        summary.sheets.push({ sheetName, tableName, columns: 0, rows: 0 });
        return;
      }

      const typeMap = {};
      columns.forEach((columnName) => {
        typeMap[columnName] = inferColumnType(rows.map((row) => row[columnName]));
      });

      const columnDefinitions = columns
        .map((columnName) => `${quoteIdentifier(columnName)} ${typeMap[columnName]}`)
        .join(', ');

      db.exec(
        `CREATE TABLE ${quoteIdentifier(tableName)} (__pk INTEGER PRIMARY KEY AUTOINCREMENT, __source_row INTEGER, ${columnDefinitions})`,
      );

      const columnList = columns.map((columnName) => quoteIdentifier(columnName)).join(', ');
      const placeholders = columns.map(() => '?').join(', ');
      const insertSql = `INSERT INTO ${quoteIdentifier(tableName)} (__source_row, ${columnList}) VALUES (?, ${placeholders})`;
      const insertStmt = db.prepare(insertSql);

      rows.forEach((row, rowIndex) => {
        const params = [rowIndex + 2, ...columns.map((columnName) => row[columnName])];
        insertStmt.run(...params);
      });

      summary.sheets.push({
        sheetName,
        tableName,
        columns: columns.length,
        rows: rows.length,
      });
      summary.totalRows += rows.length;
    });

    db.exec(
      `CREATE TABLE IF NOT EXISTS imports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        xlsx_path TEXT NOT NULL,
        db_path TEXT NOT NULL,
        imported_at TEXT NOT NULL,
        total_rows INTEGER NOT NULL,
        total_sheets INTEGER NOT NULL
      )`,
    );

    const insertImport = db.prepare(
      'INSERT INTO imports (xlsx_path, db_path, imported_at, total_rows, total_sheets) VALUES (?, ?, ?, ?, ?)',
    );
    insertImport.run(
      summary.xlsxPath,
      summary.dbPath,
      summary.importedAt,
      summary.totalRows,
      summary.sheets.length,
    );

    db.exec('COMMIT');
    return summary;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  } finally {
    db.close();
  }
}

function getLatestImportInfo(dbPath = defaultDbPath) {
  if (!fs.existsSync(dbPath)) {
    return null;
  }

  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const hasImports = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='imports'")
      .get();

    if (!hasImports) {
      return null;
    }

    return db
      .prepare('SELECT id, xlsx_path, db_path, imported_at, total_rows, total_sheets FROM imports ORDER BY id DESC LIMIT 1')
      .get();
  } finally {
    db.close();
  }
}

module.exports = {
  DEFAULT_DB_FILE,
  DEFAULT_XLSX_FILE,
  defaultDbPath,
  defaultXlsxPath,
  getLatestImportInfo,
  importWorkbookToSqlite,
};
