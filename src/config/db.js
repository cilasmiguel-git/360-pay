import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const connOptions = {
  serverSelectionTimeoutMS: 10000,
};

// Vercel Connection Caching
let userConn = global.mongooseUserConn;
if (!userConn) {
  if (!process.env.MONGODB_URL_USERS) {
    console.error("❌ MONGODB_URL_USERS não definida nas variáveis de ambiente!");
  }
  userConn = global.mongooseUserConn = mongoose.createConnection(process.env.MONGODB_URL_USERS, connOptions);
}

let payConn = global.mongoosePayConn;
if (!payConn) {
  if (!process.env.MONGODB_URL_PAYMENTS) {
    console.error("❌ MONGODB_URL_PAYMENTS não definida nas variáveis de ambiente!");
  }
  payConn = global.mongoosePayConn = mongoose.createConnection(process.env.MONGODB_URL_PAYMENTS, connOptions);
}

export const ensureDbConnected = async (req, res, next) => {
  try {
    if (userConn.readyState !== 1) {
      await userConn.asPromise();
    }
    if (payConn.readyState !== 1) {
      await payConn.asPromise();
    }
    if (next) next();
  } catch (err) {
    console.error("Erro ao conectar no banco de dados:", err);
    if (res) return res.status(500).json({ error: "Erro de conexão com o banco de dados" });
  }
};

export { userConn, payConn };

userConn.on('connected', () => console.log(`MongoDB Users Connected: ${userConn.host}`));
userConn.on('error', (err) => console.error(`Error connecting to Users DB: ${err.message}`));

payConn.on('connected', () => console.log(`MongoDB Payments Connected: ${payConn.host}`));
payConn.on('error', (err) => console.error(`Error connecting to Payments DB: ${err.message}`));

