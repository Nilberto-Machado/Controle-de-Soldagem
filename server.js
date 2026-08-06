const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.static(__dirname, {
  extensions: ['html'],
}));

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'Controle_de_Soldagem_Ozango_V5_2_3.html'));
});

app.listen(PORT, () => {
  console.log(`Controle de Soldagem ouvindo na porta ${PORT}`);
});
