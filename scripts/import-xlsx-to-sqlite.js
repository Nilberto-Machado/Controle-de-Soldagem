const path = require('path');
const {
  importWorkbookToSqlite,
  defaultDbPath,
  defaultXlsxPath,
} = require('../src/xlsxToSqlite');

function resolveFromRoot(inputPath, fallbackPath) {
  if (!inputPath) {
    return fallbackPath;
  }
  return path.isAbsolute(inputPath)
    ? inputPath
    : path.resolve(process.cwd(), inputPath);
}

try {
  const xlsxPath = resolveFromRoot(process.argv[2], defaultXlsxPath);
  const dbPath = resolveFromRoot(process.argv[3], defaultDbPath);

  const summary = importWorkbookToSqlite({ xlsxPath, dbPath });

  console.log('Importacao concluida com sucesso.');
  console.log(`XLSX: ${summary.xlsxPath}`);
  console.log(`SQLite: ${summary.dbPath}`);
  console.log(`Abas: ${summary.sheets.length}`);
  console.log(`Registros: ${summary.totalRows}`);
  summary.sheets.forEach((sheet) => {
    console.log(`- ${sheet.sheetName} -> ${sheet.tableName}: ${sheet.rows} linhas, ${sheet.columns} colunas`);
  });
} catch (error) {
  console.error('Falha na importacao:', error?.message || error);
  process.exitCode = 1;
}
