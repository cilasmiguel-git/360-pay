import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const connOptions = {
  serverSelectionTimeoutMS: 10000,
};

// Vercel Connection Caching
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

    if (!userConn && process.env.MONGODB_URL_USERS) {
      userConn = global.mongooseUserConn = mongoose.createConnection(process.env.MONGODB_URL_USERS, connOptions);
    }
    if (!payConn && process.env.MONGODB_URL_PAYMENTS) {
      payConn = global.mongoosePayConn = mongoose.createConnection(process.env.MONGODB_URL_PAYMENTS, connOptions);
    }

    if (userConn && userConn.readyState !== 1) {
      await userConn.asPromise();
    }
    if (payConn && payConn.readyState !== 1) {
      await payConn.asPromise();
    }
    if (next) next();
  } catch (err) {
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


