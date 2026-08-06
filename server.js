const fs = require('fs');
const path = require('path');
const express = require('express');
const {
  importWorkbookToSqlite,
  defaultDbPath,
  defaultXlsxPath,
  getLatestImportInfo,
} = require('./src/xlsxToSqlite');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json({ limit: '1mb' }));
app.use(
  express.static(__dirname, {
    extensions: ['html'],
  }),
);

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'Controle_de_Soldagem_Ozango_V5_2_3.html'));
});

app.get('/api/db-status', (_req, res) => {
  const exists = fs.existsSync(defaultDbPath);
  const latestImport = getLatestImportInfo(defaultDbPath);
  res.json({
    ok: true,
    database: {
      exists,
      path: defaultDbPath,
    },
    xlsx: {
      exists: fs.existsSync(defaultXlsxPath),
      path: defaultXlsxPath,
    },
    latestImport,
  });
});

app.post('/api/import-xlsx', (req, res) => {
  try {
    const requestedFile = String(req.body?.fileName || '').trim();
    const fileName = requestedFile || path.basename(defaultXlsxPath);

    if (fileName !== path.basename(fileName)) {
      return res.status(400).json({ ok: false, error: 'Nome de arquivo invalido.' });
    }
    if (!/\.(xlsx|xls)$/i.test(fileName)) {
      return res.status(400).json({ ok: false, error: 'Informe um arquivo .xlsx ou .xls.' });
    }

    const xlsxPath = path.join(__dirname, fileName);
    if (!fs.existsSync(xlsxPath)) {
      return res.status(404).json({ ok: false, error: `Arquivo nao encontrado: ${fileName}` });
    }

    const summary = importWorkbookToSqlite({ xlsxPath, dbPath: defaultDbPath });
    return res.json({ ok: true, summary });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message || 'Falha ao importar planilha.',
    });
  }
});

function maybeBootstrapDatabase() {
  if (fs.existsSync(defaultDbPath) || !fs.existsSync(defaultXlsxPath)) {
    return;
  }

  try {
    const summary = importWorkbookToSqlite({
      xlsxPath: defaultXlsxPath,
      dbPath: defaultDbPath,
    });
    console.log(
      `Banco SQLite criado automaticamente em ${defaultDbPath} com ${summary.totalRows} registros.`,
    );
  } catch (error) {
    console.error('Falha ao criar o banco SQLite automaticamente:', error?.message || error);
  }
}

maybeBootstrapDatabase();

app.listen(PORT, () => {
  console.log(`Controle de Soldagem ouvindo na porta ${PORT}`);
  console.log(`Status do banco: http://localhost:${PORT}/api/db-status`);
});
