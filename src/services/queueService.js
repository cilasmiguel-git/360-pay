import { Client } from "@upstash/qstash";
import dotenv from "dotenv";

dotenv.config();

const qstashToken = process.env.QSTASH_TOKEN;
const qstashClient = qstashToken ? new Client({ token: qstashToken }) : null;

/**
 * Publica uma tarefa de processamento de pagamento na fila do QStash.
 * Se o QStash não estiver configurado no .env, executa em modo fallback síncrono.
 * 
 * @param {Object} payload Dados do checkout / fatura
 * @param {string} destinationUrl URL pública do worker (ex: https://pay.educacaoalternativa360.com.br/api/payments/worker/process-checkout)
 * @returns {Promise<Object>} Resultado da publicação ou indicação de fallback
 */
export const publishPaymentTask = async (payload, destinationUrl) => {
  if (!qstashClient) {
    console.log("[QStash] Token não detectado no .env. Executando em modo síncrono (fallback).");
    return { status: "fallback", queued: false };
  }

  try {
    const res = await qstashClient.publishJSON({
      url: destinationUrl,
      body: payload,
      retries: 3, // Até 3 tentativas automáticas com exponential backoff
      headers: {
        "Content-Type": "application/json"
      }
    });

    console.log(`[QStash] Tarefa publicada na fila com sucesso! MessageId: ${res.messageId}`);
    return { status: "queued", messageId: res.messageId, queued: true };
  } catch (error) {
    console.error("[QStash] Erro ao publicar mensagem na fila:", error.message);
    // Em caso de falha de conexão com a fila, retorna fallback para não parar a venda
    return { status: "fallback_error", error: error.message, queued: false };
  }
};
