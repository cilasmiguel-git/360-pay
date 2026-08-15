import { AbacatePay } from '@abacatepay/sdk';
import User from '../models/UserModel.js';
import Fatura from '../models/FaturaModel.js';
import dotenv from 'dotenv';
dotenv.config();

// Inicializa o SDK do AbacatePay
// Usa a chave da variável de ambiente, se existir
const getAbacate = () => {
  if (!process.env.ABACATEPAY_API_KEY || process.env.ABACATEPAY_API_KEY === 'sua_chave_aqui') {
    throw new Error('Chave do AbacatePay não configurada.');
  }
  return AbacatePay({ secret: process.env.ABACATEPAY_API_KEY });
};

// Obtém, valida ou cria o cliente no AbacatePay (via /customers/list e /customers/create)
const getOrCreateAbacateCustomer = async (abacate, user = {}, customCustomer = {}) => {
  let existingCustomerId = customCustomer.customerId || customCustomer.abacateCustomerId || user.abacateCustomerId;

  const rawName = customCustomer.name || customCustomer.nome || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.name || user.nome || (customCustomer.email || user.email ? (customCustomer.email || user.email).split('@')[0] : 'Cliente');
  const name = String(rawName).trim();
  const email = String(customCustomer.email || user.email || '').trim();

  // Limpa caracteres não numéricos do CPF/CNPJ e Telefone
  const rawCpf = String(customCustomer.taxId || customCustomer.cpf || user.CPF || '').replace(/\D/g, '');
  const rawPhone = String(customCustomer.cellphone || customCustomer.phone || user.phoneNumber || '').replace(/\D/g, '');

  const customerPayload = {
    name,
    email,
    taxId: rawCpf,
    cellphone: rawPhone
  };

  // 1. Consulta ativamente no AbacatePay se o cliente (ID, CPF ou E-mail) realmente existe na conta atual
  try {
    if (abacate.customers && typeof abacate.customers.list === 'function') {
      const listRes = await abacate.customers.list().catch(() => null);
      if (listRes?.success && Array.isArray(listRes.data)) {
        const matched = listRes.data.find(c =>
          (existingCustomerId && c.id === existingCustomerId) ||
          (rawCpf && c.taxId && c.taxId.replace(/\D/g, '') === rawCpf) ||
          (email && c.email && c.email.toLowerCase() === email.toLowerCase())
        );

        if (matched && matched.id) {
          console.log(`✅ [AbacatePay] Cliente validado com sucesso na API do AbacatePay: ${matched.id}`);
          if (user && user._id && user.abacateCustomerId !== matched.id && typeof user.save === 'function') {
            user.abacateCustomerId = matched.id;
            await user.save().catch(e => console.warn('Aviso ao salvar abacateCustomerId:', e.message));
          }
          return {
            customerId: matched.id,
            customerPayload: {
              name: matched.name || name,
              email: matched.email || email,
              taxId: matched.taxId ? matched.taxId.replace(/\D/g, '') : rawCpf,
              cellphone: matched.cellphone ? matched.cellphone.replace(/\D/g, '') : rawPhone
            },
            isExisting: true
          };
        }
      }
    }
  } catch (listErr) {
    console.warn("⚠️ [AbacatePay] Aviso ao consultar lista de clientes no AbacatePay:", listErr.message);
  }

  // 2. Se o cliente não existe no AbacatePay (ou se o ID gravado no banco era antigo/inválido), TENTA CRIÁ-LO AGORA!
  let lastError = null;
  if (name && email && rawCpf && rawPhone) {
    try {
      console.log(`⏳ [AbacatePay] Cliente não encontrado no AbacatePay. Registrando novo cliente com CPF (${rawCpf})...`);
      const customerRes = await abacate.customers.create(customerPayload);
      if (customerRes && customerRes.success && customerRes.data?.id) {
        console.log(`✅ [AbacatePay] Novo cliente criado com SUCESSO no AbacatePay! ID: ${customerRes.data.id}`);
        if (user && user._id && typeof user.save === 'function') {
          user.abacateCustomerId = customerRes.data.id;
          await user.save().catch(e => console.warn('Aviso ao atualizar abacateCustomerId:', e.message));
        }
        return { customerId: customerRes.data.id, customerPayload, isExisting: false };
      } else {
        lastError = typeof customerRes?.error === 'string' ? customerRes.error : JSON.stringify(customerRes?.error || customerRes);
        if (lastError && (lastError.toLowerCase().includes('already exists') || lastError.toLowerCase().includes('já existe') || lastError.toLowerCase().includes('duplicate'))) {
          const existingId = customerRes?.data?.id || customerRes?.error?.id;
          if (existingId) {
            return { customerId: existingId, customerPayload, isExisting: true };
          }
        }
      }
    } catch (err) {
      lastError = err.message;
      console.error("⚠️ [AbacatePay] Exceção ao registrar novo cliente:", err.message);
    }
  } else {
    console.warn("⚠️ [AbacatePay] Dados incompletos do cliente para criação prévia:", { name, email, rawCpf, rawPhone });
  }

  // 3. Fallback: Retorna o ID pré-existente (se houver) ou o payload para a tentativa final do checkout
  return { customerId: existingCustomerId, customerPayload, errorDetails: lastError, isExisting: false };
};

