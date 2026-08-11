import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

// Opções de conexão altamente otimizadas para ambiente Serverless (Vercel)
const connOptions = {
  maxPoolSize: 10,                // Limita sockets por instância Serverless (evita estourar limite do Atlas)
  minPoolSize: 0,                 // Não mantém sockets ociosos no congelamento da função
  serverSelectionTimeoutMS: 5000, // Fala rápido (5s) em caso de oscilação em vez de pendurar a requisição
  socketTimeoutMS: 45000,          // Fecha sockets inativos automaticamente
  connectTimeoutMS: 10000,
};

// Caching de Conexões para Vercel
let userConn = global.mongooseUserConn;
if (!userConn && process.env.MONGODB_URL_USERS) {
  userConn = global.mongooseUserConn = mongoose.createConnection(process.env.MONGODB_URL_USERS, connOptions);
}

let payConn = global.mongoosePayConn;
if (!payConn && process.env.MONGODB_URL_PAYMENTS) {
  payConn = global.mongoosePayConn = mongoose.createConnection(process.env.MONGODB_URL_PAYMENTS, connOptions);
}

export const ensureDbConnected = async (req, res, next) => {
  try {
    const missing = [];
    if (!process.env.MONGODB_URL_USERS) missing.push("MONGODB_URL_USERS");
    if (!process.env.MONGODB_URL_PAYMENTS) missing.push("MONGODB_URL_PAYMENTS");

    if (missing.length > 0) {
      if (res) {
        return res.status(500).json({
          error: "Variável de ambiente ausente no servidor (Vercel)",
          details: `As seguintes variáveis não foram encontradas na Vercel: ${missing.join(", ")}. Adicione-as em Settings -> Environment Variables.`
        });
      }
    }

    if (!userConn || userConn.readyState === 0 || userConn.readyState === 3) {
      userConn = global.mongooseUserConn = mongoose.createConnection(process.env.MONGODB_URL_USERS, connOptions);
    }
    if (!payConn || payConn.readyState === 0 || payConn.readyState === 3) {
      payConn = global.mongoosePayConn = mongoose.createConnection(process.env.MONGODB_URL_PAYMENTS, connOptions);
    }

    // Conecta em paralelo aos dois bancos para acelerar o Cold Start
    await Promise.all([
      userConn.readyState === 1 ? Promise.resolve() : userConn.asPromise(),
      payConn.readyState === 1 ? Promise.resolve() : payConn.asPromise()
    ]);

    if (next) next();
  } catch (err) {
    global.mongooseUserConn = null;
    global.mongoosePayConn = null;
    userConn = null;
    payConn = null;
    console.error("Erro ao conectar no banco de dados:", err);
    if (res) return res.status(500).json({ error: "Erro de conexão com o banco de dados", details: err.message });
  }
};

export { userConn, payConn };

if (userConn) {
  userConn.on('connected', () => console.log(`MongoDB Users Connected: ${userConn.host}`));
  userConn.on('error', (err) => console.error(`Error connecting to Users DB: ${err.message}`));
}

if (payConn) {
  payConn.on('connected', () => console.log(`MongoDB Payments Connected: ${payConn.host}`));
  payConn.on('error', (err) => console.error(`Error connecting to Payments DB: ${err.message}`));
}


