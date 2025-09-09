const express = require("express");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static("public"));

// CORS para desenvolvimento
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
  next();
});

// Banco fake em memória (em produção, use um banco real)
let scripts = {};
let stats = {
  totalScripts: 0,
  totalViews: 0,
  createdToday: 0
};

// Função para gerar ID único
function generateId() {
  return crypto.randomBytes(6).toString("hex");
}

// Função para validar dados
function validateScript(data) {
  const { conteudo, usuario, filename, description } = data;
  const errors = [];

  if (!conteudo || conteudo.trim().length === 0) {
    errors.push("Conteúdo é obrigatório");
  }

  if (!usuario || usuario.trim().length === 0) {
    errors.push("Nome do usuário é obrigatório");
  }

  if (conteudo && conteudo.length > 100000) {
    errors.push("Conteúdo muito grande (máximo 100kb)");
  }

  return errors;
}

// Função para salvar estatísticas (simulado)
function updateStats(action) {
  switch(action) {
    case 'create':
      stats.totalScripts++;
      stats.createdToday++;
      break;
    case 'view':
      stats.totalViews++;
      break;
  }
}

// Rota principal - servir o HTML
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// API: Criar script
app.post("/api/criar", (req, res) => {
  try {
    const { conteudo, usuario, filename, description } = req.body;
    
    // Validação
    const errors = validateScript(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ 
        success: false, 
        errors,
        message: "Dados inválidos"
      });
    }

    // Gerar ID único
    let id;
    do {
      id = generateId();
    } while (scripts[id]);

    // Salvar script
    const timestamp = new Date().toISOString();
    scripts[id] = {
      conteudo: conteudo.trim(),
      usuario: usuario.trim(),
      filename: filename?.trim() || `script_${id}`,
      description: description?.trim() || "",
      created: timestamp,
      views: 0,
      lastViewed: null
    };

    updateStats('create');

    // Resposta de sucesso
    res.json({
      success: true,
      id,
      url: `/raw/${id}`,
      viewUrl: `/view/${id}`,
      editUrl: `/edit/${id}?user=${encodeURIComponent(usuario)}`,
      message: "Script criado com sucesso!"
    });

    console.log(`[${timestamp}] Script criado: ${id} por ${usuario}`);

  } catch (error) {
    console.error("Erro ao criar script:", error);
    res.status(500).json({
      success: false,
      message: "Erro interno do servidor"
    });
  }
});

// Rota RAW - conteúdo puro
app.get("/raw/:id", (req, res) => {
  try {
    const { id } = req.params;
    
    if (!scripts[id]) {
      return res.status(404).type("text/plain").send("404 - Script não encontrado");
    }

    const script = scripts[id];
    
    // Atualizar estatísticas de visualização
    script.views++;
    script.lastViewed = new Date().toISOString();
    updateStats('view');

    // Detectar tipo de conteúdo
    let contentType = "text/plain";
    const filename = script.filename.toLowerCase();
    
    if (filename.endsWith('.html')) contentType = "text/html";
    else if (filename.endsWith('.css')) contentType = "text/css";
    else if (filename.endsWith('.js')) contentType = "application/javascript";
    else if (filename.endsWith('.json')) contentType = "application/json";
    else if (filename.endsWith('.xml')) contentType = "application/xml";

    res.type(contentType).send(script.conteudo);

  } catch (error) {
    console.error("Erro ao servir RAW:", error);
    res.status(500).type("text/plain").send("500 - Erro interno");
  }
});

// Visualizar script com metadados
app.get("/view/:id", (req, res) => {
  try {
    const { id } = req.params;
    
    if (!scripts[id]) {
      return res.status(404).json({
        success: false,
        message: "Script não encontrado"
      });
    }

    const script = scripts[id];
    script.views++;
    updateStats('view');

    res.json({
      success: true,
      id,
      filename: script.filename,
      description: script.description,
      usuario: script.usuario,
      created: script.created,
      views: script.views,
      lastViewed: script.lastViewed,
      size: script.conteudo.length,
      lines: script.conteudo.split('\n').length,
      rawUrl: `/raw/${id}`
    });

  } catch (error) {
    console.error("Erro ao visualizar script:", error);
    res.status(500).json({
      success: false,
      message: "Erro interno do servidor"
    });
  }
});