export const criarClienteAbacate = async (req, res) => {
  try {
    const { name, nome, email, taxId, cpf, cellphone, phone, userId } = req.body;

    let user = null;
    if (userId) {
      user = await User.findById(userId).catch(() => null);
    }

    const customCustomer = {
      name: name || nome,
      email,
      taxId: taxId || cpf,
      cellphone: cellphone || phone
    };

    const abacate = getAbacate();
    const { customerId, customerPayload, errorDetails, isExisting } = await getOrCreateAbacateCustomer(abacate, user || {}, customCustomer);

    if (!customerId) {
      return res.status(400).json({
        error: "Falha ao registrar cliente no AbacatePay.",
        details: errorDetails || "Verifique se Nome, Email, CPF (válido com dígitos de controle) e Celular com DDD foram fornecidos."
      });
    }

    if (user && customerId) {
      user.abacateCustomerId = customerId;
      await user.save().catch(e => console.warn('Aviso ao salvar abacateCustomerId:', e.message));
    }

    if (isExisting) {
      return res.status(200).json({
        message: "Nossa, esse cliente já existe!",
        alreadyExists: true,
        customerId,
        customer: customerPayload
      });
    }

    return res.status(201).json({
      message: "Cliente cadastrado no AbacatePay com sucesso!",
      alreadyExists: false,
      customerId,
      customer: customerPayload
    });
  } catch (error) {
    console.error("Erro ao cadastrar cliente no AbacatePay:", error);
    return res.status(500).json({ error: error.message || "Erro interno ao cadastrar cliente no AbacatePay" });
  }
};

