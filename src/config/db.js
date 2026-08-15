import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

// Opções de conexão altamente otimizadas para ambiente Serverless (Vercel)
const connOptions = {
  maxPoolSize: 10,                 // Limita sockets por instância Serverless (evita estourar limite do Atlas)
  minPoolSize: 0,                  // Não mantém sockets ociosos no congelamento da função
  serverSelectionTimeoutMS: 15000, // Dá tempo suficiente (15s) para o Cold Start da Vercel conectar ao Atlas
  socketTimeoutMS: 45000,          // Fecha sockets inativos automaticamente
  connectTimeoutMS: 15000,
  bufferCommands: false,           // Evita que queries fiquem travadas se o DB estiver desconectado
  family: 4,                       // Força IPv4 para evitar timeouts de DNS IPv6 na Vercel (AWS Lambda)
};

// Caching estático das conexões no escopo global (Vercel Serverless)
// As conexões são instanciadas UMA ÚNICA VEZ e nunca recriadas/zeradas,
// garantindo que os Models (User, Fatura) nunca percam a referência da conexão.
if (!global.mongooseUserConn && process.env.MONGODB_URL_USERS) {
  global.mongooseUserConn = mongoose.createConnection(process.env.MONGODB_URL_USERS, connOptions);
}

if (!global.mongoosePayConn && process.env.MONGODB_URL_PAYMENTS) {
  global.mongoosePayConn = mongoose.createConnection(process.env.MONGODB_URL_PAYMENTS, connOptions);
}

export const userConn = global.mongooseUserConn;
export const payConn = global.mongoosePayConn;

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

    const promises = [];
    if (userConn && userConn.readyState !== 1) {
      promises.push(userConn.asPromise());
    }
    if (payConn && payConn.readyState !== 1) {
      promises.push(payConn.asPromise());
    }

    if (promises.length > 0) {
      await Promise.all(promises);
    }

    if (next) next();
  } catch (err) {
    console.error("Erro ao conectar no banco de dados:", err);
    if (res) return res.status(500).json({ error: "Erro de conexão com o banco de dados", details: err.message });
  }
};

if (userConn) {
  userConn.on('connected', () => console.log(`MongoDB Users Connected: ${userConn.host}`));
  userConn.on('error', (err) => console.error(`Error connecting to Users DB: ${err.message}`));
}

if (payConn) {
  payConn.on('connected', () => console.log(`MongoDB Payments Connected: ${payConn.host}`));
  payConn.on('error', (err) => console.error(`Error connecting to Payments DB: ${err.message}`));
}


