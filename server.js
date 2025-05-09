const express = require('express');
const path = require('path');
const app = express();

// Statische Dateien ausliefern
app.use(express.static(__dirname));

// Alle Routen auf index.html umleiten
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`);
});