export const gerarMensalidade = async (req, res) => {
  try {
    const { userId, valorBaseMensalidade, isRecorrente } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    if (!user.isAluno) {
      return res.status(400).json({ error: 'Mensalidade só pode ser gerada para alunos.' });
    }

    const valorComDesconto = user.aplicarDescontoMensalidade(valorBaseMensalidade);
    const valorCentavos = Math.round(valorComDesconto * 100);
    const abacate = getAbacate();
    
    // 1. Cria o Produto na AbacatePay
    const produtoPayload = {
      externalId: `mensalidade_${user._id}_${Date.now()}`,
      name: `Mensalidade Escolar - ${user.firstName}`,
      price: valorCentavos,
      currency: 'BRL',
      description: 'Mensalidade escolar mensal.'
    };

    if (isRecorrente) {
      produtoPayload.cycle = 'MONTHLY';
    }

    const produto = await abacate.products.create(produtoPayload);

    if (!produto.success) {
      return res.status(500).json({ error: 'Erro ao criar produto no AbacatePay', details: produto.error });
    }

    let transactionId = '';
    let transactionUrl = '';

    const { customerId, customerPayload } = await getOrCreateAbacateCustomer(abacate, user);

    if (isRecorrente) {
      // 2. Cria a Assinatura vinculando o Produto
      const subBody = {
        items: [{ id: produto.data.id, quantity: 1 }],
        methods: ['CARD'] // Recorrência exige cartão
      };
      if (customerId) subBody.customerId = customerId;
      else if (customerPayload) subBody.customer = customerPayload;

      const subscription = await abacate.subscriptions.create(subBody);

      if (!subscription.success) {
        return res.status(500).json({ error: 'Erro ao gerar assinatura no AbacatePay', details: subscription.error });
      }
      transactionId = subscription.data.id;
      transactionUrl = subscription.data.url;
    } else {
      // 2. Cria o Checkout avulso
      const chkBody = {
        items: [{ id: produto.data.id, quantity: 1 }]
      };
      if (customerId) chkBody.customerId = customerId;
      else if (customerPayload) chkBody.customer = customerPayload;

      let checkout = await abacate.checkouts.create(chkBody);

      if (!checkout.success && chkBody.customerId && customerPayload) {
        const errDetail = typeof checkout.error === 'string' ? checkout.error : JSON.stringify(checkout.error || '');
        if (errDetail.toLowerCase().includes('customer not found') || errDetail.toLowerCase().includes('not found')) {
          delete chkBody.customerId;
          chkBody.customer = customerPayload;
          checkout = await abacate.checkouts.create(chkBody);
        }
      }

      if (!checkout.success) {
        return res.status(500).json({ error: 'Erro ao gerar checkout no AbacatePay', details: checkout.error });
      }
      transactionId = checkout.data.id;
      transactionUrl = checkout.data.url;
    }

    // Criar fatura no banco de dados
    const fatura = new Fatura({
      usuarioId: user._id,
      abacatepayCheckoutId: transactionId,
      abacatepayPaymentUrl: transactionUrl,
      origemCobranca: 'mensalidade',
      descricao: `Mensalidade Escolar - ${user.firstName}`,
      valorOriginal: valorBaseMensalidade,
      valorComDesconto: valorComDesconto,
      vencimento: new Date(new Date().setMonth(new Date().getMonth() + 1)), // Exemplo: Vence em 1 mês
      tenantId: user.tenantId,
      status: 'PENDING',
      isRecorrente: !!isRecorrente
    });

    await fatura.save();

    res.status(200).json({
      message: 'Fatura de mensalidade gerada com sucesso!',
      fatura,
      checkoutUrl: transactionUrl
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Erro interno ao gerar mensalidade' });
  }
};

export const gerarContrato = async (req, res) => {
  try {
    const { userId, contratoId, isRecorrente } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const contrato = user.contratosServicos.find(c => c._id.toString() === contratoId);
    if (!contrato) {
      return res.status(404).json({ error: 'Contrato não encontrado para este usuário' });
    }

    const valorBase = contrato.valorBase;
    const valorComDesconto = user.aplicarDescontoContrato(contratoId, valorBase);
    const valorCentavos = Math.round(valorComDesconto * 100);
    const abacate = getAbacate();

    // 1. Cria o Produto na AbacatePay
    const produtoPayload = {
      externalId: `contrato_${contrato._id}_${Date.now()}`,
      name: `Serviço: ${contrato.descricao}`,
      price: valorCentavos,
      currency: 'BRL',
      description: 'Cobrança de contrato.'
    };

    if (isRecorrente) {
      produtoPayload.cycle = 'MONTHLY';
    }

    const produto = await abacate.products.create(produtoPayload);

    if (!produto.success) {
      return res.status(500).json({ error: 'Erro ao criar produto de contrato no AbacatePay', details: produto.error });
    }

    let transactionId = '';
    let transactionUrl = '';

    const { customerId, customerPayload } = await getOrCreateAbacateCustomer(abacate, user);

    if (isRecorrente) {
      const subBody = {
        items: [{ id: produto.data.id, quantity: 1 }],
        methods: ['CARD']
      };
      if (customerId) subBody.customerId = customerId;
      else if (customerPayload) subBody.customer = customerPayload;

      const subscription = await abacate.subscriptions.create(subBody);

      if (!subscription.success) {
        return res.status(500).json({ error: 'Erro ao gerar assinatura de contrato', details: subscription.error });
      }
      transactionId = subscription.data.id;
      transactionUrl = subscription.data.url;
    } else {
      const chkBody = {
        items: [{ id: produto.data.id, quantity: 1 }]
      };
      if (customerId) chkBody.customerId = customerId;
      else if (customerPayload) chkBody.customer = customerPayload;

      const checkout = await abacate.checkouts.create(chkBody);

      if (!checkout.success) {
        return res.status(500).json({ error: 'Erro ao gerar checkout de contrato', details: checkout.error });
      }
      transactionId = checkout.data.id;
      transactionUrl = checkout.data.url;
    }

    const fatura = new Fatura({
      usuarioId: user._id,
      abacatepayCheckoutId: transactionId,
      abacatepayPaymentUrl: transactionUrl,
      origemCobranca: 'contrato',
      contratoId: contrato._id,
      descricao: `Serviço: ${contrato.descricao}`,
      valorOriginal: valorBase,
      valorComDesconto: valorComDesconto,
      vencimento: new Date(new Date().setMonth(new Date().getMonth() + 1)),
      tenantId: user.tenantId,
      status: 'PENDING',
      isRecorrente: !!isRecorrente
    });

    await fatura.save();

    res.status(200).json({
      message: 'Fatura de contrato gerada com sucesso!',
      fatura,
      checkoutUrl: transactionUrl
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Erro interno ao gerar contrato' });
  }
};

/**
 * Taxa cobrada pelo gateway AbacatePay (3,5%)
 * Fórmula de Gross-Up: ValorFinal = ValorBase / (1 - 0,035)
 * Garantindo que, após a dedução de 3,5%, a loja receba 100% do valor base.
 */
export const calcularValorComTaxaAbacate = (valorBase, feePercentage = 3.5) => {
  if (!valorBase || valorBase <= 0) return 0;
  const rate = feePercentage / 100;
  return valorBase / (1 - rate);
};

export const gerarPedidoLoja = async (req, res) => {
  try {
    const { userId, descricaoPedido, itens, customer: customCustomer, methods } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    if (!itens || !Array.isArray(itens) || itens.length === 0) {
      return res.status(400).json({ error: 'Nenhum item enviado no pedido da lojinha.' });
    }

    const valorTotal = itens.reduce((acc, item) => acc + (item.preco * item.quantidade), 0);
    // Repasse da taxa de 3,5% do AbacatePay via cálculo proporcional (Gross-Up)
    const valorComTaxa = calcularValorComTaxaAbacate(valorTotal, 3.5);
    const valorCentavos = Math.round(valorComTaxa * 100);

    const abacate = getAbacate();

    console.log("📥 [gerarPedidoLoja] Requisição de checkout recebida:", {
      userId,
      customCustomer,
      methods,
      itensCount: itens?.length
    });

    const produto = await abacate.products.create({
      externalId: `loja_${user._id}_${Date.now()}`,
      name: descricaoPedido || 'Pedido Lojinha',
      price: valorCentavos,
      currency: 'BRL',
      description: 'Compra avulsa na lojinha.'
    });

    if (!produto.success) {
      console.error("❌ [AbacatePay] Erro ao criar produto:", produto.error);
      return res.status(500).json({ error: 'Erro ao criar pedido no AbacatePay', details: produto.error });
    }

    const { customerId, customerPayload } = await getOrCreateAbacateCustomer(abacate, user, customCustomer);

    console.log("👤 [AbacatePay] Dados do cliente resolvidos para pré-preenchimento:", {
      customerId,
      customerPayload
    });

    const chkBody = {
      items: [{ id: produto.data.id, quantity: 1 }]
    };
    if (methods && Array.isArray(methods) && methods.length > 0) {
      chkBody.methods = methods;
    }

    // Se temos o customerId, usamos ele. Além disso, se temos dados completos do cliente, passamos o objeto customer para garantir o pré-preenchimento e pular a tela de dados no AbacatePay!
    if (customerId) {
      chkBody.customerId = customerId;
    }
    if (customerPayload && customerPayload.taxId && customerPayload.cellphone) {
      chkBody.customer = customerPayload;
    } else if (!customerId && customerPayload) {
      chkBody.customer = customerPayload;
    }

    console.log("📦 [AbacatePay] Enviando chkBody para a API do AbacatePay:", JSON.stringify(chkBody, null, 2));

    let checkout = await abacate.checkouts.create(chkBody);

    // Fallback 1: Se o customerId salvo no banco não existir no AbacatePay (ex: chave de API ou ambiente alterado), tenta recriar com os dados do cliente
    if (!checkout.success && chkBody.customerId && customerPayload) {
      const errDetail = typeof checkout.error === 'string' ? checkout.error : JSON.stringify(checkout.error || '');
      if (errDetail.toLowerCase().includes('customer not found') || errDetail.toLowerCase().includes('not found')) {
        console.warn(`⚠️ [AbacatePay] customerId '${chkBody.customerId}' não encontrado no AbacatePay. Recriando checkout apenas com o payload do cliente...`);
        delete chkBody.customerId;
        chkBody.customer = customerPayload;
        checkout = await abacate.checkouts.create(chkBody);
      }
    }

    // Fallback 2: Se o método Cartão (CARD) não estiver liberado na conta do AbacatePay da loja, remove o filtro de métodos para garantir a geração do checkout
    if (!checkout.success && chkBody.methods && chkBody.methods.includes("CARD")) {
      const errDetail = typeof checkout.error === 'string' ? checkout.error : JSON.stringify(checkout.error || '');
      if (errDetail.toLowerCase().includes('card is not available') || errDetail.toLowerCase().includes('not available')) {
        console.warn(`⚠️ [AbacatePay] O método Cartão (CARD) não está liberado para esta loja no AbacatePay. Recriando checkout com as formas ativas da conta...`);
        delete chkBody.methods;
        checkout = await abacate.checkouts.create(chkBody);
      }
    }

    if (!checkout.success) {
      console.error("❌ [AbacatePay] Erro final ao gerar checkout:", checkout.error);
      return res.status(500).json({ error: 'Erro ao gerar checkout da lojinha', details: checkout.error });
    }

    console.log("✅ [AbacatePay] Checkout gerado com SUCESSO! URL:", checkout.data?.url);

    const fatura = new Fatura({
      usuarioId: user._id,
      abacatepayCheckoutId: checkout.data.id,
      abacatepayPaymentUrl: checkout.data.url,
      origemCobranca: 'loja',
      descricao: descricaoPedido || 'Pedido Lojinha',
      valorOriginal: valorTotal,
      valorComDesconto: Number(valorComTaxa.toFixed(2)),
      vencimento: new Date(new Date().setDate(new Date().getDate() + 3)), // Vence em 3 dias
      tenantId: user.tenantId,
      status: 'PENDING',
      isRecorrente: false,
      itensLoja: itens
    });

    await fatura.save();

    res.status(200).json({
      message: 'Fatura da lojinha gerada com sucesso!',
      fatura,
      checkoutUrl: checkout.data.url
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Erro interno ao gerar pedido da lojinha' });
  }
};

export const webhookAbacatePay = async (req, res) => {
  try {
    const event = req.body;
    
    // TODO: Adicionar validação de assinatura (X-Webhook-Signature) do AbacatePay.
    console.log('Webhook recebido:', event);

    // Supondo que o evento possua a estrutura { type: 'checkout.paid', data: { id: 'chk_123' } }
    if (event.type === 'checkout.paid') {
      const checkoutId = event.data.id;
      
      const fatura = await Fatura.findOne({ abacatepayCheckoutId: checkoutId });
      if (fatura) {
        fatura.status = 'PAID';
        await fatura.save();
        console.log(`Fatura ${fatura._id} marcada como PAGA!`);
      }
    }

    res.status(200).send('Webhook processado');
  } catch (error) {
    console.error(error);
    res.status(500).send('Erro no processamento do webhook');
  }
};
