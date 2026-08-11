import express from 'express';
import {
  gerarMensalidade,
  gerarContrato,
  gerarPedidoLoja,
  criarClienteAbacate,
  webhookAbacatePay
} from '../controllers/PaymentController.js';

const router = express.Router();

router.post('/criar-cliente', criarClienteAbacate);
router.post('/gerar-mensalidade', gerarMensalidade);
router.post('/gerar-contrato', gerarContrato);
router.post('/gerar-loja', gerarPedidoLoja);

// Rota de webhook aberta para a plataforma AbacatePay disparar os eventos
router.post('/webhook', express.json({ type: 'application/json' }), webhookAbacatePay);

export default router;
