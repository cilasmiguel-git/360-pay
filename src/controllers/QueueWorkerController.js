import { Receiver } from "@upstash/qstash";
import { AbacatePay } from "@abacatepay/sdk";
import User from "../models/UserModel.js";
import Fatura from "../models/FaturaModel.js";
import dotenv from "dotenv";

dotenv.config();

const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;

const receiver = (currentSigningKey && nextSigningKey) 
  ? new Receiver({ currentSigningKey, nextSigningKey })
  : null;

const getAbacate = () => {
  if (!process.env.ABACATEPAY_API_KEY || process.env.ABACATEPAY_API_KEY === 'sua_chave_aqui') {
    throw new Error('Chave do AbacatePay não configurada.');
  }
  return AbacatePay({ secret: process.env.ABACATEPAY_API_KEY });
};

/**
 * Worker HTTP consumido pelo QStash
 * Rota: POST /api/payments/worker/process-checkout
 */
export const processCheckoutWorker = async (req, res) => {
  try {
    // 1. Validação de Segurança (Assinatura do QStash)
    if (receiver) {
      const signature = req.headers["upstash-signature"];
      const rawBody = JSON.stringify(req.body);

      const isValid = await receiver.verify({
        signature,
        body: rawBody
      }).catch(() => false);

      if (!isValid) {
        console.warn("[QStash Worker] Requisição rejeitada: Assinatura inválida ou ausente.");
        return res.status(401).json({ error: "Assinatura de fila inválida" });
      }
    }

    const { faturaId, userId, customer, descricaoPedido, methods, itens } = req.body;

    if (!faturaId) {
      return res.status(400).json({ error: "faturaId é obrigatório na tarefa da fila." });
    }

    // 2. Trava de Idempotência: Verifica se a fatura já foi gerada
    const faturaExistente = await Fatura.findById(faturaId);
    if (faturaExistente && faturaExistente.abacatepayCheckoutId) {
      console.log(`[QStash Worker] Fatura #${faturaId} já processada anteriormente. Pulando.`);
      return res.status(200).json({ 
        message: "Fatura já processada (Idempotência mantida)", 
        checkoutUrl: faturaExistente.abacatepayPaymentUrl 
      });
    }

    // 3. Processa a geração da cobrança no AbacatePay
    console.log(`[QStash Worker] Processando cobrança para fatura #${faturaId}...`);
    const abacate = getAbacate();
    
    const valorTotal = Array.isArray(itens) 
      ? itens.reduce((acc, item) => acc + ((item.preco || item.precoSnapshot || 0) * (item.quantidade || 1)), 0)
      : 0;
    const valorCentavos = Math.round(valorTotal * 100);

    const produtoRes = await abacate.products.create({
      externalId: `loja_${userId || 'queue'}_${Date.now()}`,
      name: descricaoPedido || 'Pedido Lojinha (Fila)',
      price: valorCentavos,
      currency: 'BRL',
      description: 'Compra avulsa na lojinha.'
    });

    if (!produtoRes.success) {
      throw new Error(`Erro ao criar produto no AbacatePay: ${JSON.stringify(produtoRes.error)}`);
    }

    const chkBody = {
      items: [{ id: produtoRes.data.id, quantity: 1 }]
    };

    if (methods && Array.isArray(methods) && methods.length > 0) {
      chkBody.methods = methods;
    }

    if (customer) {
      if (customer.customerId) chkBody.customerId = customer.customerId;
      else chkBody.customer = customer;
    }

    const checkoutRes = await abacate.checkouts.create(chkBody);
    if (!checkoutRes.success || !checkoutRes.data) {
      throw new Error(`Erro ao criar checkout no AbacatePay: ${JSON.stringify(checkoutRes.error)}`);
    }

    const checkoutData = checkoutRes.data;

    // 4. Atualiza a fatura no banco de dados com os dados da cobrança
    const faturaAtualizada = await Fatura.findByIdAndUpdate(
      faturaId,
      {
        abacatepayCheckoutId: checkoutData.id || checkoutData._id,
        abacatepayPaymentUrl: checkoutData.url,
        status: "PENDING",
        updatedAt: new Date()
      },
      { new: true }
    );

    console.log(`[QStash Worker] Cobrança gerada com sucesso! CheckoutUrl: ${checkoutData.url}`);

    return res.status(200).json({
      status: "success",
      message: "Cobrança gerada via Fila QStash com sucesso!",
      checkoutUrl: checkoutData.url,
      fatura: faturaAtualizada
    });

  } catch (error) {
    console.error("[QStash Worker] Erro durante o processamento da tarefa:", error.message);
    return res.status(500).json({ error: "Erro interno no worker", details: error.message });
  }
};
