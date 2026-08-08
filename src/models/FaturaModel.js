import mongoose from "mongoose";
import { payConn } from "../config/db.js";

const faturaSchema = new mongoose.Schema({
  usuarioId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  abacatepayCheckoutId: {
    type: String,
    required: false,
  },
  abacatepayPaymentUrl: {
    type: String,
    required: false,
  },
  origemCobranca: {
    type: String,
    enum: ["mensalidade", "contrato", "loja"],
    required: true,
  },
  contratoId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
  },
  descricao: {
    type: String,
    required: true,
  },
  itensLoja: [{
    nome: String,
    preco: Number,
    quantidade: Number
  }],
  valorOriginal: {
    type: Number,
    required: true,
  },
  valorComDesconto: {
    type: Number,
    required: true,
  },
  vencimento: {
    type: Date,
    required: true,
  },
  status: {
    type: String,
    enum: ["PENDING", "PAID", "CANCELLED", "EXPIRED"],
    default: "PENDING",
  },
  isRecorrente: {
    type: Boolean,
    default: false,
  },
  tenantId: {
    type: String,
    required: true,
  },
}, {
  timestamps: true,
});

const Fatura = payConn.model("Fatura", faturaSchema);
export default Fatura;
