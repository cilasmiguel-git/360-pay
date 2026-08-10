import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { ensureDbConnected } from "./config/db.js";
import paymentRoutes from "./routes/paymentRoutes.js";

dotenv.config();

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(ensureDbConnected);

// Routes
app.use("/api/payments", paymentRoutes);

// Basic health check route
app.get("/", (req, res) => {
  res.send("API de Pagamentos (AbacatePay) está rodando!");
});

// O Vercel define a variável de ambiente VERCEL automaticamente.
// Se não estivermos na Vercel, iniciamos o servidor ouvindo na porta normalmente.
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Server running locally on port ${PORT}`);
  });
}

// Para a Vercel, precisamos exportar o app Express
export default app;
