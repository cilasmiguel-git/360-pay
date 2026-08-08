import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import "./config/db.js";
import paymentRoutes from "./routes/paymentRoutes.js";

dotenv.config();

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/payments", paymentRoutes);

// Basic health check route
app.get("/", (req, res) => {
  res.send("API de Pagamentos (AbacatePay) está rodando!");
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
