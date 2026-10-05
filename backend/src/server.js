// Load .env before anything else so process.env is populated for db.js
require('dotenv').config();

const app  = require('./app');
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`MindPC backend running on http://localhost:${PORT}`);
});