// Editar script (apenas o dono)
app.get("/edit/:id", (req, res) => {
  try {
    const { id } = req.params;
    const { user } = req.query;

    if (!scripts[id]) {
      return res.status(404).json({
        success: false,
        message: "Script não encontrado"
      });
    }

    if (scripts[id].usuario !== user) {
      return res.status(403).json({
        success: false,
        message: "Acesso negado. Apenas o criador pode editar."
      });
    }

    res.json({
      success: true,
      script: {
        id,
        conteudo: scripts[id].conteudo,
        filename: scripts[id].filename,
        description: scripts[id].description,
        usuario: scripts[id].usuario,
        created: scripts[id].created
      }
    });

  } catch (error) {
    console.error("Erro ao carregar script para edição:", error);
    res.status(500).json({
      success: false,
      message: "Erro interno do servidor"
    });
  }
});

// Atualizar script
app.put("/api/update/:id", (req, res) => {
  try {
    const { id } = req.params;
    const { conteudo, usuario, filename, description, currentUser } = req.body;

    if (!scripts[id]) {
      return res.status(404).json({
        success: false,
        message: "Script não encontrado"
      });
    }

    if (scripts[id].usuario !== currentUser) {
      return res.status(403).json({
        success: false,
        message: "Acesso negado. Apenas o criador pode editar."
      });
    }

    // Validação
    const errors = validateScript(req.body);
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        errors,
        message: "Dados inválidos"
      });
    }

    // Atualizar script
    scripts[id] = {
      ...scripts[id],
      conteudo: conteudo.trim(),
      filename: filename?.trim() || scripts[id].filename,
      description: description?.trim() || scripts[id].description,
      lastModified: new Date().toISOString()
    };

    res.json({
      success: true,
      message: "Script atualizado com sucesso!",
      url: `/raw/${id}`
    });

  } catch (error) {
    console.error("Erro ao atualizar script:", error);
    res.status(500).json({
      success: false,
      message: "Erro interno do servidor"
    });
  }
});

// Deletar script
app.delete("/api/delete/:id", (req, res) => {
  try {
    const { id } = req.params;
    const { user } = req.query;

    if (!scripts[id]) {
      return res.status(404).json({
        success: false,
        message: "Script não encontrado"
      });
    }

    if (scripts[id].usuario !== user) {
      return res.status(403).json({
        success: false,
        message: "Acesso negado. Apenas o criador pode deletar."
      });
    }

    delete scripts[id];
    stats.totalScripts = Math.max(0, stats.totalScripts - 1);

    res.json({
      success: true,
      message: "Script deletado com sucesso!"
    });

  } catch (error) {
    console.error("Erro ao deletar script:", error);
    res.status(500).json({
      success: false,
      message: "Erro interno do servidor"
    });
  }
});

// Listar scripts públicos (últimos 50)
app.get("/api/scripts", (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const publicScripts = Object.entries(scripts)
      .map(([id, script]) => ({
        id,
        filename: script.filename,
        description: script.description,
        usuario: script.usuario,
        created: script.created,
        views: script.views,
        size: script.conteudo.length,
        lines: script.conteudo.split('\n').length
      }))
      .sort((a, b) => new Date(b.created) - new Date(a.created))
      .slice(skip, skip + parseInt(limit));

    res.json({
      success: true,
      scripts: publicScripts,
      total: Object.keys(scripts).length,
      page: parseInt(page),
      limit: parseInt(limit)
    });

  } catch (error) {
    console.error("Erro ao listar scripts:", error);
    res.status(500).json({
      success: false,
      message: "Erro interno do servidor"
    });
  }
});

// Estatísticas da plataforma
app.get("/api/stats", (req, res) => {
  try {
    res.json({
      success: true,
      stats: {
        ...stats,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error("Erro ao obter estatísticas:", error);
    res.status(500).json({
      success: false,
      message: "Erro interno do servidor"
    });
  }
});

// Middleware para tratar rotas não encontradas
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    message: "Rota não encontrada"
  });
});

// Middleware para tratamento de erros
app.use((err, req, res, next) => {
  console.error("Erro não tratado:", err);
  res.status(500).json({
    success: false,
    message: "Erro interno do servidor"
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`
🚀 Servidor Raw Platform iniciado!
📍 URL: http://localhost:${PORT}
🔧 Ambiente: ${process.env.NODE_ENV || 'desenvolvimento'}
⚡ Pronto para receber requisições!
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM recebido. Encerrando servidor graciosamente...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT recebido. Encerrando servidor...');
  process.exit(0);
});

module.exports = app;
