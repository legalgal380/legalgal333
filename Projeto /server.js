const express = require("express");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const path = require("path");

const app = express();
const PORT = 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

// Banco fake em memória
let scripts = {};

// Criar script
app.post("/criar", (req, res) => {
  const { conteudo, usuario } = req.body;
  const id = crypto.randomBytes(4).toString("hex");
  scripts[id] = { conteudo, usuario };
  res.json({ url: `/raw/${id}?user=${encodeURIComponent(usuario)}` });
});

// Rota RAW
app.get("/raw/:id", (req, res) => {
  const { id } = req.params;
  const { user } = req.query;
  
  if (scripts[id] && scripts[id].usuario === user) {
    res.type("text/plain").send(scripts[id].conteudo);
  } else {
    res.status(404).send("404 Not Found");
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
