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

    const customerPayload = {
      email: user.email || 'nao-informado@escola.com',
      name: `${user.firstName} ${user.lastName}`,
      cpf: user.CPF || null,
      phone: user.phoneNumber || null
    };

    if (isRecorrente) {
      // 2. Cria a Assinatura vinculando o Produto
      const subscription = await abacate.subscriptions.create({
        items: [{ id: produto.data.id, quantity: 1 }],
        methods: ['CARD'], // Recorrência exige cartão
        customer: customerPayload
      });

      if (!subscription.success) {
        return res.status(500).json({ error: 'Erro ao gerar assinatura no AbacatePay', details: subscription.error });
      }
      transactionId = subscription.data.id;
      transactionUrl = subscription.data.url;
    } else {
      // 2. Cria o Checkout avulso
      const checkout = await abacate.checkouts.create({
        items: [{ id: produto.data.id, quantity: 1 }],
        customer: customerPayload
      });

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

    const customerPayload = {
      email: user.email || 'nao-informado@escola.com',
      name: `${user.firstName} ${user.lastName}`,
      cpf: user.CPF || null,
      phone: user.phoneNumber || null
    };

    if (isRecorrente) {
      const subscription = await abacate.subscriptions.create({
        items: [{ id: produto.data.id, quantity: 1 }],
        methods: ['CARD'],
        customer: customerPayload
      });

      if (!subscription.success) {
        return res.status(500).json({ error: 'Erro ao gerar assinatura de contrato', details: subscription.error });
      }
      transactionId = subscription.data.id;
      transactionUrl = subscription.data.url;
    } else {
      const checkout = await abacate.checkouts.create({
        items: [{ id: produto.data.id, quantity: 1 }],
        customer: customerPayload
      });

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

export const gerarPedidoLoja = async (req, res) => {
  try {
    const { userId, descricaoPedido, itens } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    if (!itens || !Array.isArray(itens) || itens.length === 0) {
      return res.status(400).json({ error: 'Nenhum item enviado no pedido da lojinha.' });
    }

    const valorTotal = itens.reduce((acc, item) => acc + (item.preco * item.quantidade), 0);
    const valorCentavos = Math.round(valorTotal * 100);

    const abacate = getAbacate();

    const produto = await abacate.products.create({
      externalId: `loja_${user._id}_${Date.now()}`,
      name: descricaoPedido || 'Pedido Lojinha',
      price: valorCentavos,
      currency: 'BRL',
      description: 'Compra avulsa na lojinha.'
    });

    if (!produto.success) {
      return res.status(500).json({ error: 'Erro ao criar pedido no AbacatePay', details: produto.error });
    }

    const checkout = await abacate.checkouts.create({
      items: [{ id: produto.data.id, quantity: 1 }],
      customer: {
        email: user.email || 'nao-informado@escola.com',
        name: `${user.firstName} ${user.lastName}`,
        cpf: user.CPF || null,
        phone: user.phoneNumber || null
      }
    });

    if (!checkout.success) {
      return res.status(500).json({ error: 'Erro ao gerar checkout da lojinha', details: checkout.error });
    }

    const fatura = new Fatura({
      usuarioId: user._id,
      abacatepayCheckoutId: checkout.data.id,
      abacatepayPaymentUrl: checkout.data.url,
      origemCobranca: 'loja',
      descricao: descricaoPedido || 'Pedido Lojinha',
      valorOriginal: valorTotal,
      valorComDesconto: valorTotal,
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
