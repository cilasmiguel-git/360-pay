import express from 'express';
import {
  gerarMensalidade,
  gerarContrato,
  gerarPedidoLoja,
  criarClienteAbacate,
  webhookAbacatePay
} from '../controllers/PaymentController.js';
import { processCheckoutWorker } from '../controllers/QueueWorkerController.js';

const router = express.Router();

router.post('/criar-cliente', criarClienteAbacate);
router.post('/gerar-mensalidade', gerarMensalidade);
router.post('/gerar-contrato', gerarContrato);
router.post('/gerar-loja', gerarPedidoLoja);

// Rota Worker de processamento assíncrono via Upstash QStash
router.post('/worker/process-checkout', processCheckoutWorker);

// Rota de webhook aberta para a plataforma AbacatePay disparar os eventos
router.post('/webhook', express.json({ type: 'application/json' }), webhookAbacatePay);

export default router;
